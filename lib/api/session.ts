/** Credentials are a single request lifetime. An actor id alone is insufficient:
 * signing in again as the same person also invalidates old refresh work. */
export type ApiSession = {
  serviceBase: string;
  userId: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};
export function readApiSession(baseURL: string): ApiSession {
  const service = new URL(baseURL);
  service.hash = "";
  service.search = "";
  const session: ApiSession = {
    serviceBase: service.toString().replace(/\/$/, ""),
    userId: null,
    accessToken: null,
    refreshToken: null,
  };
  if (typeof window === "undefined") return session;
  try {
    const actor = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id;
    session.userId = typeof actor === "string" && actor ? actor : null;
    session.accessToken = localStorage.getItem("accessToken");
    session.refreshToken = localStorage.getItem("refreshToken");
  } catch {
    session.userId = null;
    session.accessToken = null;
    session.refreshToken = null;
    // An unconfirmed session must never refresh or clear another actor's keys.
  }
  return session;
}
export function sameApiSession(a: ApiSession, b: ApiSession) {
  return (
    a.serviceBase === b.serviceBase &&
    a.userId === b.userId &&
    a.accessToken === b.accessToken &&
    a.refreshToken === b.refreshToken
  );
}
export const apiSessionKey = (s: ApiSession) =>
  JSON.stringify([s.serviceBase, s.userId, s.accessToken, s.refreshToken]);
const raisedHere = new WeakSet<object>();
/** A refusal this browser raised itself. Its HTTP-like status lets reads drop
 * private content, but it says nothing about whether the server received the
 * request: a POST may already have succeeded behind it. */
export function localRefusal(code: string, status = 401) {
  const error = Object.assign(new Error(code), {
    response: { status, data: { message: code } },
  });
  raisedHere.add(error);
  return error;
}
export const sessionChanged = () => localRefusal("API_SESSION_CHANGED");
const status = (error: unknown) =>
  (error as { response?: { status?: unknown } } | null)?.response?.status;
/** Reads: a 4xx answer (the server's, or this browser's own fence) ends access
 * to what was read, so the old private content goes. Timeouts and throttling
 * do not. */
export function accessEnded(error: unknown) {
  const s = status(error);
  return typeof s === "number" && s >= 400 && s < 500 && s !== 408 && s !== 429;
}
/** Mutations: only the server's own refusal proves the request created
 * nothing, so only it may free the original request key. A local refusal
 * leaves the outcome unknown; the key stays until a receipt lookup with that
 * same key, under the same account, settles it. One policy for every path. */
export const serverRejected = (error: unknown) =>
  accessEnded(error) &&
  !(typeof error === "object" && error !== null && raisedHere.has(error));
