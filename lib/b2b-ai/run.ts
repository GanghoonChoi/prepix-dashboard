import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { apiClient } from "../api/client";
import type {
  CreateTeamAiQuote,
  TeamAiCapabilities,
  TeamAiExecution,
  TeamAiQuote,
  TeamAiQuoteReceipt,
  TeamAiResultContent,
  TeamAiResultDocument,
  TeamAiResultReceipt,
  TeamAiResultSummary,
  TeamAiSubmission,
  TeamFileVersionList,
} from "../api/generated/b2b";

// S30 (SOT: prepix-backend backend/docs/b2b-ai-execution.md). One run per
// service origin, account, team and project. The record is written before every
// request so a refresh or lost response resumes the original request key; the
// browser never invents a quote or job id.
export type AiScope = {
  origin: string;
  userId: string;
  workspaceId: string;
  projectId: string;
};
export type AiQuoteInput = Omit<CreateTeamAiQuote, "requestKey">;
export type AiRunRecord = {
  schema: 1;
  scope: AiScope;
  quote: { requestKey: string; input: AiQuoteInput; id?: string };
  submit?: {
    requestKey: string;
    approvedMaximumUnits: number;
    jobId?: string;
    /** Cancel request key, kept until the server answered it. */
    cancelKey?: string;
  };
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const scopeKey = (s: AiScope) =>
  `prepix-b2b-ai-run:${JSON.stringify([s.origin, s.userId, s.workspaceId, s.projectId])}`;
const sameScope = (a: AiScope, b: AiScope) => scopeKey(a) === scopeKey(b);

export function validRecord(raw: unknown, scope: AiScope): raw is AiRunRecord {
  const r = raw as AiRunRecord;
  return (
    !!r &&
    r.schema === 1 &&
    !!r.scope &&
    sameScope(r.scope, scope) &&
    uuid.test(r.quote?.requestKey ?? "") &&
    ["transcript", "vision", "agent"].includes(r.quote.input?.operation) &&
    Array.isArray(r.quote.input.inputVersionIds) &&
    r.quote.input.inputVersionIds.length > 0 &&
    r.quote.input.inputVersionIds.every((id) => uuid.test(id)) &&
    typeof r.quote.input.instruction === "string" &&
    (r.quote.id === undefined || uuid.test(r.quote.id)) &&
    (r.submit === undefined ||
      (!!r.quote.id &&
        uuid.test(r.submit.requestKey) &&
        Number.isSafeInteger(r.submit.approvedMaximumUnits) &&
        (r.submit.jobId === undefined || uuid.test(r.submit.jobId)) &&
        (r.submit.cancelKey === undefined ||
          (!!r.submit.jobId && uuid.test(r.submit.cancelKey)))))
  );
}

/** Small, per-scope record. Storage failure stops new requests instead of
 * running a job whose request key the browser could not keep. */
export const runStore = {
  read(scope: AiScope): AiRunRecord | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(scopeKey(scope));
    } catch {
      throw new Error("B2B_AI_RUN_STORAGE_UNAVAILABLE");
    }
    if (!raw) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (!validRecord(parsed, scope)) throw new Error("B2B_AI_RUN_RECORD_INVALID");
    return parsed;
  },
  write(record: AiRunRecord) {
    if (!validRecord(record, record.scope))
      throw new Error("B2B_AI_RUN_RECORD_INVALID");
    try {
      localStorage.setItem(scopeKey(record.scope), JSON.stringify(record));
    } catch {
      throw new Error("B2B_AI_RUN_STORAGE_UNAVAILABLE");
    }
    return record;
  },
  clear(scope: AiScope) {
    try {
      localStorage.removeItem(scopeKey(scope));
    } catch {
      throw new Error("B2B_AI_RUN_STORAGE_UNAVAILABLE");
    }
  },
};

export function aiApi(scope: AiScope) {
  const e = encodeURIComponent,
    team = `/workspaces/${e(scope.workspaceId)}/b2b`,
    root = `${team}/projects/${e(scope.projectId)}`;
  const options = (signal?: AbortSignal, timeout = 15_000) => {
    // A changed service origin or account must not continue this scope's run.
    if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
      throw new Error("B2B_FILE_SERVICE_CHANGED");
    return { signal, timeout, headers: { "X-Prepix-Account-ID": scope.userId } };
  };
  const get = async <T>(path: string, signal?: AbortSignal) =>
    (await apiClient.get<{ data: T }>(path, options(signal))).data.data;
  const post = async <T>(path: string, body: unknown, signal?: AbortSignal) =>
    (await apiClient.post<{ data: T }>(path, body, options(signal, 30_000)))
      .data.data;
  return {
    capabilities: (signal?: AbortSignal) =>
      get<TeamAiCapabilities>(`${team}/ai/capabilities`, signal),
    versions: (cursor?: string, signal?: AbortSignal) =>
      get<TeamFileVersionList>(
        `${root}/files?search=${cursor ? `&cursor=${e(cursor)}` : ""}`,
        signal,
      ),
    quote: (input: CreateTeamAiQuote, signal?: AbortSignal) =>
      post<TeamAiQuoteReceipt>(`${root}/ai/quotes`, input, signal),
    quoteByRequest: (requestKey: string, signal?: AbortSignal) =>
      get<TeamAiQuoteReceipt>(`${root}/ai/quote-requests/${e(requestKey)}`, signal),
    getQuote: (id: string, signal?: AbortSignal) =>
      get<{ quote: TeamAiQuote }>(`${root}/ai/quotes/${e(id)}`, signal),
    submit: (
      input: { requestKey: string; quoteId: string; approvedMaximumUnits: number },
      signal?: AbortSignal,
    ) => post<TeamAiSubmission>(`${root}/ai/jobs`, input, signal),
    submissionByRequest: (requestKey: string, signal?: AbortSignal) =>
      get<TeamAiSubmission>(`${root}/ai/submissions/${e(requestKey)}`, signal),
    execution: (jobId: string, signal?: AbortSignal) =>
      get<TeamAiExecution>(`${root}/ai/jobs/${e(jobId)}/execution`, signal),
    cancel: (jobId: string, requestKey: string) =>
      post<{ jobId: string }>(`${root}/ai/jobs/${e(jobId)}/cancel`, { requestKey }),
    result: (id: string, signal?: AbortSignal) =>
      get<TeamAiResultReceipt>(`${root}/ai/results/${e(id)}`, signal),
    content: (id: string, sha: string, signal?: AbortSignal) =>
      get<TeamAiResultContent>(
        `${root}/ai/results/${e(id)}/content?sha256=${e(sha)}`,
        signal,
      ),
  };
}

const status = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;
const message = (error: unknown) =>
  (error as { response?: { data?: { message?: unknown } } })?.response?.data
    ?.message;
/** Only the server's own "no such request" proves a request never landed. */
export const notReached = (error: unknown) =>
  status(error) === 404 &&
  ["B2B_AI_QUOTE_NOT_FOUND", "B2B_AI_SUBMISSION_NOT_FOUND"].includes(
    String(message(error)),
  );
/** A processed rejection: the same key would only be rejected again. */
export const rejected = (error: unknown) => {
  const s = status(error);
  return typeof s === "number" && s >= 400 && s < 500 && s !== 408 && s !== 429;
};

/** Responses must belong to this scope and, for a recovery, to its request. */
export function checkQuote(
  quote: TeamAiQuote,
  record: AiRunRecord,
): TeamAiQuote {
  const ids = quote?.inputs?.map((i) => i.versionId) ?? [];
  if (
    !quote ||
    !uuid.test(quote.id) ||
    quote.workspaceId !== record.scope.workspaceId ||
    quote.projectId !== record.scope.projectId ||
    quote.operation !== record.quote.input.operation ||
    JSON.stringify(ids) !== JSON.stringify(record.quote.input.inputVersionIds) ||
    (record.quote.id !== undefined && quote.id !== record.quote.id)
  )
    throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
  return quote;
}
export function checkExecution(
  view: TeamAiExecution,
  record: AiRunRecord,
): TeamAiExecution {
  if (
    !view?.job ||
    view.job.workspaceId !== record.scope.workspaceId ||
    view.job.projectId !== record.scope.projectId ||
    view.job.userId !== record.scope.userId ||
    view.job.quoteId !== record.quote.id ||
    (record.submit?.jobId !== undefined && view.job.id !== record.submit.jobId)
  )
    throw new Error("B2B_AI_RESPONSE_SCOPE_MISMATCH");
  return view;
}

/** Hash of the exact received bytes; display only after it matches the server summary. */
export function verifyResultContent(
  content: TeamAiResultContent,
  expected: TeamAiResultSummary,
): { bytes: Uint8Array; sha256: string; document: TeamAiResultDocument } {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(content.contentBase64), (c) => c.charCodeAt(0));
  } catch {
    throw new Error("B2B_AI_RESULT_HASH_MISMATCH");
  }
  const actual = bytesToHex(sha256(bytes));
  if (
    actual !== expected.sha256 ||
    content.result?.sha256 !== expected.sha256 ||
    content.result.id !== expected.id ||
    bytes.length !== expected.size
  )
    throw new Error("B2B_AI_RESULT_HASH_MISMATCH");
  let document: TeamAiResultDocument;
  try {
    document = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("B2B_AI_RESULT_FORMAT_INVALID");
  }
  if (
    document?.format !== "prepix.team-ai.result/v1" ||
    !Array.isArray(document.items) ||
    document.items.length !== expected.completedStages
  )
    throw new Error("B2B_AI_RESULT_FORMAT_INVALID");
  return { bytes, sha256: actual, document };
}
