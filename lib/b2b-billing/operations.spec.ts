import { test } from "node:test";
import assert from "node:assert/strict";
import { apiClient } from "../api/client";
import {
  inputHash,
  billingApi,
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
  await store.prepare(record());
  await store.start(record());
  assert.equal((await store.list(other)).length, 0);
  assert.equal((await store.list({ ...scope, workspaceId: "44444444-4444-4444-8444-444444444444" })).length, 0);
  assert.equal((await store.list({ ...scope, origin: "http://127.0.0.1:9999" })).length, 0);
  assert.equal((await store.list(scope)).length, 1);
  await assert.rejects(
    checkRecord({ ...record(), attempts: 1 }, fakeApi({ send: [], user: other.userId }).api, store),
    /B2B_BILLING_ACCOUNT_CHANGED/,
  );
});

test("concurrent tabs keep one request key, reject different bodies, and late success cannot delete a replacement", async () => {
  const store = new MemoryBillingStore();
  const first = record(), second = record("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10");
  const [a, b] = await Promise.all([store.prepare(first), store.prepare(second)]);
  assert.equal(a.input.requestKey, b.input.requestKey);
  await assert.rejects(store.prepare({ ...second, input: { ...second.input, businessName: "Changed" } }), /B2B_BILLING_OPERATION_PENDING/);
  await Promise.all([store.start(a), store.start(b)]);
  await store.rejectFirst({ ...a, attempts: 1 });
  assert.equal((await store.get(a))?.attempts, 2, "a first rejection cannot erase the other in-flight attempt");
  await store.finish(a);
  await store.prepare(second);
  await store.finish(a);
  assert.equal((await store.get(second))?.input.requestKey, second.input.requestKey);
});
test("late account changes preserve the original receipt lookup and mutation intent", async () => {
  for (const stage of ["lookup", "send", "finish"] as const) {
    const store = new MemoryBillingStore();
    let current = true;
    const assertScope = () => { if (!current) throw new Error("B2B_BILLING_ACCOUNT_CHANGED"); };
    const api = {
      assertScope,
      operation: async () => { if (stage === "lookup") current = false; return { currentUserId: scope.userId, receipt: { revision: 0 } }; },
      changeProfile: async () => { if (stage === "send") current = false; return { revision: 0 }; },
    } as unknown as BillingApi;
    if (stage === "lookup") { await store.prepare(record()); await store.start(record()); }
    if (stage === "finish") {
      const finish = store.finish.bind(store);
      store.finish = async (r, guard) => { current = false; await finish(r, guard); };
    }
    await assert.rejects(runRecord(record(), api, store), /B2B_BILLING_ACCOUNT_CHANGED/);
    assert.equal((await store.get(record()))?.input.requestKey, record().input.requestKey);
  }
});
test("browser APIs block null users, changed accounts, changed teams and changed origins before and after requests", async () => {
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  const oldBase = apiClient.defaults.baseURL, oldAdapter = apiClient.defaults.adapter;
  let user = scope.userId, path = `/dashboard/workspaces/${scope.workspaceId}/plan`, change: (() => void) | undefined;
  let sends = 0;
  Object.assign(globalThis, { window: { location: { get pathname() { return path; } } }, localStorage: { getItem: (key: string) => key === "userInfo" ? JSON.stringify({ id: user }) : null } });
  apiClient.defaults.baseURL = `${scope.origin}/v2`;
  apiClient.defaults.adapter = async (config) => { sends++; change?.(); return { config, status: 200, statusText: "OK", headers: {}, data: { data: { currentUserId: scope.userId, revision: 0 } } }; };
  try {
    const api = billingApi(scope);
    await assert.rejects(billingApi({ ...scope, userId: null }).changeProfile(record().input), /B2B_BILLING_ACCOUNT_CHANGED/);
    assert.equal(sends, 0);
    for (const alter of [() => { user = other.userId; }, () => { user = ""; }, () => { path = "/dashboard/workspaces/other/plan"; }, () => { apiClient.defaults.baseURL = "http://localhost:9999/v2"; }]) {
      user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/plan`; apiClient.defaults.baseURL = `${scope.origin}/v2`;
      change = alter;
      await assert.rejects(api.changeProfile(record().input), /B2B_BILLING_(ACCOUNT|SCOPE|SERVICE)_CHANGED/);
    }
    user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/plan`; apiClient.defaults.baseURL = `${scope.origin}/v2`;
    change = () => { user = other.userId; };
    await assert.rejects(billingApi({ ...scope, userId: null }).overview(), /B2B_BILLING_ACCOUNT_CHANGED/);
  } finally {
    apiClient.defaults.baseURL = oldBase; apiClient.defaults.adapter = oldAdapter;
    Object.assign(globalThis, { window: oldWindow, localStorage: oldStorage });
  }
});

test("simultaneous lost submissions send the same persisted key and recover without another mutation", async () => {
  const store = new MemoryBillingStore(), sent: string[] = [];
  const api = {
    changeProfile: async (input: { requestKey: string }) => { sent.push(input.requestKey); throw lost(); },
    operation: async () => ({ currentUserId: scope.userId, receipt: null }),
  } as unknown as BillingApi;
  const results = await Promise.allSettled([runRecord(record(), api, store), runRecord(record("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10"), api, store)]);
  assert.ok(results.every((r) => r.status === "rejected"));
  assert.equal(sent.length, 2); assert.equal(new Set(sent).size, 1);
  assert.equal((await store.get(record()))?.attempts, 2);
  const recovery = fakeApi({ send: [], receipt: { revision: 0, requestId: "x" } });
  assert.deepEqual(await runRecord(record(), recovery.api, store), { revision: 0, requestId: "x" });
  assert.equal(recovery.calls.length, 1); assert.ok(recovery.calls[0].startsWith("lookup:"));
});
test("corrupt or path-mismatched pending records fail closed instead of opening an empty slot", async () => {
  const store = new MemoryBillingStore();
  await store.prepare(record());
  const key = [...store.rows.keys()][0];
  store.rows.set(key, { ...record(), attempts: -1 });
  await assert.rejects(store.get(record()), /B2B_BILLING_OPERATION_INVALID/);
  await assert.rejects(store.list(scope), /B2B_BILLING_OPERATION_INVALID/);
  await assert.rejects(store.prepare(record()), /B2B_BILLING_OPERATION_INVALID/);
  const bad = { ...record(), action: "method.remove", topic: scope.workspaceId, input: { requestKey: record().input.requestKey, methodId: other.userId } } as BillingRecord;
  await assert.rejects(store.prepare(bad), /B2B_BILLING_OPERATION_INVALID/);
});
