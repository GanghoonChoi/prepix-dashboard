import { apiClient } from "../client";
import type { TeamStatementDetail, TeamStatementList } from "../generated/b2b";
import { scopeKey } from "../../b2b-statements/statements";
import type { StatementScope, StatementReceipt, StatementIssueLookup } from "../../b2b-statements/statements";

const e = encodeURIComponent;
const fail = (code: string) => Object.assign(new Error(code), { response: { status: 401, data: { message: code } } });
/** A fixed origin/account/team owns every call, including its delayed body. */
export function statementApi(scope: StatementScope, signal?: AbortSignal | (() => AbortSignal), assertCurrent?: () => void) {
  const base = `/workspaces/${e(scope.workspaceId)}/b2b/statements`;
  const getSignal = () => typeof signal === "function" ? signal() : signal;
  const assertScope = (record?: {scope: StatementScope}) => {
    assertCurrent?.();
    getSignal()?.throwIfAborted();
    if (record && scopeKey(record.scope) !== scopeKey(scope)) throw fail("B2B_STATEMENT_SCOPE_CHANGED");
    if (!scope.userId) throw fail("B2B_ACCOUNT_REQUIRED");
    if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin) throw fail("B2B_STATEMENT_SERVICE_CHANGED");
    if (typeof window !== "undefined") {
      let actor: string | undefined;
      try { actor = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id; } catch { /* refuse corrupt account cache */ }
      if (!actor || actor !== scope.userId) throw fail("B2B_STATEMENT_ACCOUNT_CHANGED");
      const route = `/dashboard/workspaces/${scope.workspaceId}`;
      if (window.location.pathname !== route && !window.location.pathname.startsWith(`${route}/`)) throw fail("B2B_STATEMENT_SCOPE_CHANGED");
    }
  };
  const headers = () => ({ "X-Prepix-Account-ID": scope.userId });
  const json = async <T>(method: "get" | "post", path: string, body?: unknown) => {
    assertScope();
    const ownedSignal = getSignal();
    try {
      const value = (await apiClient.request<{ data: T }>({ method, url: path, data: body, headers: headers(), signal: ownedSignal, timeout: method === "post" ? 30_000 : 15_000 })).data.data;
      ownedSignal?.throwIfAborted();
      assertScope();
      const actor = (value as {currentUserId?: string})?.currentUserId;
      if (actor && actor !== scope.userId) throw fail("B2B_STATEMENT_ACCOUNT_CHANGED");
      return value;
    } catch (error) { assertScope(); throw error; }
  };
  return {
    assertScope,
    list: () => json<TeamStatementList>("get", base),
    detail: (month: string) => json<TeamStatementDetail>("get", `${base}/${e(month)}`),
    issue: (month: string, requestKey: string) => json<StatementReceipt>("post", `${base}/${e(month)}/issue`, { requestKey }),
    operation: (month: string, requestKey: string, hash: string) => json<StatementIssueLookup>("get", `${base}/${e(month)}/issue-operations/${e(requestKey)}?inputHash=${e(hash)}`),
    /** Error bodies are decoded only while their original scope is current. */
    pdf: async (revisionId: string) => {
      assertScope();
      const ownedSignal = getSignal();
      try {
        const bytes = (await apiClient.get<ArrayBuffer>(`${base}/revisions/${e(revisionId)}/pdf`, { timeout: 30_000, responseType: "arraybuffer", headers: headers(), signal: ownedSignal })).data;
        ownedSignal?.throwIfAborted();
        assertScope();
        return bytes;
      } catch (error) {
        assertScope();
        const response = (error as { response?: { data?: unknown } }).response;
        if (response?.data instanceof ArrayBuffer) {
          try { response.data = JSON.parse(new TextDecoder().decode(response.data)); }
          catch { response.data = undefined; }
        }
        throw error;
      }
    },
  };
}
// Compatibility facade for callers outside the mounted statement view.
const scoped = (workspaceId: string, userId: string) => statementApi({ origin: new URL(apiClient.defaults.baseURL!).origin, workspaceId, userId });
export const statementService = {
  list: (id: string, account: string) => scoped(id, account).list(),
  detail: (id: string, month: string, account: string) => scoped(id, account).detail(month),
  issue: (id: string, month: string, requestKey: string, account: string) => scoped(id, account).issue(month, requestKey),
  pdf: (id: string, revisionId: string, account: string) => scoped(id, account).pdf(revisionId),
};
