import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { checkDelivery, deliveryInputHash, deliveryScopeKey, runDelivery, sameDeliveryIntent, validDeliveryOperation, type DeliveryApi, type DeliveryOperation, type DeliveryReceipt, type DeliveryScope, type DeliveryStore } from "./operations";
const scope: DeliveryScope = { origin: "https://api.example.test", userId: randomUUID(), workspaceId: randomUUID(), projectId: randomUUID() };
const operation = (): DeliveryOperation => ({ schema: 1, scope, action: "complete", input: { requestKey: randomUUID(), revision: 2, videoVersionId: randomUUID() }, attempts: 0 });
const missing = () => Object.assign(new Error("missing"), { response: { status: 404, data: { message: "B2B_DELIVERY_RECEIPT_NOT_FOUND" } } });
const receipt = (r: DeliveryOperation): DeliveryReceipt => ({ currentUserId: scope.userId, workspaceId: scope.workspaceId, projectId: scope.projectId, action: r.action, requestKey: r.input.requestKey, inputHash: deliveryInputHash(r), receipt: { requestId: randomUUID(), currentUserId: scope.userId, workspaceId: scope.workspaceId, projectId: scope.projectId, revision: 3, snapshotId: randomUUID() } });
class MemoryStore implements DeliveryStore {
  row?: DeliveryOperation;
  async list(s: DeliveryScope) { return this.row && deliveryScopeKey(s) === deliveryScopeKey(this.row.scope) ? [this.row] : []; }
  async prepare(r: DeliveryOperation) { if (this.row && !sameDeliveryIntent(this.row, r)) throw new Error("B2B_DELIVERY_OPERATION_PENDING"); this.row ??= r; return this.row; }
  async start(r: DeliveryOperation) { this.row = { ...r, attempts: r.attempts + 1 }; return this.row; }
  async finish() { this.row = undefined; }
  async rejectFirst(r: DeliveryOperation) { if (r.attempts === 1 && this.row?.attempts === 1) this.row = undefined; }
}
test("delivery intents remain bound to service, account, team, project and exact package", () => {
  const r = operation();
  assert.equal(validDeliveryOperation(r, scope), true);
  for (const field of ["userId", "workspaceId", "projectId"] as const) assert.equal(validDeliveryOperation(r, { ...scope, [field]: randomUUID() }), false);
  assert.equal(validDeliveryOperation(r, { ...scope, origin: "https://elsewhere.test" }), false);
  assert.equal(validDeliveryOperation({ ...r, action: "confirm" }, scope), false);
  assert.equal(validDeliveryOperation({ ...r, action: "confirm", packageId: randomUUID() }, scope), true);
  assert.notEqual(deliveryInputHash(r), deliveryInputHash({ ...r, scope: { ...scope, projectId: randomUUID() } }));
});
test("completion lost success recovers the original key after reload without a second completion", async () => {
  const r = operation(), store = new MemoryStore(); let sends = 0, saved: DeliveryReceipt | null = null, offline = false;
  const api: DeliveryApi = { lookup: async () => { if (offline) throw new Error("offline"); if (!saved) throw missing(); return saved; }, apply: async (intent) => { sends++; saved = receipt(intent); offline = true; throw new Error("lost"); } };
  await assert.rejects(runDelivery(r, api, store), /offline/);
  assert.equal((await store.list(scope)).length, 1);
  offline = false;
  const answer = await runDelivery({ ...r, input: { ...r.input, requestKey: randomUUID() } }, api, store);
  assert.equal(answer.snapshotId, saved!.receipt.snapshotId);
  assert.equal(sends, 1);
  assert.equal((await store.list(scope)).length, 0);
});
test("another account, changed input hash and invalid snapshot cannot clear uncertainty", async () => {
  const r = operation(), store = new MemoryStore(); await store.prepare(r);
  for (const change of [{ currentUserId: randomUUID() }, { inputHash: "0".repeat(64) }, { requestKey: randomUUID() }, { receipt: { ...receipt(r).receipt, snapshotId: undefined } }]) {
    await assert.rejects(checkDelivery(r, { lookup: async () => ({ ...receipt(r), ...change }), apply: async () => undefined }, store));
    assert.equal((await store.list(scope)).length, 1);
  }
});
test("unknown or access-denied lookup never sends; first proven rejection permits correction", async () => {
  const r = operation(), store = new MemoryStore(); let sends = 0;
  await assert.rejects(runDelivery(r, { lookup: async () => { throw Object.assign(new Error("denied"), { response: { status: 404, data: { message: "B2B_PROJECT_NOT_FOUND" } } }); }, apply: async () => { sends++; } }, store));
  assert.equal(sends, 0);
  await assert.rejects(runDelivery(r, { lookup: async () => { throw missing(); }, apply: async () => { sends++; throw Object.assign(new Error("conflict"), { response: { status: 409 } }); } }, store), /conflict/);
  assert.equal((await store.list(scope)).length, 0);
});
test("a later rejection cannot erase an earlier uncertain attempt", async () => {
  const r = operation(), store = new MemoryStore();
  const api: DeliveryApi = { lookup: async () => { throw missing(); }, apply: async () => { throw new Error("lost"); } };
  await assert.rejects(runDelivery(r, api, store));
  await assert.rejects(runDelivery(r, { ...api, apply: async () => { throw Object.assign(new Error("conflict"), { response: { status: 409 } }); } }, store));
  assert.equal((await store.list(scope))[0].attempts, 2);
  await assert.rejects(runDelivery({ ...r, input: { ...r.input, revision: 3 } }, api, store), /PENDING/);
});
test("unavailable durable storage prevents lookups and writes", async () => {
  const r = operation(), store = new MemoryStore(); let calls = 0;
  store.prepare = async () => { throw new Error("storage unavailable"); };
  await assert.rejects(runDelivery(r, { lookup: async () => { calls++; throw missing(); }, apply: async () => { calls++; } }, store), /storage/);
  assert.equal(calls, 0);
});

test("account or project navigation during lookup or durable deletion retains the original intent", async () => {
  for (const phase of ["lookup", "finish"] as const) {
    const r = operation(), store = new MemoryStore(); await store.prepare(r);
    let current = true;
    const api: DeliveryApi = {
      assertScope: () => { if (!current) throw new Error("B2B_DELIVERY_SCOPE_CHANGED"); },
      lookup: async () => { if (phase === "lookup") current = false; return receipt(r); },
      apply: async () => { throw new Error("must not send"); },
    };
    store.finish = async (_r?: DeliveryOperation, assertCurrent?: () => void) => { if (phase === "finish") current = false; assertCurrent?.(); store.row = undefined; };
    await assert.rejects(checkDelivery(r, api, store), /SCOPE_CHANGED/);
    assert.equal((await store.list(scope))[0].input.requestKey, r.input.requestKey);
  }
});
