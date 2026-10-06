import { test } from "node:test";
import assert from "node:assert/strict";
import {
  inputHash,
  MemoryBillingStore,
  runRecord,
  checkRecord,
  type BillingApi,
  type BillingRecord,
  type BillingScope,
} from "./operations";

const scope: BillingScope = {
  origin: "http://127.0.0.1:3548",
  userId: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
};
const other: BillingScope = { ...scope, userId: "33333333-3333-4333-8333-333333333333" };
const lost = () => Object.assign(new Error("Network Error"), { response: undefined });
const reject = (status: number) => Object.assign(new Error("rejected"), { response: { status } });
function fakeApi(plan: { send: (() => Promise<Record<string, unknown>>)[]; receipt?: Record<string, unknown> | null; user?: string }) {
  const calls: string[] = [];
  const api = {
    changeProfile: async () => {
      calls.push("send");
      return plan.send.shift()!();
    },
    operation: async (_a: string, _k: string, hash: string) => {
      calls.push(`lookup:${hash.slice(0, 8)}`);
      return { currentUserId: plan.user ?? scope.userId, receipt: plan.receipt ?? null };
    },
  } as unknown as BillingApi;
  return { api, calls };
}
const record = (requestKey = "6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10"): BillingRecord<"profile"> => ({
  schema: 1,
  scope,
  action: "profile",
  topic: "profile",
  attempts: 0,
  input: {
    requestKey,
    revision: null,
    schemaVersion: "local-v1",
    businessName: "Local",
    businessRegistrationNumber: "1234567890",
    representative: "Owner",
    address: "Address",
    receiptEmail: "finance@example.test",
  },
});
test("client hash equals the server's canonical request hash", () => {
  assert.equal(
    inputHash({ requestKey: "6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", revision: null, methodId: "x", selection: { storagePacks: 0, base: false, aiPacks: 1, extraSeats: 2 }, reason: "한글 사유", skip: undefined }),
    "da4cba734e1d60aec4164fe28d99e0716dda1c666438aee2c4e37ce170ec27e2",
  );
});
test("a lost reply keeps the original input; the retry asks for the receipt before sending again", async () => {
  const store = new MemoryBillingStore();
  const first = fakeApi({ send: [async () => Promise.reject(lost())] });
  await assert.rejects(runRecord(record(), first.api, store));
  const kept = await store.get(record());
  assert.equal(kept?.attempts, 1);
  // A different input for the same topic cannot replace the unresolved one.
  const changed = record("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10");
  const retry = fakeApi({ send: [], receipt: { revision: 0, requestId: "x" } });
  assert.deepEqual(await runRecord(changed, retry.api, store), { revision: 0, requestId: "x" });
  assert.deepEqual(retry.calls, [`lookup:${inputHash(record().input).slice(0, 8)}`]);
  assert.equal(await store.get(record()), null);
});
test("only a definitive first rejection frees the topic; a later 4xx cannot disprove a lost success", async () => {
  const store = new MemoryBillingStore();
  await assert.rejects(runRecord(record(), fakeApi({ send: [async () => Promise.reject(reject(409))] }).api, store));
  assert.equal(await store.get(record()), null);
  await assert.rejects(runRecord(record(), fakeApi({ send: [async () => Promise.reject(lost())] }).api, store));
  await assert.rejects(runRecord(record(), fakeApi({ send: [async () => Promise.reject(reject(409))] }).api, store));
  assert.equal((await store.get(record()))?.attempts, 2);
});
test("records never cross accounts, teams or services", async () => {
  const store = new MemoryBillingStore();
  await store.put({ ...record(), attempts: 1 });
  assert.equal((await store.list(other)).length, 0);
  assert.equal((await store.list({ ...scope, workspaceId: "44444444-4444-4444-8444-444444444444" })).length, 0);
  assert.equal((await store.list({ ...scope, origin: "http://127.0.0.1:9999" })).length, 0);
  assert.equal((await store.list(scope)).length, 1);
  await assert.rejects(
    checkRecord({ ...record(), attempts: 1 }, fakeApi({ send: [], user: other.userId }).api, store),
    /B2B_BILLING_ACCOUNT_CHANGED/,
  );
});
