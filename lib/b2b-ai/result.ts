import type {
  TeamAiJob,
  TeamAiQuote,
  TeamAiResultContent,
  TeamAiResultDocument,
  TeamAiResultSummary,
  TeamAiRoughcutResultDocument,
  TeamAiTranscriptOutput,
  TeamAiVisionOutput,
} from "../api/generated/b2b";
import type { AiScope } from "./run";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
export type AiResultDocument =
  TeamAiResultDocument | TeamAiRoughcutResultDocument;
export type AiResultBasis = {
  scope: AiScope;
  job: TeamAiJob;
  quote: TeamAiQuote;
};
export type VerifiedAiResult = {
  bytes: Uint8Array;
  sha256: string;
  document: AiResultDocument;
};
const invalid = () => new Error("B2B_AI_RESULT_FORMAT_INVALID");
const only = (value: unknown, required: string[], optional: string[] = []) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  required.every((k) => Object.hasOwn(value, k)) &&
  Object.keys(value).every((k) => required.includes(k) || optional.includes(k));
const text = (v: unknown, max: number, empty = false) =>
  typeof v === "string" && v.length <= max && (empty || v.trim() !== "");
const integer = (v: unknown, min = 0) =>
  Number.isSafeInteger(v) && (v as number) >= min;
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const finite = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function spans(
  rows: unknown,
  duration: number,
  valid: (row: Record<string, unknown>) => boolean,
) {
  if (!Array.isArray(rows) || rows.length > 100000) return false;
  let last = 0;
  for (const row of rows as Record<string, unknown>[]) {
    if (
      !row ||
      !finite(row.start, 0, duration) ||
      !finite(row.end, row.start as number, duration) ||
      (row.start as number) < last ||
      !valid(row)
    )
      return false;
    last = row.start as number;
  }
  return true;
}
function transcript(o: TeamAiTranscriptOutput, duration: number) {
  return (
    only(o, [
      "kind",
      "provider",
      "language",
      "durationMs",
      "segments",
      "fullText",
    ]) &&
    o.kind === "transcript" &&
    text(o.provider, 40) &&
    text(o.language, 10) &&
    o.durationMs === duration &&
    text(o.fullText, 10000000, true) &&
    spans(
      o.segments,
      duration / 1000,
      (s) =>
        only(s, ["start", "end", "text"], ["speaker", "words"]) &&
        text(s.text, 100000, true) &&
        (s.speaker === undefined || text(s.speaker, 40)) &&
        (s.words === undefined ||
          (spans(
            s.words,
            s.end as number,
            (w) =>
              only(w, ["start", "end", "text"]) && text(w.text, 1000, true),
          ) &&
            (s.words as { start: number }[]).every(
              (w) => w.start >= (s.start as number),
            ))),
    )
  );
}
function vision(o: TeamAiVisionOutput, duration: number) {
  return (
    only(o, ["kind", "provider", "model", "summary", "segments"]) &&
    o.kind === "vision" &&
    text(o.provider, 40) &&
    text(o.model, 80) &&
    text(o.summary, 4000) &&
    Array.isArray(o.segments) &&
    o.segments.length >= 1 &&
    o.segments.length <= 1000 &&
    spans(
      o.segments,
      duration / 1000,
      (s) =>
        only(s, ["start", "end", "description"], ["tags"]) &&
        text(s.description, 2000) &&
        (s.tags === undefined ||
          (Array.isArray(s.tags) &&
            s.tags.length <= 20 &&
            s.tags.every((t) => text(t, 40)))),
    )
  );
}
function basisValid(b: AiResultBasis, meta: TeamAiResultSummary) {
  const { scope, job, quote: q } = b;
  return (
    scope.userId !== "" &&
    job.workspaceId === scope.workspaceId &&
    job.projectId === scope.projectId &&
    job.userId === scope.userId &&
    q.workspaceId === scope.workspaceId &&
    q.projectId === scope.projectId &&
    q.id === job.quoteId &&
    q.jobId === job.id &&
    q.operation === job.operation &&
    meta.jobId === job.id &&
    integer(job.maximumUnits, 1) &&
    q.maximumUnits === job.maximumUnits &&
    integer(job.confirmedUnits) &&
    meta.units === job.confirmedUnits &&
    meta.units <= job.maximumUnits &&
    integer(meta.completedStages, 1) &&
    integer(meta.totalStages, 1) &&
    meta.completedStages <= meta.totalStages &&
    Array.isArray(q.inputs) &&
    q.inputs.length > 0 &&
    q.inputs.every(
      (i, n) =>
        i.ordinal === n &&
        hash(i.sha256) &&
        integer(i.size, 1) &&
        integer(i.durationMs, 1),
    ) &&
    new Set(q.inputs.map((i) => i.versionId)).size === q.inputs.length
  );
}
function roughcut(
  doc: TeamAiRoughcutResultDocument,
  b: AiResultBasis,
  meta: TeamAiResultSummary,
) {
  const q = b.quote,
    limits = q.roughcut;
  if (
    !limits ||
    !text(limits.model, 80) ||
    !integer(limits.maxClips, 1) ||
    !integer(limits.maxTimelineDurationMs, 1) ||
    !hash(q.instructionSha256) ||
    meta.format !== "prepix.team-ai.roughcut/v1" ||
    meta.complete !== true ||
    meta.completedStages !== 1 ||
    meta.totalStages !== 1 ||
    !only(doc, [
      "format",
      "operation",
      "workspaceId",
      "projectId",
      "jobId",
      "quoteId",
      "catalogVersion",
      "instructionSha256",
      "complete",
      "inputs",
      "plan",
    ]) ||
    doc.format !== meta.format ||
    doc.operation !== "agent" ||
    q.operation !== "agent" ||
    doc.workspaceId !== b.scope.workspaceId ||
    doc.projectId !== b.scope.projectId ||
    doc.jobId !== b.job.id ||
    doc.quoteId !== q.id ||
    doc.catalogVersion !== q.catalogVersion ||
    doc.instructionSha256 !== q.instructionSha256 ||
    doc.complete !== true ||
    !Array.isArray(doc.inputs) ||
    doc.inputs.length !== q.inputs.length
  )
    return false;
  if (
    !doc.inputs.every(
      (i, n) =>
        only(i, [
          "ordinal",
          "inputVersionId",
          "inputSha256",
          "size",
          "durationMs",
        ]) &&
        i.ordinal === q.inputs[n].ordinal &&
        i.inputVersionId === q.inputs[n].versionId &&
        i.inputSha256 === q.inputs[n].sha256 &&
        i.size === q.inputs[n].size &&
        i.durationMs === q.inputs[n].durationMs,
    )
  )
    return false;
  const plan = doc.plan;
  if (
    !only(plan, ["kind", "provider", "model", "summary", "clips"]) ||
    plan.kind !== "roughcut" ||
    plan.provider !== "gemini" ||
    plan.model !== limits.model ||
    !text(plan.summary, 4000) ||
    !Array.isArray(plan.clips) ||
    plan.clips.length < 1 ||
    plan.clips.length > limits.maxClips
  )
    return false;
  let timeline = 0;
  // Source intervals can overlap or repeat. Array order, not source time, is
  // the editor's timeline order; never sort or merge the provider's edit plan.
  for (const clip of plan.clips) {
    if (!only(clip, ["inputVersionId", "inputSha256", "startMs", "endMs"]))
      return false;
    const input = q.inputs.find(
      (i) =>
        i.versionId === clip.inputVersionId && i.sha256 === clip.inputSha256,
    );
    if (
      !input ||
      !integer(clip.startMs) ||
      !integer(clip.endMs) ||
      clip.endMs <= clip.startMs ||
      clip.endMs > input.durationMs
    )
      return false;
    timeline += clip.endMs - clip.startMs;
    if (!integer(timeline, 1) || timeline > limits.maxTimelineDurationMs)
      return false;
  }
  return true;
}
function analysis(
  doc: TeamAiResultDocument,
  b: AiResultBasis,
  meta: TeamAiResultSummary,
) {
  const q = b.quote;
  if (
    q.operation === "agent" ||
    meta.format !== "prepix.team-ai.result/v1" ||
    !only(doc, [
      "format",
      "operation",
      "catalogVersion",
      "complete",
      "items",
    ]) ||
    doc.format !== meta.format ||
    doc.operation !== q.operation ||
    doc.catalogVersion !== q.catalogVersion ||
    doc.complete !== meta.complete ||
    !Array.isArray(doc.items) ||
    doc.items.length !== meta.completedStages ||
    meta.totalStages !== q.inputs.length ||
    (doc.complete && doc.items.length !== q.inputs.length)
  )
    return false;
  let last = -1;
  return doc.items.every((i) => {
    if (
      !only(i, ["ordinal", "inputVersionId", "inputSha256", "output"]) ||
      !integer(i.ordinal) ||
      i.ordinal <= last
    )
      return false;
    last = i.ordinal;
    const input = q.inputs[i.ordinal];
    return (
      !!input &&
      i.inputVersionId === input.versionId &&
      i.inputSha256 === input.sha256 &&
      (q.operation === "transcript"
        ? transcript(i.output as TeamAiTranscriptOutput, input.durationMs)
        : vision(i.output as TeamAiVisionOutput, input.durationMs))
    );
  });
}
/** Decode only exact server bytes. Roughcut additionally requires the original
 * quote's immutable manifest, instruction hash and catalogue limits. */
export function verifyAiResult(
  content: TeamAiResultContent,
  expected: TeamAiResultSummary,
  basis?: AiResultBasis,
): VerifiedAiResult {
  let bytes: Uint8Array;
  try {
    if (
      !integer(expected.size, 1) ||
      typeof content.contentBase64 !== "string" ||
      content.contentBase64.length !== 4 * Math.ceil(expected.size / 3)
    )
      throw new Error();
    bytes = Uint8Array.from(atob(content.contentBase64), (c) =>
      c.charCodeAt(0),
    );
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
  let document: AiResultDocument;
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    document = JSON.parse(decoded);
    if (JSON.stringify(document) !== decoded) throw invalid();
  } catch {
    throw invalid();
  }
  if (!basis) {
    if (
      document?.format !== "prepix.team-ai.result/v1" ||
      !Array.isArray(document.items) ||
      document.items.length !== expected.completedStages
    )
      throw invalid();
    return { bytes, sha256: actual, document };
  }
  for (const field of [
    "jobId",
    "format",
    "mediaType",
    "size",
    "sha256",
    "complete",
    "completedStages",
    "totalStages",
    "units",
  ] as const)
    if (content.result[field] !== expected[field]) throw invalid();
  if (
    expected.mediaType !== "application/json" ||
    !basisValid(basis, expected) ||
    !document ||
    (document.format === "prepix.team-ai.roughcut/v1"
      ? !roughcut(document, basis, expected)
      : document.format === "prepix.team-ai.result/v1"
        ? !analysis(document, basis, expected)
        : true)
  )
    throw invalid();
  return { bytes, sha256: actual, document };
}
