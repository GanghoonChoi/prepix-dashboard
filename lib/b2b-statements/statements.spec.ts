import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChanged } from "../api/session";
import { createHash, randomUUID } from "node:crypto";
import {
  MemoryStatementStore,
  freshIssue,
  runIssue,
  type StatementReceipt,
  type StatementIssueApi,
  kst,
  monthLabel,
  verifiedPdf,
  type StatementScope,
} from "./statements";

const scope: StatementScope = {
  origin: "http://127.0.0.1:3558",
  userId: randomUUID(),
  workspaceId: randomUUID(),
};

test("simultaneous tabs persist one statement request and late success never erases its replacement", async () => {
  const store = new MemoryStatementStore();
  const first = freshIssue(scope, "2027-01"), second = freshIssue(scope, "2027-01");
  const [a, b] = await Promise.all([store.prepare(first), store.prepare(second)]);
  assert.equal(a.requestKey, b.requestKey);
  await Promise.all([store.start(a), store.start(b)]);
  await store.rejectFirst({ ...a, attempts: 1 });
  assert.equal((await store.get(scope, first.month))?.attempts, 2);
  await store.finish(a);
  await store.prepare(second);
  await store.finish(a);
  assert.equal((await store.get(scope, first.month))?.requestKey, second.requestKey);
  assert.equal(await store.get({ ...scope, userId: randomUUID() }, first.month), null);
});

test("lost reply recovers through a scoped receipt; retry 4xx keeps the original key", async () => {
  const store = new MemoryStatementStore(), fresh = freshIssue(scope, "2027-01");
  const sends: string[] = [];
  let stored: StatementReceipt | null = null;
  let status: number | undefined = undefined;
  const api: StatementIssueApi = {
    assertScope: () => {},
    operation: async (month, requestKey, inputHash) => ({ currentUserId: scope.userId, workspaceId: scope.workspaceId, month, requestKey, inputHash, receipt: stored }),
    issue: async (_month, requestKey) => {
      sends.push(requestKey);
      throw status ? Object.assign(new Error("rejected"), { response: { status } }) : new Error("lost");
    },
  };
  await assert.rejects(runIssue(fresh, api, store), /lost/);
  status = 403;
  await assert.rejects(runIssue(freshIssue(scope, fresh.month), api, store), /rejected/);
  assert.equal((await store.get(scope, fresh.month))?.requestKey, fresh.requestKey);
  assert.equal((await store.get(scope, fresh.month))?.attempts, 2);
  stored = { month: fresh.month, revision: { id: randomUUID(), month: fresh.month } as StatementReceipt["revision"], created: true, requestId: randomUUID() };
  assert.deepEqual(await runIssue(freshIssue(scope, fresh.month), api, store), stored);
  assert.equal(sends.length, 2);
  assert.equal(new Set(sends).size, 1);
  assert.equal(await store.get(scope, fresh.month), null);
});

test("only the first definitive rejection frees a statement slot", async () => {
  const store = new MemoryStatementStore(), fresh = freshIssue(scope, "2027-01");
  await assert.rejects(runIssue(fresh, {
    assertScope: () => {},
    operation: async () => { throw new Error("should not look up before first send"); },
    issue: async () => { throw Object.assign(new Error("not due"), { response: { status: 409 } }); },
  }, store), /not due/);
  assert.equal(await store.get(scope, fresh.month), null);
});

test("receipt actor, month, path and original hash must match before clearing", async () => {
  for (const field of ["currentUserId", "workspaceId", "month", "requestKey", "inputHash"] as const) {
    const store = new MemoryStatementStore(), fresh = freshIssue(scope, "2027-01");
    await store.prepare(fresh); await store.start(fresh);
    await assert.rejects(runIssue(fresh, {
      assertScope: () => {},
      operation: async (month, requestKey, inputHash) => ({ currentUserId: scope.userId, workspaceId: scope.workspaceId, month, requestKey, inputHash, receipt: null, [field]: "wrong" }),
      issue: async () => { throw new Error("must not send"); },
    }, store), /B2B_STATEMENT_RECEIPT_MISMATCH/);
    assert.equal((await store.get(scope, fresh.month))?.requestKey, fresh.requestKey);
  }
});

test("late account loss at lookup, send or store callback preserves the original intent", async () => {
  for (const step of ["lookup", "send", "finish"] as const) {
    const store = new MemoryStatementStore(), fresh = freshIssue(scope, "2027-01");
    let current = true;
    const receipt = { month: fresh.month, revision: { id: randomUUID(), month: fresh.month } as StatementReceipt["revision"], created: true, requestId: randomUUID() };
    const assertScope = () => { if (!current) throw new Error("B2B_STATEMENT_ACCOUNT_CHANGED"); };
    if (step === "lookup") { await store.prepare(fresh); await store.start(fresh); }
    if (step === "finish") {
      const finish = store.finish.bind(store);
      store.finish = async (record, guard) => { current = false; await finish(record, guard); };
    }
    await assert.rejects(runIssue(fresh, {
      assertScope,
      operation: async (month, requestKey, inputHash) => { if (step === "lookup") current = false; return { currentUserId: scope.userId, workspaceId: scope.workspaceId, month, requestKey, inputHash, receipt }; },
      issue: async () => { if (step === "send") current = false; return receipt; },
    }, store), /B2B_STATEMENT_ACCOUNT_CHANGED/);
    assert.equal((await store.get(scope, fresh.month))?.requestKey, fresh.requestKey);
  }
});

test("only the exact issued bytes verify", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7 statement");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.ok(verifiedPdf(bytes.buffer, { sha256, bytes: bytes.length }));
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  assert.equal(verifiedPdf(changed.buffer, { sha256, bytes: bytes.length }), false);
  assert.equal(verifiedPdf(bytes.buffer, { sha256, bytes: bytes.length + 1 }), false);
});

test("labels use the Korean calendar month and KST", () => {
  assert.equal(monthLabel("2027-01"), "2027년 1월");
  assert.equal(monthLabel("2027-01", "en"), "January 2027");
  assert.equal(kst("2027-01-31T15:00:00.000Z"), "2027-02-01 00:00");
  assert.equal(kst(null), "-");
});

test("statement calls refuse to leave without an account id", async () => {
  const { statementService } = await import("../api/services/b2b-statements.service");
  const id = randomUUID();
  for (const call of [
    () => statementService.list(id, ""),
    () => statementService.detail(id, "2027-01", ""),
    () => statementService.issue(id, "2027-01", randomUUID(), ""),
    () => statementService.pdf(id, randomUUID(), ""),
  ])
    await assert.rejects(call(), /B2B_ACCOUNT_REQUIRED/);
});

test("legacy pending migrates its original key conservatively, while corrupt or conflicting records block recovery", async () => {
  const old = { rows: new Map<string, string>(), getItem(k: string) { return this.rows.get(k) ?? null; }, setItem(k: string, v: string) { this.rows.set(k, v); }, removeItem(k: string) { this.rows.delete(k); } };
  const { legacyIssueKey, issueSlot } = await import("./statements");
  const requestKey = randomUUID(), month = "2027-01", key = legacyIssueKey(scope, month);
  old.setItem(key, JSON.stringify({ schema: 1, scope, month, requestKey }));
  const store = new MemoryStatementStore(old);
  const migrated = await store.prepare(freshIssue(scope, month));
  assert.equal(migrated.requestKey, requestKey);
  assert.equal(migrated.attempts, 1);
  assert.equal(old.getItem(key), null);
  old.setItem(key, "{broken");
  await assert.rejects(store.get(scope, month), /B2B_STATEMENT_RECOVERY_BLOCKED/);
  assert.equal(old.getItem(key), "{broken");
  old.setItem(key, JSON.stringify({ schema: 1, scope, month, requestKey: randomUUID() }));
  await assert.rejects(store.prepare(freshIssue(scope, month)), /B2B_STATEMENT_RECOVERY_BLOCKED/);
  old.removeItem(key);
  store.rows.set(issueSlot(scope, month), { ...migrated, month: "2027-02" });
  await assert.rejects(store.get(scope, month), /B2B_STATEMENT_RECOVERY_BLOCKED/);
});

test("statement APIs fence actor, workspace route, origin and lifetime before and after awaited responses", async () => {
  const { statementApi } = await import("../api/services/b2b-statements.service");
  const { apiClient } = await import("../api/client");
  const oldWindow = globalThis.window, oldStorage = globalThis.localStorage;
  const oldBase = apiClient.defaults.baseURL, oldAdapter = apiClient.defaults.adapter;
  let user = scope.userId, path = `/dashboard/workspaces/${scope.workspaceId}/statements`, alter: (() => void) | undefined;
  let sends = 0;
  Object.assign(globalThis, { window: { location: { get pathname() { return path; } } }, localStorage: { getItem: (key: string) => key === "userInfo" ? JSON.stringify({ id: user }) : null } });
  apiClient.defaults.baseURL = `${scope.origin}/v2`;
  apiClient.defaults.adapter = async config => { sends++; alter?.(); return { config, status: 200, statusText: "OK", headers: {}, data: { data: { currentUserId: scope.userId } } }; };
  try {
    const api = statementApi(scope);
    await assert.rejects(statementApi({ ...scope, userId: "" }).list(), /B2B_ACCOUNT_REQUIRED/);
    user = "";
    await assert.rejects(api.list(), /B2B_STATEMENT_ACCOUNT_CHANGED/);
    assert.equal(sends, 0);
    for (const change of [() => { user = randomUUID(); }, () => { user = ""; }, () => { path = "/dashboard/workspaces/other/statements"; }, () => { apiClient.defaults.baseURL = "http://localhost:9999/v2"; }]) {
      for (const kind of ["list", "issue", "pdf", "operation"] as const) {
        user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/statements`; apiClient.defaults.baseURL = `${scope.origin}/v2`; alter = change;
        const call = kind === "list" ? () => api.list() : kind === "issue" ? () => api.issue("2027-01", randomUUID()) : kind === "pdf" ? () => api.pdf(randomUUID()) : () => api.operation("2027-01", randomUUID(), "a".repeat(64));
        await assert.rejects(call(), /B2B_STATEMENT_(ACCOUNT|SCOPE|SERVICE)_CHANGED/);
      }
    }
    user = scope.userId; path = `/dashboard/workspaces/${scope.workspaceId}/statements`; apiClient.defaults.baseURL = `${scope.origin}/v2`;
    const controller = new AbortController(), bound = statementApi(scope, controller.signal);
    alter = () => controller.abort();
    await assert.rejects(bound.list());
    alter = undefined;
    const before = sends;
    await assert.rejects(bound.list());
    assert.equal(sends, before);
  } finally {
    apiClient.defaults.baseURL = oldBase; apiClient.defaults.adapter = oldAdapter;
    Object.assign(globalThis, { window: oldWindow, localStorage: oldStorage });
  }
});
// SOT: one shared policy (lib/api/session.ts serverRejected). A local session
// fence may sit over a POST the server already applied, so it never frees a key.
test("a statement issue fenced by a local session change keeps its key and recovers once", async () => {
  const store = new MemoryStatementStore(), fresh = freshIssue(scope, "2027-01");
  const sends: string[] = [];
  let stored: StatementReceipt | null = null;
  const api: StatementIssueApi = {
    assertScope: () => {},
    operation: async (month, requestKey, inputHash) => ({ currentUserId: scope.userId, workspaceId: scope.workspaceId, month, requestKey, inputHash, receipt: stored }),
    issue: async (month, requestKey) => {
      sends.push(requestKey);
      stored = { month, revision: { id: randomUUID(), month } as StatementReceipt["revision"], created: true, requestId: randomUUID() };
      throw sessionChanged();
    },
  };
  await assert.rejects(runIssue(fresh, api, store), /API_SESSION_CHANGED/);
  assert.equal((await store.get(scope, fresh.month))?.requestKey, fresh.requestKey);
  assert.deepEqual(await runIssue(freshIssue(scope, fresh.month), api, store), stored);
  assert.deepEqual(sends, [fresh.requestKey]);
});
