import axios, { type InternalAxiosRequestConfig } from "axios";
import { loginHref } from "../auth-entry";
import { readReturnTo } from "../return-to";
import { clearSignedIn } from "../account-hint";
import {
  readApiSession,
  sameApiSession,
  apiSessionKey,
  sessionChanged,
  type ApiSession,
} from "./session";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/v2`,
  headers: { "Content-Type": "application/json" },
});
type SessionRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _prepixRequestId?: number;
};
type RefreshFlight = {
  original: ApiSession;
  updated?: ApiSession;
  promise: Promise<ApiSession>;
};
const flights = new Map<string, RefreshFlight>();
const requestSessions = new WeakMap<InternalAxiosRequestConfig, ApiSession>();
const activeRequests = new Map<
  number,
  { session: ApiSession; retrySession?: ApiSession }
>();
let requestSequence = 0;
const current = () => readApiSession(apiClient.defaults.baseURL!);
/** The URL axios itself sends: a leading "/" stays under the /v2 base. */
const target = (config: InternalAxiosRequestConfig, session: ApiSession) =>
  new URL(apiClient.getUri({ url: config.url, baseURL: session.serviceBase }));
const owns = (session: ApiSession) => sameApiSession(session, current());
const assertOwns = (session: ApiSession) => {
  if (!owns(session)) throw sessionChanged();
};
function currentRotation(session: ApiSession, needed?: Set<string>) {
  const seen = new Set<string>();
  let value = session;
  while (true) {
    const key = apiSessionKey(value);
    needed?.add(key);
    if (owns(value)) return value;
    if (seen.has(key)) return null;
    seen.add(key);
    const updated = flights.get(key)?.updated;
    if (!updated) return null;
    value = updated;
  }
}
function pruneFlights() {
  // Keep only rotations needed by requests still in flight, including a
  // chain through two rotations. Do not retain obsolete credentials forever.
  const needed = new Set<string>();
  for (const active of activeRequests.values())
    currentRotation(active.session, needed);
  for (const key of flights.keys()) if (!needed.has(key)) flights.delete(key);
}
function finish(request?: SessionRequest) {
  if (request?._prepixRequestId !== undefined) {
    activeRequests.delete(request._prepixRequestId);
    pruneFlights();
  }
}
apiClient.interceptors.request.use((config) => {
  const request = config as SessionRequest;
  let session: ApiSession;
  if (request._retry) {
    const grant = activeRequests.get(request._prepixRequestId!)?.retrySession;
    if (!grant) throw sessionChanged();
    assertOwns(grant);
    session = grant;
  } else {
    pruneFlights();
    session = readApiSession(config.baseURL ?? apiClient.defaults.baseURL!);
    assertOwns(session);
  }
  requestSessions.set(request, session);
  if (target(config, session).origin !== new URL(session.serviceBase).origin)
    throw sessionChanged();
  const account = config.headers.get("X-Prepix-Account-ID");
  if (account && (!session.userId || account !== session.userId))
    throw sessionChanged();
  if (session.accessToken)
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  if (!request._retry) {
    request._prepixRequestId = ++requestSequence;
    activeRequests.set(request._prepixRequestId, { session });
  }
  return config;
});
function handleAuthFailure(session: ApiSession) {
  if (typeof window === "undefined" || !session.userId || !owns(session))
    return;
  const path = window.location.pathname;
  const returnTo =
    path === "/login" || path === "/signup"
      ? readReturnTo()
      : path + window.location.search;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userInfo");
  clearSignedIn();
  window.location.replace(loginHref({ returnTo }));
}
async function rotate(flight: RefreshFlight): Promise<ApiSession> {
  const original = flight.original;
  assertOwns(original);
  if (!original.userId || !original.refreshToken) throw sessionChanged();
  // Plain axios avoids retrying the refresh endpoint. It addresses the service
  // captured by the original request, never a newly selected account/service.
  let data: { data?: { accessToken?: unknown; refreshToken?: unknown } };
  try {
    data = (
      await axios.post(`${original.serviceBase}/auth/refresh`, {
        refreshToken: original.refreshToken,
      })
    ).data;
  } catch {
    assertOwns(original);
    // Axios config.data contains the refresh credential. Never forward that
    // request or a cause containing it to generic caller error logging.
    throw new Error("API_REFRESH_FAILED");
  }
  assertOwns(original);
  const accessToken = data?.data?.accessToken,
    refreshToken = data?.data?.refreshToken;
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    typeof refreshToken !== "string" ||
    !refreshToken
  )
    throw new Error("API_REFRESH_RESPONSE_INVALID");
  const updated = { ...original, accessToken, refreshToken };
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  assertOwns(updated);
  flight.updated = updated;
  return updated;
}
function refresh(session: ApiSession) {
  const key = apiSessionKey(session),
    existing = flights.get(key);
  const rotated = currentRotation(session);
  if (existing && rotated) {
    if (!owns(session)) return Promise.resolve(rotated);
    return existing.promise;
  }
  assertOwns(session);
  const flight: RefreshFlight = {
    original: session,
    promise: undefined as unknown as Promise<ApiSession>,
  };
  flights.set(key, flight);
  flight.promise = rotate(flight).catch((error) => {
    if (flights.get(key) === flight) flights.delete(key);
    throw error;
  });
  return flight.promise;
}
function responseStillOwned(request: SessionRequest, responseData: unknown) {
  const original = requestSessions.get(request);
  if (!original) return false;
  const now = current();
  if (currentRotation(original)) return true;
  // Only a profile bootstrap can establish a previously unknown actor. A
  // second profile read may finish after the first wrote that same identity;
  // its unchanged credentials and returned id must both prove the actor.
  const path = target(request, original).pathname;
  const data = responseData as { data?: { id?: unknown } };
  return (
    !original.userId &&
    !!original.accessToken &&
    !!now.userId &&
    original.serviceBase === now.serviceBase &&
    original.accessToken === now.accessToken &&
    original.refreshToken === now.refreshToken &&
    request.method?.toLowerCase() === "get" &&
    ["/v2/users/profile", "/v2/auth/me"].includes(path) &&
    data?.data?.id === now.userId
  );
}
apiClient.interceptors.response.use(
  (response) => {
    const request = response.config as SessionRequest;
    try {
      if (!responseStillOwned(request, response.data)) throw sessionChanged();
      return response;
    } finally {
      finish(request);
    }
  },
  async (error) => {
    const original = error.config as SessionRequest | undefined;
    if (error.response?.status !== 401 || !original || original._retry) {
      finish(original);
      return Promise.reject(error);
    }
    const session = requestSessions.get(original);
    // Anonymous/null-actor errors, another login (including the same actor with
    // new tokens), and another service have no authority to refresh or log out.
    if (!session?.userId) {
      finish(original);
      return Promise.reject(error);
    }
    if (!currentRotation(session)) {
      finish(original);
      return Promise.reject(sessionChanged());
    }
    original._retry = true;
    if (!session.refreshToken) {
      handleAuthFailure(session);
      finish(original);
      return Promise.reject(error);
    }
    let updated: ApiSession;
    try {
      updated = await refresh(session);
      assertOwns(updated);
    } catch (refreshError) {
      handleAuthFailure(session);
      finish(original);
      return Promise.reject(refreshError);
    }
    const active = activeRequests.get(original._prepixRequestId!);
    if (!active) {
      finish(original);
      return Promise.reject(sessionChanged());
    }
    active.retrySession = updated;
    original.headers.Authorization = `Bearer ${updated.accessToken}`;
    // Return the retry outside the refresh catch. Its unrelated server failure
    // must not log out a successfully refreshed, currently valid session.
    return apiClient(original).finally(() => finish(original));
  },
);
