import { apiClient } from "../client";
import {
  BrowserReviewStore,
  reviewHash,
  runReview,
  type ReviewApi,
  type ReviewRecord,
  type ReviewScope,
} from "../../b2b-reviews/operations";
import type {
  ReviewApproverCandidates,
  ReviewAudienceCandidates,
  ReviewDetail,
  ReviewDownload,
  ReviewList,
  ReviewMutationAction,
  ReviewMutationLookup,
  ReviewMutationResult,
  ReviewPlayback,
  ReviewPreview,
  ReviewShareLink,
  ReviewShareList,
  ReviewWorkList,
  ReviewWorkQuery,
} from "../generated/b2b";

// SOT: prepix-backend backend/docs/b2b-reviews.md
const e = encodeURIComponent;
export const reviewEvents = "prepix-b2b-review-changed";
/** Pending creates have no review yet; they share this placeholder id. */
export const NO_REVIEW = "00000000-0000-0000-0000-000000000000";
export const TOKEN_HEADER = "X-Prepix-Review-Share-Token";
const store = new BrowserReviewStore();
export const reviewStore = store;
export const origin = () => new URL(apiClient.defaults.baseURL!).origin;

/** Share tokens live only in this tab's session, never in IndexedDB or URLs
 * sent to a server. */
export const shareToken = {
  read: (shareId: string) => {
    try {
      return sessionStorage.getItem(`prepix-review-share:${shareId}`);
    } catch {
      return null;
    }
  },
  write: (shareId: string, token: string) => {
    try {
      sessionStorage.setItem(`prepix-review-share:${shareId}`, token);
    } catch {
      /* the page still works for this load */
    }
  },
};
const root = (s: ReviewScope) =>
  s.kind === "project"
    ? `/workspaces/${e(s.workspaceId)}/b2b/projects/${e(s.projectId)}`
    : `/b2b/review-shares/${e(s.shareId)}`;
function headers(s: ReviewScope, token?: string | null) {
  if (new URL(apiClient.defaults.baseURL!).origin !== s.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  return {
    "X-Prepix-Account-ID": s.userId,
    ...(s.kind === "share" ? { [TOKEN_HEADER]: token ?? "" } : {}),
  };
}
async function get<T extends { currentUserId: string }>(
  s: ReviewScope,
  path: string,
  token?: string | null,
) {
  const value = (
    await apiClient.get<{ data: T }>(path, {
      timeout: 15000,
      headers: headers(s, token),
    })
  ).data.data;
  if (value.currentUserId !== s.userId) throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  return value;
}
async function post<T>(s: ReviewScope, path: string, body: object, token?: string | null) {
  return (
    await apiClient.post<{ data: T }>(path, body, {
      timeout: 30000,
      headers: headers(s, token),
    })
  ).data.data;
}
function mutationPath(r: ReviewRecord) {
  const s = r.scope;
  const review =
    s.kind === "project" ? `${root(s)}/reviews/${e(s.reviewId)}` : root(s);
  const t = e(r.target ?? "");
  switch (r.action) {
    case "create":
      return `${root(s)}/reviews`;
    case "round":
      return `${review}/rounds`;
    case "approver":
      return `${review}/approver`;
    case "audience":
      return `${review}/audience`;
    case "decide":
      return `${review}/decisions`;
    case "cancel":
      return `${review}/decisions/${t}/cancel`;
    case "comment":
      return `${review}/comments`;
    case "edit":
      return `${review}/comments/${t}/revisions`;
    case "convert":
      return `${review}/comments/${t}/request`;
    case "share":
      return `${review}/shares`;
    case "revoke":
      return `${review}/shares/${t}/revoke`;
  }
}
export function reviewApi(s: ReviewScope, token?: string | null): ReviewApi {
  return {
    operation: async (r, signal) => {
      const query = new URLSearchParams({
        inputHash: reviewHash(r),
        ...(r.target ? { target: r.target } : {}),
      }).toString();
      const path =
        s.kind === "project"
          ? `${root(s)}/review-operations/${r.action}/${e(r.input.requestKey)}?${query}`
          : `${root(s)}/operations/${r.action}/${e(r.input.requestKey)}?${query}`;
      return (
        await apiClient.get<{ data: ReviewMutationLookup }>(path, {
          signal,
          timeout: 15000,
          headers: headers(s, token),
        })
      ).data.data;
    },
    apply: (r, signal) =>
      apiClient.post(mutationPath(r), r.input, {
        signal,
        timeout: 30000,
        headers: headers(r.scope, token),
      }),
  };
}
/** Default target per action, matching the server's receipt key. */
function defaultTarget(s: ReviewScope, action: ReviewMutationAction) {
  return action === "create" ? undefined : s.reviewId;
}
export const reviewsService = {
  mutate: async (
    s: ReviewScope,
    action: ReviewMutationAction,
    input: object & { requestKey: string },
    target?: string,
    token?: string | null,
  ): Promise<ReviewMutationResult> => {
    const record: ReviewRecord = {
      schema: 1,
      scope: s,
      action,
      input: input as ReviewRecord["input"],
      attempts: 0,
      ...((target ?? defaultTarget(s, action))
        ? { target: target ?? defaultTarget(s, action) }
        : {}),
    };
    try {
      return await runReview(
        record,
        reviewApi(s, token),
        store,
        new AbortController().signal,
      );
    } finally {
      window.dispatchEvent(new CustomEvent(reviewEvents, { detail: s }));
    }
  },
  pending: (s: ReviewScope) => store.list(s),
  list: (s: ReviewScope, query: { search?: string; cursor?: string }) =>
    get<ReviewList>(
      s,
      `${root(s)}/reviews?${new URLSearchParams(
        Object.entries(query).filter(([, v]) => v) as [string, string][],
      )}`,
    ),
  detail: (s: ReviewScope, round?: number, token?: string | null) =>
    s.kind === "project"
      ? get<ReviewDetail>(
          s,
          `${root(s)}/reviews/${e(s.reviewId)}${round ? `?round=${round}` : ""}`,
        )
      : get<ReviewDetail>(s, root(s), token),
  playback: (s: ReviewScope, round: number, token?: string | null) =>
    s.kind === "project"
      ? post<ReviewPlayback>(s, `${root(s)}/reviews/${e(s.reviewId)}/playback`, {
          round,
        })
      : post<ReviewPlayback>(s, `${root(s)}/playback`, {}, token),
  previewStatus: (s: ReviewScope, versionId: string) =>
    get<{ currentUserId: string; preview: ReviewPreview }>(
      s,
      `${root(s)}/review-previews?versionId=${e(versionId)}`,
    ),
  preparePreview: (s: ReviewScope, versionId: string) =>
    post<{ currentUserId: string; preview: ReviewPreview }>(
      s,
      `${root(s)}/review-previews`,
      { versionId },
    ),
  previewPlayback: (s: ReviewScope, versionId: string) =>
    post<ReviewPlayback>(s, `${root(s)}/review-previews/${e(versionId)}/playback`, {}),
  audienceCandidates: (s: ReviewScope) =>
    get<ReviewAudienceCandidates>(s, `${root(s)}/review-audience-candidates`),
  candidates: (s: ReviewScope) =>
    get<ReviewApproverCandidates>(
      s,
      `${root(s)}/reviews/${e(s.reviewId)}/approver-candidates`,
    ),
  shares: (s: ReviewScope) =>
    get<ReviewShareList>(s, `${root(s)}/reviews/${e(s.reviewId)}/shares`),
  shareLink: async (s: ReviewScope, shareId: string) =>
    (
      await apiClient.get<{ data: ReviewShareLink }>(
        `${root(s)}/reviews/${e(s.reviewId)}/shares/${e(shareId)}/link`,
        { timeout: 15000, headers: headers(s) },
      )
    ).data.data,
  download: (s: ReviewScope, token: string | null) =>
    post<ReviewDownload>(s, `${root(s)}/download`, {}, token),
  work: (
    s: { origin: string; userId: string; workspaceId: string; projectId?: string },
    query: ReviewWorkQuery,
  ) =>
    get<ReviewWorkList>(
      { ...s, kind: "project", projectId: s.projectId ?? NO_REVIEW, reviewId: NO_REVIEW },
      `/workspaces/${e(s.workspaceId)}/b2b${s.projectId ? `/projects/${e(s.projectId)}` : ""}/review-work?${new URLSearchParams(
        Object.entries(query).filter(([, v]) => v) as [string, string][],
      )}`,
    ),
};
