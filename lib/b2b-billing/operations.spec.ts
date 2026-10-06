import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChanged } from "../api/session";
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
    // An account or service change is fenced by the session layer before the
    // body reaches billing code; only the route is billing's own check.
    for (const [alter, code] of [[() => { user = other.userId; }, /API_SESSION_CHANGED/], [() => { user = ""; }, /API_SESSION_CHANGED/], [() => { path = "/dashboard/workspaces/other/plan"; }, /B2B_BILLING_SCOPE_CHANGED/], [() => { apiClient.defaults.baseURL = "http://localhost:9999/v2"; }, /API_SESSION_CHANGED/]] as const) {
      user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/plan`; apiClient.defaults.baseURL = `${scope.origin}/v2`;
      change = alter;
      await assert.rejects(api.changeProfile(record().input), code);
    }
    user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/plan`; apiClient.defaults.baseURL = `${scope.origin}/v2`;
    change = () => { user = other.userId; };
    await assert.rejects(billingApi({ ...scope, userId: null }).overview(), /API_SESSION_CHANGED/);
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
// SOT: one shared policy (lib/api/session.ts serverRejected). A local session
// fence may sit over a POST the server already applied, so it never frees a key.
test("a paid change fenced by a local session change stays pending and recovers by its original key without a second send", async () => {
  const store = new MemoryBillingStore();
  await assert.rejects(runRecord(record(), fakeApi({ send: [async () => Promise.reject(sessionChanged())] }).api, store), /API_SESSION_CHANGED/);
  assert.equal((await store.get(record()))?.attempts, 1);
  const retry = fakeApi({ send: [], receipt: { revision: 0, requestId: "x" } });
  assert.deepEqual(await runRecord(record("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10"), retry.api, store), { revision: 0, requestId: "x" });
  assert.deepEqual(retry.calls, [`lookup:${inputHash(record().input).slice(0, 8)}`]);
});

// Legal floor (SOT: backend/docs/b2b-legal-floor.md): mid-term termination and
// renewal re-consent ride the same original-key policy as every billing change.
const serverRefusal = (status: number, message: string) =>
  Object.assign(new Error(message), { response: { status, data: { message } } });
const termination = (requestKey = "6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10"): BillingRecord<"termination"> => ({
  schema: 1,
  scope,
  action: "termination",
  topic: "termination",
  attempts: 0,
  input: { requestKey, reason: "팀 운영 종료", basisAt: "2026-10-06T12:00:00.000Z", expectedTotalKrw: 110000 },
});
const consentId = "55555555-5555-4555-8555-555555555555";
const accept = (requestKey: string, expectedTotalKrw: number): BillingRecord<"renewal.consent.accept"> => ({
  schema: 1,
  scope,
  action: "renewal.consent.accept",
  topic: consentId,
  attempts: 0,
  input: { requestKey, productVersion: "local-v2", expectedTotalKrw, consentId },
});
function legalApi(plan: { terminate?: (() => Promise<Record<string, unknown>>)[]; accept?: (() => Promise<Record<string, unknown>>)[]; receipt?: Record<string, unknown> | null; user?: string }) {
  const calls: string[] = [];
  const api = {
    terminate: async (input: { requestKey: string }) => { calls.push(`terminate:${input.requestKey.slice(0, 2)}`); return plan.terminate!.shift()!(); },
    acceptConsent: async (id: string, input: Record<string, unknown>) => { calls.push(`accept:${id === consentId}:${"consentId" in input}:${input.expectedTotalKrw}`); return plan.accept!.shift()!(); },
    operation: async (action: string, key: string, hash: string) => {
      calls.push(`lookup:${action}:${key.slice(0, 2)}:${hash.slice(0, 8)}`);
      return { currentUserId: plan.user ?? scope.userId, receipt: plan.receipt ?? null };
    },
  } as unknown as BillingApi;
  return { api, calls };
}
test("termination: a lost reply keeps the original key and body; recovery is one lookup by that key, never a second termination", async () => {
  const store = new MemoryBillingStore();
  const first = legalApi({ terminate: [async () => { throw lost(); }] });
  await assert.rejects(runRecord(termination(), first.api, store));
  assert.deepEqual(first.calls, ["terminate:6f"]);
  assert.equal((await store.get(termination()))?.attempts, 1);
  // The person presses again later: a new key is generated, the stored one wins.
  const retry = legalApi({ terminate: [], receipt: { terminationId: "t", totalKrw: 110000 } });
  assert.deepEqual(await runRecord(termination("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10"), retry.api, store), { terminationId: "t", totalKrw: 110000 });
  assert.deepEqual(retry.calls, [`lookup:termination:6f:${inputHash(termination().input).slice(0, 8)}`]);
  assert.equal(await store.get(termination()), null);
});
test("termination: a local session fence keeps the key pending; only the same account may settle it", async () => {
  const store = new MemoryBillingStore();
  await assert.rejects(runRecord(termination(), legalApi({ terminate: [async () => { throw sessionChanged(); }] }).api, store), /API_SESSION_CHANGED/);
  assert.equal((await store.get(termination()))?.attempts, 1, "a browser-raised 401 is not the server's refusal");
  await assert.rejects(checkRecord((await store.get(termination()))!, legalApi({ receipt: { terminationId: "t" }, user: other.userId }).api, store), /B2B_BILLING_ACCOUNT_CHANGED/);
  assert.equal((await store.get(termination()))?.attempts, 1);
  const same = legalApi({ receipt: { terminationId: "t" } });
  assert.deepEqual(await checkRecord((await store.get(termination()))!, same.api, store), { terminationId: "t" });
  assert.equal(await store.get(termination()), null);
});
test("termination: a stale basis on a resend frees the record (no copy can ever succeed); another refusal on a resend does not", async () => {
  for (const [code, freed] of [["B2B_REFUND_BASIS_STALE", true], ["B2B_REFUND_PENDING", false]] as const) {
    const store = new MemoryBillingStore();
    await assert.rejects(runRecord(termination(), legalApi({ terminate: [async () => { throw lost(); }] }).api, store));
    await assert.rejects(runRecord(termination(), legalApi({ terminate: [async () => { throw serverRefusal(409, code); }] }).api, store), new RegExp(code));
    assert.equal(await store.get(termination()) === null, freed, code);
  }
});
test("re-consent: the consent ID is hashed with the body but sent only in the path; a changed total frees the key and a fresh confirmation sends the new total", async () => {
  const store = new MemoryBillingStore();
  const changed = legalApi({ accept: [async () => { throw serverRefusal(409, "B2B_RENEWAL_CONSENT_CHANGED"); }] });
  await assert.rejects(runRecord(accept("6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", 110000), changed.api, store), /B2B_RENEWAL_CONSENT_CHANGED/);
  assert.deepEqual(changed.calls, ["accept:true:false:110000"]);
  assert.equal(await store.get(accept("x", 0)), null, "the server's own first refusal frees the topic");
  const fresh = legalApi({ accept: [async () => ({ consent: { state: "consented" } })] });
  assert.deepEqual(await runRecord(accept("7f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", 132000), fresh.api, store), { consent: { state: "consented" } });
  assert.deepEqual(fresh.calls, ["accept:true:false:132000"]);
  // A lost accept is recovered by the hash over {...body, consentId}, the server's request.
  const lostStore = new MemoryBillingStore();
  await assert.rejects(runRecord(accept("6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", 132000), legalApi({ accept: [async () => { throw lost(); }] }).api, lostStore));
  const recovery = legalApi({ receipt: { consent: { state: "consented" } } });
  await runRecord(accept("8f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", 132000), recovery.api, lostStore);
  assert.deepEqual(recovery.calls, [`lookup:renewal.consent.accept:6f:${inputHash({ requestKey: "6f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", productVersion: "local-v2", expectedTotalKrw: 132000, consentId }).slice(0, 8)}`]);
  // A consent topic must name its own consent.
  await assert.rejects(lostStore.prepare({ ...accept("9f1f5b7e-0d7a-4a3c-9a52-2f7e0c1d9e10", 1), topic: other.userId }), /B2B_BILLING_OPERATION_INVALID/);
});
