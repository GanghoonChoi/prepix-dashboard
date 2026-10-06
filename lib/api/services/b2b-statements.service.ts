import { apiClient } from "../client";
import type {
  TeamStatementDetail,
  TeamStatementIssueResult,
  TeamStatementList,
} from "../generated/b2b";

const e = encodeURIComponent;
const base = (id: string) => `/workspaces/${e(id)}/b2b/statements`;
// Every call carries the signed-in account it was started for; the server
// refuses it if the session has since switched to another account.
// A call without an account id is refused here, never sent unpinned.
const pinned = (account: string) => {
  if (!account)
    throw Object.assign(new Error("B2B_ACCOUNT_REQUIRED"), {
      response: { status: 401, data: { message: "B2B_ACCOUNT_REQUIRED" } },
    });
  return { "X-Prepix-Account-ID": account };
};

export const statementService = {
  list: async (id: string, account: string) =>
    (
      await apiClient.get<{ data: TeamStatementList }>(base(id), {
        timeout: 15_000,
        headers: pinned(account),
      })
    ).data.data,
  detail: async (id: string, month: string, account: string) =>
    (
      await apiClient.get<{ data: TeamStatementDetail }>(
        `${base(id)}/${e(month)}`,
        { timeout: 15_000, headers: pinned(account) },
      )
    ).data.data,
  issue: async (id: string, month: string, requestKey: string, account: string) =>
    (
      await apiClient.post<{
        data: TeamStatementIssueResult & { requestId: string };
      }>(
        `${base(id)}/${e(month)}/issue`,
        { requestKey },
        { timeout: 30_000, headers: pinned(account) },
      )
    ).data.data,
  /** Raw bytes; a JSON error body is decoded so its code reaches the screen. */
  pdf: async (id: string, revisionId: string, account: string) => {
    try {
      return (
        await apiClient.get<ArrayBuffer>(
          `${base(id)}/revisions/${e(revisionId)}/pdf`,
          {
            timeout: 30_000,
            responseType: "arraybuffer",
            headers: pinned(account),
          },
        )
      ).data;
    } catch (error) {
      const response = (error as { response?: { data?: unknown } }).response;
      if (response?.data instanceof ArrayBuffer)
        try {
          response.data = JSON.parse(new TextDecoder().decode(response.data));
        } catch {
          response.data = undefined;
        }
      throw error;
    }
  },
};
