import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  checkExecution,
  checkQuote,
  notReached,
  rejected,
  runStore,
  validRecord,
  verifyResultContent,
  type AiRunRecord,
} from "./run";
import type {
  TeamAiExecution,
  TeamAiQuote,
  TeamAiResultSummary,
} from "../api/generated/b2b";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = {
  origin: "http://127.0.0.1:3528",
  userId: id(1),
  workspaceId: id(2),
  projectId: id(3),
};
const record: AiRunRecord = {
  schema: 1,
  scope,
  quote: {
    requestKey: id(4),
    input: {
      operation: "transcript",
      inputVersionIds: [id(5)],
      instruction: "받아 적기",
      language: "ko",
    },
    id: id(6),
  },
  submit: { requestKey: id(7), approvedMaximumUnits: 3, jobId: id(8) },
};

test("records are bound to service, account, team and project", () => {
  assert.equal(validRecord(record, scope), true);
  for (const other of [
    { ...scope, origin: "http://127.0.0.1:3308" },
    { ...scope, userId: id(9) },
    { ...scope, workspaceId: id(9) },
    { ...scope, projectId: id(9) },
  ])
    assert.equal(validRecord(record, other), false);
  assert.equal(validRecord({ ...record, submit: { ...record.submit!, approvedMaximumUnits: 1.5 } }, scope), false);
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  runStore.write(record);
  assert.deepEqual(runStore.read(scope), record);
  assert.equal(runStore.read({ ...scope, userId: id(9) }), null);
  runStore.clear(scope);
  assert.equal(runStore.read(scope), null);
});

test("only the server's not-found for the original key means the request never landed", () => {
  const error = (status: number, message: string) => ({
    response: { status, data: { message } },
  });
  assert.equal(notReached(error(404, "B2B_AI_SUBMISSION_NOT_FOUND")), true);
  assert.equal(notReached(error(404, "B2B_PROJECT_NOT_FOUND")), false);
  assert.equal(notReached(new Error("Network Error")), false);
  assert.equal(rejected(error(409, "B2B_AI_QUOTE_EXPIRED")), true);
  assert.equal(rejected(error(429, "x")), false);
  assert.equal(rejected(new Error("timeout")), false);
});

test("responses from another scope or a different request are refused", () => {
  const quote = {
    id: id(6),
    workspaceId: id(2),
    projectId: id(3),
    operation: "transcript",
    inputs: [{ versionId: id(5) }],
  } as TeamAiQuote;
  assert.equal(checkQuote(quote, record), quote);
  assert.throws(() => checkQuote({ ...quote, projectId: id(9) }, record), /SCOPE_MISMATCH/);
  assert.throws(
    () => checkQuote({ ...quote, inputs: [{ versionId: id(9) }] } as TeamAiQuote, record),
    /SCOPE_MISMATCH/,
  );
  const view = {
    job: { id: id(8), workspaceId: id(2), projectId: id(3), userId: id(1), quoteId: id(6) },
  } as TeamAiExecution;
  assert.equal(checkExecution(view, record), view);
  assert.throws(
    () => checkExecution({ job: { ...view.job, userId: id(9) } } as TeamAiExecution, record),
    /SCOPE_MISMATCH/,
  );
});

test("results are shown only when the received bytes hash to the server summary", () => {
  const document = {
    format: "prepix.team-ai.result/v1",
    operation: "transcript",
    catalogVersion: "v",
    complete: true,
    items: [{ ordinal: 0, inputVersionId: id(5), inputSha256: "a".repeat(64), output: {} }],
  };
  const bytes = Buffer.from(JSON.stringify(document));
  const summary = {
    id: id(10),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    size: bytes.length,
    completedStages: 1,
  } as TeamAiResultSummary;
  const content = { result: summary, contentBase64: bytes.toString("base64") };
  assert.equal(verifyResultContent(content, summary).document.items.length, 1);
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 2] ^= 1;
  assert.throws(
    () => verifyResultContent({ ...content, contentBase64: tampered.toString("base64") }, summary),
    /HASH_MISMATCH/,
  );
  assert.throws(
    () => verifyResultContent(content, { ...summary, sha256: "0".repeat(64) }),
    /HASH_MISMATCH/,
  );
});
