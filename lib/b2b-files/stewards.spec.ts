import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  checkSteward,
  runSteward,
  sameStewardIntent,
  stewardHash,
  validSteward,
  type StewardRecord,
  type StewardScope,
  type StewardStore,
} from "./stewards";
const scope: StewardScope = {
  origin: "http://localhost:3308",
  userId: randomUUID(),
  workspaceId: randomUUID(),
};
const record = (): Extract<StewardRecord, { action: "transfer" }> => ({
  schema: 1,
  scope,
  attempts: 0,
  action: "transfer",
  input: {
    requestKey: randomUUID(),
    versionId: randomUUID(),
    targetId: randomUUID(),
    revision: 3,
    canDownload: false,
    fromLibrary: true,
    reason: "Explicit version handoff",
  },
});
class MemoryStore implements StewardStore {
  row?: StewardRecord;
  async list() {
    return this.row ? [this.row] : [];
  }
  async prepare(r: StewardRecord) {
    if (this.row && !sameStewardIntent(this.row, r))
      throw new Error("B2B_FILE_OPERATION_PENDING");
    this.row ??= structuredClone(r);
    return this.row;
  }
  async start(r: StewardRecord) {
    assert.equal(this.row?.input.requestKey, r.input.requestKey);
    this.row = { ...this.row!, attempts: this.row!.attempts + 1 };
    return this.row;
  }
  async finish(r: StewardRecord) {
    if (this.row) assert.equal(this.row.input.requestKey, r.input.requestKey);
    this.row = undefined;
  }
  async rejectFirst(r: StewardRecord) {
    if (
      this.row?.input.requestKey === r.input.requestKey &&
      this.row.attempts === 1 &&
      r.attempts === 1
    )
      this.row = undefined;
  }
}
test("handoff provenance and receipt hash bind source, version, successor and download scope", () => {
  const r = record();
  assert.equal(validSteward(r, scope), true);
  assert.equal(validSteward(r, { ...scope, userId: randomUUID() }), false);
  assert.equal(validSteward(r, { ...scope, workspaceId: randomUUID() }), false);
  assert.equal(
    validSteward(r, { ...scope, origin: scope.origin + "suffix" }),
    false,
  );
  assert.equal(
    validSteward({ ...r, input: { ...r.input, fromLibrary: false } }, scope),
    false,
  );
  for (const change of [
    { targetId: randomUUID() },
    { versionId: randomUUID() },
    { sourceProjectId: randomUUID() },
    { canDownload: true },
  ]) {
    const next = { ...r, input: { ...r.input, ...change } } as StewardRecord;
    assert.notEqual(stewardHash(next), stewardHash(r));
    assert.equal(sameStewardIntent(next, r), false);
  }
});
test("a lost handoff success survives restart and receipt check never reapplies stewardship", async () => {
  const r = record(),
    store = new MemoryStore(),
    receipt = { requestId: randomUUID(), revision: 4 };
  let applied = false,
    posts = 0;
  const api = {
    operation: async (_action: string, key: string, hash: string) => {
      assert.equal(key, r.input.requestKey);
      assert.equal(hash, stewardHash(r));
      return { currentUserId: scope.userId, receipt: applied ? receipt : null };
    },
    apply: async () => {
      posts++;
      applied = true;
      throw new Error("Lost HTTP reply");
    },
  };
  await assert.rejects(
    runSteward(r, api, store, new AbortController().signal),
    /Lost HTTP/,
  );
  assert.equal(store.row?.attempts, 1);
  const restarted = structuredClone(store.row!);
  assert.deepEqual(
    await checkSteward(restarted, api, store, new AbortController().signal),
    receipt,
  );
  assert.equal(posts, 1);
  assert.equal(store.row, undefined);
});
test("a changed successor cannot replace a pending request and a fresh key reuses the frozen original intent", async () => {
  const r = record(),
    store = new MemoryStore();
  await store.prepare(r);
  await assert.rejects(
    store.prepare({
      ...r,
      input: { ...r.input, targetId: randomUUID() },
    } as StewardRecord),
    /OPERATION_PENDING/,
  );
  assert.equal(
    (
      await store.prepare({
        ...r,
        input: { ...r.input, requestKey: randomUUID() },
      })
    ).input.requestKey,
    r.input.requestKey,
  );
});
test("another account or a malformed receipt cannot clear a pending handoff", async () => {
  for (const result of [
    {
      currentUserId: randomUUID(),
      receipt: { requestId: randomUUID(), revision: 4 },
    },
    {
      currentUserId: scope.userId,
      receipt: { requestId: randomUUID(), revision: 5 },
    },
    {
      currentUserId: scope.userId,
      receipt: {
        requestId: randomUUID(),
        revision: 4,
        recoveryId: randomUUID(),
      },
    },
  ]) {
    const r = record(),
      store = new MemoryStore();
    await store.prepare(r);
    await assert.rejects(
      checkSteward(
        r,
        {
          operation: async () => result,
          apply: async () => {
            throw new Error("Unexpected POST");
          },
        },
        store,
        new AbortController().signal,
      ),
      /ACCOUNT_CHANGED|OPERATION_INVALID/,
    );
    assert.equal(store.row?.input.requestKey, r.input.requestKey);
  }
});
test("only the first definitive rejection clears a request; a later rejection cannot disprove a lost success", async () => {
  const r = record(),
    store = new MemoryStore();
  let first = true;
  const api = {
    operation: async () => ({ currentUserId: scope.userId, receipt: null }),
    apply: async () => {
      if (first) {
        first = false;
        throw new Error("Lost reply");
      }
      throw { response: { status: 403 } };
    },
  };
  await assert.rejects(runSteward(r, api, store, new AbortController().signal));
  await assert.rejects(runSteward(r, api, store, new AbortController().signal));
  assert.equal(store.row?.attempts, 2);
  const clean = new MemoryStore();
  await assert.rejects(
    runSteward(record(), api, clean, new AbortController().signal),
  );
  assert.equal(clean.row, undefined);
});
test("acceptance receipts must identify the same recovery request; a designation receipt requires its new request ID", async () => {
  const r: StewardRecord = {
    schema: 1,
    scope,
    attempts: 0,
    action: "accept",
    input: {
      requestKey: randomUUID(),
      recoveryId: randomUUID(),
      acceptVersionAccess: true,
    },
  };
  const store = new MemoryStore();
  await store.prepare(r);
  await assert.rejects(
    checkSteward(
      r,
      {
        operation: async () => ({
          currentUserId: scope.userId,
          receipt: {
            requestId: randomUUID(),
            revision: 1,
            recoveryId: randomUUID(),
          },
        }),
        apply: async () => {
          throw new Error("Unexpected POST");
        },
      },
      store,
      new AbortController().signal,
    ),
    /OPERATION_INVALID/,
  );
  assert.ok(store.row);
  const request: StewardRecord = {
    ...record(),
    action: "request",
    input: {
      requestKey: randomUUID(),
      versionId: randomUUID(),
      targetId: randomUUID(),
      revision: 0,
      canDownload: false,
      reason: "Recover only this version",
    },
  };
  const requestStore = new MemoryStore();
  await requestStore.prepare(request);
  await assert.rejects(
    checkSteward(
      request,
      {
        operation: async () => ({
          currentUserId: scope.userId,
          receipt: { requestId: randomUUID(), revision: 0 },
        }),
        apply: async () => {
          throw new Error("Unexpected POST");
        },
      },
      requestStore,
      new AbortController().signal,
    ),
    /OPERATION_INVALID/,
  );
  assert.ok(requestStore.row);
});
