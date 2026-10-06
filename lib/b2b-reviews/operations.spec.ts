import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  checkReview,
  reviewHash,
  runReview,
  sameIntent,
  scopeKey,
  validRecord,
  type ReviewApi,
  type ReviewDraft,
  type ReviewRecord,
  type ReviewScope,
  type ReviewStore,
} from "./operations";
import type { ReviewMutationResult } from "../api/generated/b2b";

const reviewId = randomUUID();
const project: ReviewScope = {
  origin: "https://api.example.test",
  userId: randomUUID(),
  kind: "project",
  workspaceId: randomUUID(),
  projectId: randomUUID(),
  reviewId,
};
const share: ReviewScope = {
  origin: "https://api.example.test",
  userId: project.userId,
  kind: "share",
  shareId: randomUUID(),
  reviewId,
};
const comment = (scope: ReviewScope = project): ReviewRecord => ({
  schema: 1,
  scope,
  action: "comment",
  target: reviewId,
  input: {
    requestKey: randomUUID(),
    round: 1,
    versionId: randomUUID(),
    startMs: 1000,
    endMs: 4000,
    body: "Trim the pause",
  },
  attempts: 0,
});
class MemoryStore implements ReviewStore {
  rows = new Map<string, ReviewRecord>();
  private key = (r: ReviewRecord) =>
    JSON.stringify([scopeKey(r.scope), r.action, r.target ?? null]);
  async list(scope: ReviewScope) {
    return [...this.rows.values()].filter(
      (r) => scopeKey(r.scope) === scopeKey(scope),
    );
  }
  async prepare(r: ReviewRecord) {
    const prior = this.rows.get(this.key(r));
    if (prior && !sameIntent(prior, r))
      throw new Error("B2B_FILE_OPERATION_PENDING");
    this.rows.set(this.key(r), prior ?? r);
    return prior ?? r;
  }
  async start(r: ReviewRecord) {
    const next = { ...this.rows.get(this.key(r))!, attempts: r.attempts + 1 };
    this.rows.set(this.key(r), next);
    return next;
  }
  async finish(r: ReviewRecord) {
    this.rows.delete(this.key(r));
  }
  async rejectFirst(r: ReviewRecord) {
    if (r.attempts === 1) this.rows.delete(this.key(r));
  }
  async draft() {
    return null as ReviewDraft | null;
  }
  async saveDraft() {}
}
const receipt = (): ReviewMutationResult => ({
  requestId: randomUUID(),
  review: { id: reviewId, revision: 0, round: 1 },
  commentId: randomUUID(),
  commentRevision: 1,
});

test("records are valid only in their own service, account and access path", () => {
  const r = comment();
  assert.equal(validRecord(r, project), true);
  assert.equal(validRecord(r, { ...project, userId: randomUUID() }), false);
  assert.equal(validRecord(r, { ...project, origin: "https://other.test" }), false);
  assert.equal(validRecord(r, share), false);
  assert.equal(validRecord(comment(share), share), true);
  // Share access never carries lead actions.
  assert.equal(
    validRecord({ ...comment(share), action: "share" }, share),
    false,
  );
  assert.equal(
    validRecord({ ...r, input: { ...r.input, endMs: 1000 } }, project),
    false,
  );
  assert.equal(validRecord({ ...r, input: { ...r.input, body: "  " } }, project), false);
});

test("the request hash matches the server's canonical SHA-256", () => {
  const r = comment();
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(r.input).sort(([a], [b]) => a.localeCompare(b))),
  );
  assert.equal(
    reviewHash(r),
    createHash("sha256").update(canonical).digest("hex"),
  );
});

test("a lost response is confirmed by the same key and never sent twice", async () => {
  const store = new MemoryStore();
  const r = comment();
  let posts = 0;
  let stored: ReviewMutationResult | null = null;
  const api: ReviewApi = {
    operation: async () => ({ currentUserId: project.userId, receipt: stored }),
    apply: async () => {
      posts++;
      stored = receipt();
      throw new Error("socket hang up");
    },
  };
  await assert.rejects(runReview(r, api, store, new AbortController().signal), /socket/);
  assert.equal(posts, 1);
  assert.equal((await store.list(project)).length, 1);
  // Reload: lookup finds the original receipt, clears it, sends nothing.
  const found = await checkReview(
    (await store.list(project))[0],
    api,
    store,
    new AbortController().signal,
  );
  assert.equal(found?.commentId, stored!.commentId);
  assert.equal(posts, 1);
  assert.equal((await store.list(project)).length, 0);
});

test("a different intent cannot take a pending slot; another account's receipt is refused", async () => {
  const store = new MemoryStore();
  const first = comment();
  const api: ReviewApi = {
    operation: async () => ({ currentUserId: project.userId, receipt: null }),
    apply: async () => {
      throw new Error("timeout");
    },
  };
  await assert.rejects(runReview(first, api, store, new AbortController().signal));
  await assert.rejects(
    runReview(
      { ...comment(), input: { ...first.input, requestKey: randomUUID(), body: "Other" } },
      api,
      store,
      new AbortController().signal,
    ),
    /B2B_FILE_OPERATION_PENDING/,
  );
  await assert.rejects(
    checkReview(
      first,
      { ...api, operation: async () => ({ currentUserId: randomUUID(), receipt: null }) },
      store,
      new AbortController().signal,
    ),
    /B2B_FILE_ACCOUNT_CHANGED/,
  );
});

test("a definitive first rejection clears the record; a receipt for another review is invalid", async () => {
  const store = new MemoryStore();
  const r = comment();
  const rejected: ReviewApi = {
    operation: async () => ({ currentUserId: project.userId, receipt: null }),
    apply: async () => {
      throw Object.assign(new Error("422"), { response: { status: 422 } });
    },
  };
  await assert.rejects(runReview(r, rejected, store, new AbortController().signal));
  assert.equal((await store.list(project)).length, 0);
  const wrong: ReviewApi = {
    operation: async () => ({
      currentUserId: project.userId,
      receipt: { ...receipt(), review: { id: randomUUID(), revision: 0, round: 1 } },
    }),
    apply: async () => undefined,
  };
  await assert.rejects(
    runReview(comment(), wrong, store, new AbortController().signal),
    /B2B_FILE_OPERATION_INVALID/,
  );
});

test("audience publication is project-scoped and malformed audience records cannot be replayed", () => {
  const approverUserId = randomUUID();
  const r: ReviewRecord = { ...comment(), action: "audience", input: { requestKey: randomUUID(), revision: 1, audienceUserIds: [approverUserId], approverUserId, reason: "Client handoff" } };
  assert.equal(validRecord(r, project), true);
  assert.equal(validRecord({ ...r, scope: share }, share), false);
  assert.equal(validRecord({ ...r, input: { ...r.input, audienceUserIds: [] } }, project), false);
  assert.equal(validRecord({ ...r, input: { ...r.input, audienceUserIds: [approverUserId, approverUserId] } }, project), false);
  assert.equal(validRecord({ ...r, input: { ...r.input, approverUserId: randomUUID() } }, project), false);
  assert.equal(validRecord({ ...r, input: { ...r.input, reason: " " } }, project), false);
});

test("a lost audience-change response recovers the same round receipt after reload", async () => {
  const approverUserId = randomUUID();
  const r: ReviewRecord = { ...comment(), action: "audience", input: { requestKey: randomUUID(), revision: 1, audienceUserIds: [approverUserId], approverUserId, reason: "Client handoff" } };
  const store = new MemoryStore();
  let sends = 0;
  let saved: ReviewMutationResult | null = null;
  const api: ReviewApi = {
    operation: async (record) => { assert.equal(record.input.requestKey, r.input.requestKey); return { currentUserId: project.userId, receipt: saved }; },
    apply: async () => { sends++; saved = { requestId: randomUUID(), review: { id: reviewId, revision: 2, round: 2 } }; throw new Error("lost audience response"); },
  };
  await assert.rejects(runReview(r, api, store, new AbortController().signal), /lost audience/);
  const recovered = await runReview({ ...r, input: { ...r.input, requestKey: randomUUID() } }, api, store, new AbortController().signal);
  assert.equal(recovered.review.round, 2);
  assert.equal(sends, 1);
  assert.equal((await store.list(project)).length, 0);
});
