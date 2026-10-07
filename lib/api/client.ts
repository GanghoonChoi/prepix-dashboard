import axios, { type InternalAxiosRequestConfig } from "axios";
import { loginHref } from "../auth-entry";
import { readReturnTo } from "../return-to";
import { clearSignedIn } from "../account-hint";
import {
  readApiSession,
  sameApiSession,
  sessionChanged,
  endSession,
  type ApiSession,
} from "./session";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"
).replace(/\/+$/, "");
export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/v2`,
  headers: { "Content-Type": "application/json" },
});
type SessionRequest = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _prepixRequestId?: number;
};
const requestSessions = new WeakMap<InternalAxiosRequestConfig, ApiSession>();
// Opaque ids keep the snapshot out of anything a caller can read or forge.
const activeRequests = new Map<number, { session: ApiSession; retried?: boolean }>();
let requestSequence = 0;
const current = () => readApiSession(apiClient.defaults.baseURL!);
/** The URL axios itself sends: a leading "/" stays under the /v2 base. */
const target = (config: InternalAxiosRequestConfig, session: ApiSession) =>
  new URL(apiClient.getUri({ url: config.url, baseURL: session.serviceBase }));
const owns = (session: ApiSession) => sameApiSession(session, current());
const assertOwns = (session: ApiSession, unsent = false) => {
  if (!owns(session)) throw sessionChanged(unsent);
};
function finish(request?: SessionRequest) {
  if (request?._prepixRequestId !== undefined)
    activeRequests.delete(request._prepixRequestId);
}
apiClient.interceptors.request.use((config) => {
  const request = config as SessionRequest;
  // A retry was sent once already, so refusing it is not an "unsent" proof.
  const unsent = !request._retry;
  let session: ApiSession;
  if (request._retry) {
    const first = activeRequests.get(request._prepixRequestId!)?.session;
    if (!first) throw sessionChanged();
    assertOwns(first);
    session = current();
  } else {
    session = readApiSession(config.baseURL ?? apiClient.defaults.baseURL!);
    assertOwns(session, true);
  }
  requestSessions.set(request, session);
  if (target(config, session).origin !== new URL(session.serviceBase).origin)
    throw sessionChanged(unsent);
  const account = config.headers.get("X-Prepix-Account-ID");
  if (account && (!session.userId || account !== session.userId))
    throw sessionChanged(unsent);
  if (session.accessToken)
    config.headers.Authorization = `Bearer ${session.accessToken}`;
  if (!request._retry) {
    request._prepixRequestId = ++requestSequence;
    activeRequests.set(request._prepixRequestId, { session });
  }
  return config;
});
/** The refresh failed or there is nothing to refresh with: end THIS session
 * only. A newer login in this or another tab is never touched. */
function handleAuthFailure(session: ApiSession) {
  if (typeof window === "undefined" || !owns(session)) return;
  const path = window.location.pathname;
  const returnTo =
    path === "/login" || path === "/signup"
      ? readReturnTo()
      : path + window.location.search;
  endSession();
  clearSignedIn();
  window.location.replace(loginHref({ returnTo }));
}
/** One refresh per lineage and expired access token, across tabs: whoever
 * holds the lock re-reads storage first, so a rotation another tab already
 * made is adopted instead of spending the (single-use) refresh token twice. */
const flights = new Map<string, Promise<ApiSession>>();
async function rotate(session: ApiSession, failed: string | null) {
  assertOwns(session);
  const now = current();
  if (now.accessToken && now.accessToken !== failed) return now;
  if (!now.refreshToken) throw new Error("API_REFRESH_UNAVAILABLE");
  // Plain axios avoids retrying the refresh endpoint. It addresses the service
  // captured by the original request, never a newly selected service.
  let data: { data?: { accessToken?: unknown; refreshToken?: unknown } };
  try {
    data = (
      await axios.post(`${session.serviceBase}/auth/refresh`, {
        refreshToken: now.refreshToken,
      })
    ).data;
  } catch {
    assertOwns(session);
    // Axios config.data contains the refresh credential. Never forward that
    // request or a cause containing it to generic caller error logging.
    throw new Error("API_REFRESH_FAILED");
  }
  assertOwns(session);
  const accessToken = data?.data?.accessToken,
    refreshToken = data?.data?.refreshToken;
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    typeof refreshToken !== "string" ||
    !refreshToken
  )
    throw new Error("API_REFRESH_RESPONSE_INVALID");
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  return current();
}
function refresh(session: ApiSession): Promise<ApiSession> {
  const failed = session.accessToken,
    key = JSON.stringify([session.serviceBase, session.lineage, failed]);
  const existing = flights.get(key);
  if (existing) return existing;
  const run = () => rotate(session, failed);
  // ponytail: without Web Locks only this tab is single-flight.
  const flight: Promise<ApiSession> = Promise.resolve(
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`prepix-refresh:${session.lineage}`, run)
      : run(),
  ).finally(() => flights.delete(key));
  flights.set(key, flight);
  return flight;
}
function responseStillOwned(request: SessionRequest, responseData: unknown) {
  const original = requestSessions.get(request);
  if (!original) return false;
  if (owns(original)) return true;
  // Only a profile bootstrap can establish a previously unknown actor. The
  // login lineage and service must be unchanged and the returned id must be
  // the one now stored.
  const now = current();
  const root = new URL(original.serviceBase).pathname.replace(/\/$/, "");
  const path = target(request, original).pathname;
  const data = responseData as { data?: { id?: unknown } };
  return (
    !original.userId &&
    !!original.accessToken &&
    !!now.userId &&
    original.serviceBase === now.serviceBase &&
    original.lineage === now.lineage &&
    request.method?.toLowerCase() === "get" &&
    [`${root}/users/profile`, `${root}/auth/me`].includes(path) &&
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
    // An anonymous request (no credentials at all) has nothing to refresh.
    if (!session || (!session.accessToken && !session.refreshToken)) {
      finish(original);
      return Promise.reject(error);
    }
    // Another login, logout or service has no authority to refresh or log out.
    if (!owns(session)) {
      finish(original);
      return Promise.reject(sessionChanged());
    }
    original._retry = true;
    let updated: ApiSession;
    try {
      updated = await refresh(session);
      assertOwns(updated);
    } catch (refreshError) {
      handleAuthFailure(session);
      finish(original);
      return Promise.reject(
        (refreshError as Error)?.message === "API_REFRESH_UNAVAILABLE"
          ? error
          : refreshError,
      );
    }
    original.headers.Authorization = `Bearer ${updated.accessToken}`;
    // Return the retry outside the refresh catch. Its unrelated server failure
    // must not log out a successfully refreshed, currently valid session.
    return apiClient(original).finally(() => finish(original));
  },
);
