/** A session is one login lifetime: the service, the account and a lineage id
 * written at sign-in. Token rotation (this tab's or another tab's refresh)
 * keeps the lineage, so in-flight work survives it; signing in again, even as
 * the same account, or signing out replaces it. Tokens are credentials for the
 * Authorization header only, never part of the identity. */
export type ApiSession = {
  serviceBase: string;
  userId: string | null;
  lineage: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};
const LINEAGE = "sessionLineage";
// randomUUID needs a secure context; plain-http hosts still need a lineage.
const newLineage = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const KEYS = ["accessToken", "refreshToken", "userInfo", LINEAGE];
/** The one place that writes credentials at sign-in: a new lineage each time. */
export function storeSession(
  accessToken: string,
  refreshToken: string,
  user?: unknown,
) {
  localStorage.setItem(LINEAGE, newLineage());
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
  // A previous account's cached actor must not outlive the login that replaced it.
  if (user) localStorage.setItem("userInfo", JSON.stringify(user));
  else localStorage.removeItem("userInfo");
}
export function endSession() {
  for (const key of KEYS) localStorage.removeItem(key);
}
export function readApiSession(baseURL: string): ApiSession {
  const service = new URL(baseURL);
  service.hash = "";
  service.search = "";
  const session: ApiSession = {
    serviceBase: service.toString().replace(/\/$/, ""),
    userId: null,
    lineage: null,
    accessToken: null,
    refreshToken: null,
  };
  if (typeof window === "undefined") return session;
  // Each part is read alone: an unreadable actor cache must not hide the
  // credentials (refresh and sign-out still need them), nor the reverse.
  try {
    session.accessToken = localStorage.getItem("accessToken");
    session.refreshToken = localStorage.getItem("refreshToken");
    session.lineage = localStorage.getItem(LINEAGE);
  } catch {
    session.accessToken = session.refreshToken = session.lineage = null;
  }
  if (!session.lineage && (session.accessToken || session.refreshToken)) {
    // A login from before lineages existed: adopt it once.
    const adopted = newLineage();
    try {
      localStorage.setItem(LINEAGE, adopted);
      session.lineage = adopted;
    } catch {
      /* unwritable storage: the credentials still work, identity is unpinned */
    }
  }
  try {
    const actor = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id;
    session.userId = typeof actor === "string" && actor ? actor : null;
  } catch {
    session.userId = null;
  }
  return session;
}
/** The account the visible page was rendered for. Component mutations send it
 * as X-Prepix-Account-ID, so a click after another tab switched accounts is
 * refused locally (nothing is sent under the new account). */
let mutationAccount: string | null = null;
export const pinMutationAccount = (id: string | null) => {
  mutationAccount = id;
};
export const mutationHeaders = (account?: string | null) => {
  const id = account ?? mutationAccount;
  return id ? { headers: { "X-Prepix-Account-ID": id } } : {};
};
/** Did another tab change the account or login lifetime this view belongs to? */
export const accountMoved = (
  baseURL: string,
  userId: string | null,
  lineage: string | null,
) => {
  const now = readApiSession(baseURL);
  return now.userId !== userId || now.lineage !== lineage;
};
export function sameApiSession(a: ApiSession, b: ApiSession) {
  return (
    a.serviceBase === b.serviceBase &&
    a.userId === b.userId &&
    a.lineage === b.lineage
  );
}
const raisedHere = new WeakSet<object>();
const neverSent = new WeakSet<object>();
/** A refusal this browser raised itself. Its HTTP-like status lets reads drop
 * private content, but it says nothing about whether the server received the
 * request: a POST may already have succeeded behind it. */
export function localRefusal(code: string, status = 401, unsent = false) {
  const error = Object.assign(new Error(code), {
    response: { status, data: { message: code } },
  });
  raisedHere.add(error);
  if (unsent) neverSent.add(error);
  return error;
}
/** `unsent`: refused before the request left this browser (request interceptor). */
export const sessionChanged = (unsent = false) =>
  localRefusal("API_SESSION_CHANGED", 401, unsent);
export const notSent = (error: unknown) =>
  typeof error === "object" && error !== null && neverSent.has(error);
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
/** The original key may be freed on a FIRST attempt after the server's own
 * refusal or a refusal that never left this browser. */
export const freeable = (error: unknown) => serverRejected(error) || notSent(error);
const failedOnce = new WeakSet<object>();
/** In-memory intents (no stored attempt count): true only for the intent's
 * first failure, and only when that failure is a proven non-application. */
export function freeIntent(intent: object | null | undefined, error: unknown) {
  if (!intent) return false;
  const first = !failedOnce.has(intent);
  failedOnce.add(intent);
  return first && freeable(error);
}
/** Stored pending records after a failed send. Attempt 1: free on a proven
 * non-application. Later attempts: a definitive rejection cannot disprove an
 * earlier lost success, so free only when a lookup with the ORIGINAL key finds
 * no receipt (`lookup` returns the receipt and clears it itself when found).
 * A failing lookup keeps the record. */
export async function releaseRejected(
  error: unknown,
  attempts: number,
  first: () => Promise<unknown>,
  lookup: () => Promise<unknown>,
  discard: () => Promise<unknown>,
) {
  if (attempts <= 1) {
    if (freeable(error)) await first();
    return;
  }
  if (!serverRejected(error)) return;
  let receipt: unknown;
  try {
    receipt = await lookup();
  } catch {
    return;
  }
  if (!receipt) await discard();
}
/** Explicit "discard this change": cleared as confirmed when the receipt exists. */
export async function discardUnapplied(
  lookup: () => Promise<unknown>,
  discard: () => Promise<unknown>,
) {
  if (await lookup()) return false;
  await discard();
  return true;
}
