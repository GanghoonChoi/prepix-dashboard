import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChanged } from "../api/session";
import { randomUUID } from "node:crypto";
import {
  checkTrash,
  runTrash,
  sameTrashIntent,
  trashHash,
  validTrash,
  type TrashRecord,
  type TrashScope,
  type TrashStore,
} from "./trash";
import type { TeamFileTrashReceipt } from "../api/generated/b2b";
const scope: TrashScope = {
  origin: "http://localhost:3308",
  userId: randomUUID(),
  workspaceId: randomUUID(),
};
const record = (): Extract<TrashRecord, { action: "trash" }> => {
  const versionId = randomUUID();
  return {
    schema: 1,
    scope,
    versionId,
    attempts: 0,
    action: "trash",
    input: {
      requestKey: randomUUID(),
      versionId,
      revision: 4,
      reason: "Remove selected version",
      fromLibrary: true,
    },
  };
};
class MemoryStore implements TrashStore {
  row?: TrashRecord;
  async list() {
    return this.row ? [this.row] : [];
  }
  async prepare(r: TrashRecord) {
    if (this.row && !sameTrashIntent(this.row, r))
      throw new Error("OPERATION_PENDING");
    this.row ??= structuredClone(r);
    return this.row;
  }
  async start(r: TrashRecord) {
    assert.equal(this.row?.input.requestKey, r.input.requestKey);
    this.row = { ...this.row!, attempts: this.row!.attempts + 1 };
    return this.row;
  }
  async finish(r: TrashRecord) {
    assert.equal(this.row?.input.requestKey, r.input.requestKey);
    this.row = undefined;
  }
  async rejectFirst(r: TrashRecord) {
    if (
      this.row?.input.requestKey === r.input.requestKey &&
      this.row.attempts === 1 &&
      r.attempts === 1
    )
      this.row = undefined;
  }
}
const receipt = (r: TrashRecord): TeamFileTrashReceipt => ({
  currentUserId: scope.userId,
  requestId: randomUUID(),
  versionId: r.versionId,
  trashId: r.action === "trash" ? randomUUID() : r.input.trashId,
  revision: r.action === "trash" ? 0 : r.input.revision + 1,
  state:
    r.action === "trash"
      ? "trashed"
      : r.action === "restore"
        ? "restored"
        : "purge_requested",
});
test("trash intent binds service, account, team, exact version and irreversible confirmation", () => {
  const r = record();
  assert.equal(validTrash(r, scope), true);
  for (const changed of [
    { origin: scope.origin + "other" },
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
  ])
    assert.equal(validTrash(r, { ...scope, ...changed }), false);
  assert.equal(validTrash({ ...r, versionId: randomUUID() }, scope), false);
  assert.equal(
    validTrash({ ...r, input: { ...r.input, fromLibrary: false } }, scope),
    false,
  );
  const purge: TrashRecord = {
    ...r,
    action: "purge",
    input: {
      requestKey: randomUUID(),
      trashId: randomUUID(),
      revision: 0,
      reason: "Confirm removal",
      confirmIrreversible: true,
    },
  };
  assert.equal(validTrash(purge, scope), true);
  assert.equal(
    validTrash(
      { ...purge, input: { ...purge.input, confirmIrreversible: false } },
      scope,
    ),
    false,
  );
  assert.notEqual(
    trashHash({ ...r, input: { ...r.input, reason: "Changed" } }),
    trashHash(r),
  );
  assert.equal(
    sameTrashIntent(r, {
      ...r,
      input: { ...r.input, requestKey: randomUUID() },
    }),
    true,
  );
});
test("lost trash, restore and purge replies survive restart without applying a second change", async () => {
  const original = record();
  const records: TrashRecord[] = [
    original,
    {
      ...original,
      action: "restore",
      input: {
        requestKey: randomUUID(),
        trashId: randomUUID(),
        revision: 0,
        reason: "Restore",
        fromLibrary: true,
      },
    },
    {
      ...original,
      action: "purge",
      input: {
        requestKey: randomUUID(),
        trashId: randomUUID(),
        revision: 0,
        reason: "Purge",
        confirmIrreversible: true,
      },
    },
  ];
  for (const r of records) {
    const store = new MemoryStore(),
      result = receipt(r);
    let applied = false,
      posts = 0;
    const api = {
      operation: async (_action: string, key: string, hash: string) => {
        assert.equal(key, r.input.requestKey);
        assert.equal(hash, trashHash(r));
        return {
          currentUserId: scope.userId,
          receipt: applied ? result : null,
        };
      },
      apply: async () => {
        assert.ok(store.row);
        posts++;
        applied = true;
        throw new Error("Lost reply");
      },
    };
    await assert.rejects(
      runTrash(r, api, store, new AbortController().signal),
      /Lost reply/,
    );
    assert.equal(store.row?.attempts, 1);
    const restarted = structuredClone(store.row!);
    assert.deepEqual(
      await checkTrash(restarted, api, store, new AbortController().signal),
      result,
    );
    assert.equal(posts, 1);
    assert.equal(store.row, undefined);
  }
});
test("wrong account, exact version, trash entry, revision or state cannot clear a pending irreversible operation", async () => {
  const r: TrashRecord = {
    ...record(),
    action: "purge",
    input: {
      requestKey: randomUUID(),
      trashId: randomUUID(),
      revision: 1,
      reason: "Purge",
      confirmIrreversible: true,
    },
  };
  for (const change of [
    { account: randomUUID() },
    { versionId: randomUUID() },
    { trashId: randomUUID() },
    { revision: 1 },
    { state: "restored" },
  ]) {
    const store = new MemoryStore();
    await store.prepare(r);
    const result = { ...receipt(r), ...change };
    await assert.rejects(
      checkTrash(
        r,
        {
          operation: async () => ({
            currentUserId: "account" in change ? change.account! : scope.userId,
            receipt: result as TeamFileTrashReceipt,
          }),
          apply: async () => receipt(r),
        },
        store,
        new AbortController().signal,
      ),
    );
    assert.ok(store.row);
  }
});
test("an ambiguous earlier POST is retained through permission failure while a definitively rejected first POST is cleared", async () => {
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
  await assert.rejects(runTrash(r, api, store, new AbortController().signal));
  await assert.rejects(runTrash(r, api, store, new AbortController().signal));
  assert.equal(store.row?.attempts, 2);
  const clean = new MemoryStore();
  await assert.rejects(
    runTrash(record(), api, clean, new AbortController().signal),
  );
  assert.equal(clean.row, undefined);
});
test("persistence failure prevents POST and changed pending intent cannot replace the frozen deletion", async () => {
  const r = record(),
    store = new MemoryStore();
  await store.prepare(r);
  await assert.rejects(
    store.prepare({ ...r, input: { ...r.input, reason: "Changed" } }),
    /PENDING/,
  );
  let posts = 0;
  const unavailable = {
    ...store,
    list: store.list,
    prepare: async () => {
      throw new Error("STORAGE_UNAVAILABLE");
    },
    start: store.start,
    finish: store.finish,
    rejectFirst: store.rejectFirst,
  };
  await assert.rejects(
    runTrash(
      r,
      {
        operation: async () => ({ currentUserId: scope.userId, receipt: null }),
        apply: async () => {
          posts++;
          return receipt(r);
        },
      },
      unavailable,
      new AbortController().signal,
    ),
    /STORAGE_UNAVAILABLE/,
  );
  assert.equal(posts, 0);
});
// SOT: one shared policy (lib/api/session.ts serverRejected). A local session
// fence may sit over a POST the server already applied, so it never frees a key.
test("a local session fence keeps the first POST pending; only the server's own 403 frees it", async () => {
  for (const [failure, kept] of [[sessionChanged(), true], [{ response: { status: 403 } }, false]] as const) {
    const r = record(),
      store = new MemoryStore();
    const api = {
      operation: async () => ({ currentUserId: scope.userId, receipt: null }),
      apply: async () => {
        throw failure;
      },
    };
    await assert.rejects(runTrash(r, api, store, new AbortController().signal));
    assert.equal(store.row?.input.requestKey === r.input.requestKey, kept);
  }
});
