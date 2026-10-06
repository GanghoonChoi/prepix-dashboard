import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChanged } from "../api/session";
import { randomUUID, createHash } from "node:crypto";
import { checkPublication, publicationHash, runPublication, samePublicationIntent, type PublicationApi, type PublicationOperation, type PublicationScope, type PublicationStore } from "./operations";
import type { PublicationMutationLookup } from "../api/generated/b2b";
const scope: PublicationScope = { origin: "http://localhost:3318", userId: randomUUID(), workspaceId: randomUUID(), projectId: randomUUID() };
const operation = (): PublicationOperation => { const approver = randomUUID(); return { schema: 1, scope, action: "publish", target: randomUUID(), versionId: randomUUID(), attempts: 0, input: { requestKey: randomUUID(), revision: 3, audienceUserIds: [approver], approverUserId: approver } }; };
const empty = (): PublicationMutationLookup => ({ currentUserId: scope.userId, state: "not_received", result: null });
const receipt = (r: PublicationOperation): PublicationMutationLookup => ({ currentUserId: r.scope.userId, state: "completed", result: { requestId: randomUUID(), publicationId: r.target!, versionId: r.versionId!, reviewId: randomUUID(), projectRevision: 4, state: "published" } });
class Memory implements PublicationStore {
  row?: PublicationOperation;
  async list() { return this.row ? [this.row] : []; }
  async prepare(r: PublicationOperation) { if (this.row && !samePublicationIntent(this.row, r)) throw new Error("pending"); return this.row ??= r; }
  async start(r: PublicationOperation) { if (!this.row || this.row.input.requestKey !== r.input.requestKey) throw new Error("pending"); return this.row = { ...this.row, attempts: this.row.attempts + 1 }; }
  async finish(r: PublicationOperation, assertCurrent?: () => void) { assertCurrent?.(); if (this.row?.input.requestKey === r.input.requestKey) this.row = undefined; }
  async rejectFirst(r: PublicationOperation, assertCurrent?: () => void) { assertCurrent?.(); if (this.row?.input.requestKey === r.input.requestKey && this.row.attempts === 1 && r.attempts === 1) this.row = undefined; }
}
test("publication input hash matches the server's canonical original body", () => {
  const r = operation(), { requestKey, revision, audienceUserIds, approverUserId } = r.input;
  const sorted = { approverUserId, audienceUserIds, requestKey, revision };
  assert.equal(publicationHash(r), createHash("sha256").update(JSON.stringify(sorted)).digest("hex"));
});
test("lost POST and unavailable lookup retain original key; remount resolves without another publish", async () => {
  const r = operation(), store = new Memory(); let sends = 0, saved: PublicationMutationLookup | null = null, offline = false;
  const api: PublicationApi = { lookup: async () => { if (offline) throw new Error("offline"); return saved ?? empty(); }, apply: async (original) => { sends++; saved = receipt(original); offline = true; throw new Error("lost response"); } };
  await assert.rejects(runPublication(r, api, store), /offline/);
  assert.equal(store.row?.input.requestKey, r.input.requestKey);
  offline = false;
  const recovered = await runPublication({ ...r, input: { ...r.input, requestKey: randomUUID() } }, api, store);
  assert.equal(recovered.reviewId, saved!.result!.reviewId); assert.equal(sends, 1); assert.equal(store.row, undefined);
});
test("only a scoped definite not_received permits resending the same original key", async () => {
  const r = operation(), store = new Memory(); let sentKey = "", saved: PublicationMutationLookup | null = null;
  const api: PublicationApi = { lookup: async () => saved ?? empty(), apply: async (original) => { sentKey = original.input.requestKey; saved = receipt(original); } };
  store.row = { ...r, attempts: 1 };
  await runPublication({ ...r, input: { ...r.input, requestKey: randomUUID() } }, api, store);
  assert.equal(sentKey, r.input.requestKey);
});
test("unknown, unauthorized and another account lookups never send or discard the durable record", async () => {
  for (const lookup of [async () => { throw new Error("denied"); }, async () => ({ ...empty(), currentUserId: randomUUID() }), async () => ({ ...empty(), state: "completed" as const })]) {
    const r = operation(), store = new Memory(); let sends = 0;
    await assert.rejects(runPublication(r, { lookup, apply: async () => { sends++; } }, store));
    assert.equal(sends, 0); assert.equal(store.row?.input.requestKey, r.input.requestKey);
  }
});
test("wrong immutable result, target or malformed review cannot clear pending publication", async () => {
  const r = operation(), store = new Memory(); store.row = r;
  for (const change of [{ versionId: randomUUID() }, { publicationId: randomUUID() }, { reviewId: null }, { projectRevision: -1 }, { state: "registered" as const }]) {
    const found = receipt(r); found.result = { ...found.result!, ...change };
    await assert.rejects(checkPublication(r, { lookup: async () => found, apply: async () => undefined }, store), /RECEIPT_INVALID/);
    assert.ok(store.row);
  }
});
test("new revision/audience is a new intent; a later rejection frees the original only once it has no receipt", async () => {
  const r = operation(), store = new Memory();
  const api: PublicationApi = { lookup: async () => empty(), apply: async () => { throw new Error("lost response"); } };
  await assert.rejects(runPublication(r, api, store));
  await assert.rejects(runPublication({ ...r, input: { ...r.input, revision: 4, requestKey: randomUUID() } }, api, store), /pending/);
  await assert.rejects(runPublication(r, { ...api, apply: async () => { throw Object.assign(new Error("conflict"), { response: { status: 409 } }); } }, store));
  // The lookup found no receipt for the original key: provably unapplied.
  assert.equal(store.row, undefined);
});
test("first definite rejection permits a corrected new key; durable storage failure prevents all network calls", async () => {
  const r = operation(), store = new Memory();
  await assert.rejects(runPublication(r, { lookup: async () => empty(), apply: async () => { throw Object.assign(new Error("stale"), { response: { status: 409 } }); } }, store), /stale/);
  assert.equal(store.row, undefined);
  let calls = 0; store.prepare = async () => { throw new Error("storage"); };
  await assert.rejects(runPublication(r, { lookup: async () => { calls++; return empty(); }, apply: async () => { calls++; } }, store), /storage/);
  assert.equal(calls, 0);
});
test("account/service/project switch while lookup awaits cannot learn or clear its receipt", async () => {
  const r = operation(), store = new Memory(); store.row = r; let current = true;
  await assert.rejects(checkPublication(r, { assertScope: () => { if (!current) throw new Error("scope changed"); }, lookup: async () => { current = false; return receipt(r); }, apply: async () => undefined }, store), /scope changed/);
  assert.equal(store.row, r);
});
test("scope is fenced inside the durable finish transaction after an asynchronous account switch", async () => {
  const r = operation(), store = new Memory(); store.row = r; let current = true;
  store.finish = async (intent, assertCurrent) => { await Promise.resolve(); current = false; assertCurrent?.(); if (store.row?.input.requestKey === intent.input.requestKey) store.row = undefined; };
  await assert.rejects(checkPublication(r, { assertScope: () => { if (!current) throw new Error("scope changed"); }, lookup: async () => receipt(r), apply: async () => undefined }, store), /scope changed/);
  assert.equal(store.row, r);
});
// SOT: one shared policy (lib/api/session.ts serverRejected). A local session
// fence may sit over a POST the server already applied, so it never frees a key.
test("a local session fence keeps the first publish pending; only the server's own 409 frees it", async () => {
  for (const [failure, kept] of [[sessionChanged(), true], [Object.assign(new Error("stale"), { response: { status: 409 } }), false]] as const) {
    const r = operation(), store = new Memory();
    await assert.rejects(runPublication(r, { lookup: async () => empty(), apply: async () => { throw failure; } }, store));
    assert.equal(store.row?.input.requestKey === r.input.requestKey, kept);
  }
});
