import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionChanged } from "../api/session";
import { randomUUID } from "node:crypto";
import {
  BrowserMutationStore,
  checkMutation,
  mutationBody,
  mutationHash,
  mutationKey,
  operationProject,
  runMutation,
  sameIntent,
  validMutation,
  type FileMutation,
  type MutationApi,
  type MutationStore,
} from "./mutations";
import type { FileScope } from "./api";
import { teamFilePrefix } from "./store";
import { downloadKey } from "./download-store";
const scope: FileScope = {
  origin: "http://localhost:3312",
  userId: randomUUID(),
  workspaceId: randomUUID(),
  projectId: randomUUID(),
};
const signal = () => new AbortController().signal;
test("library record inventory is exact to service, actor and team and keeps an immutable source", () => {
  const s = { ...scope, origin: 'http://localhost:3312/"\\test' },
    prefix = teamFilePrefix(s),
    r = {
      schema: 1 as const,
      scope: s,
      versionId: randomUUID(),
      size: 1,
      sha256: "a".repeat(64),
    };
  assert.ok(downloadKey(r).startsWith(prefix));
  for (const other of [
    { userId: randomUUID() },
    { workspaceId: randomUUID() },
    { origin: s.origin + "suffix" },
  ])
    assert.equal(
      downloadKey({ ...r, scope: { ...s, ...other } }).startsWith(prefix),
      false,
    );
  assert.ok(
    downloadKey({ ...r, scope: { ...s, projectId: randomUUID() } }).startsWith(
      prefix,
    ),
  );
});
test("orphan relink to the original project is valid only with an explicit library intent bound into the receipt hash", () => {
  const r: FileMutation = {
    schema: 1,
    scope,
    attempts: 0,
    kind: "link",
    objectId: randomUUID(),
    targetProjectId: scope.projectId,
    input: {
      requestKey: randomUUID(),
      sourceProjectId: scope.projectId,
      versionId: "",
      fromLibrary: true,
    },
  };
  r.input.versionId = r.objectId;
  assert.equal(validMutation(r, scope), true);
  const plain = { ...r, input: { ...r.input, fromLibrary: undefined } };
  assert.equal(validMutation(plain, scope), false);
  assert.notEqual(mutationHash(r), mutationHash(plain));
  assert.equal(
    validMutation({ ...r, input: { ...r.input, fromLibrary: "true" } }, scope),
    false,
  );
});
const record = (): FileMutation => ({
  schema: 1,
  scope,
  attempts: 0,
  kind: "unlink",
  objectId: randomUUID(),
  input: {
    requestKey: randomUUID(),
    revision: 0,
    reason: "Remove project reference",
  },
});
class MemoryStore implements MutationStore {
  rows = new Map<string, FileMutation>();
  async list(s: FileScope) {
    return [...this.rows.values()].filter((r) => validMutation(r, s));
  }
  async prepare(r: FileMutation) {
    const prior = this.rows.get(mutationKey(r));
    if (prior && !sameIntent(prior, r))
      throw new Error("B2B_FILE_OPERATION_PENDING");
    const saved = prior ?? structuredClone(r);
    this.rows.set(mutationKey(r), saved);
    return saved;
  }
  async start(r: FileMutation) {
    const prior = this.rows.get(mutationKey(r))!;
    const next = { ...prior, attempts: prior.attempts + 1 };
    this.rows.set(mutationKey(r), next);
    return next;
  }
  async rejectFirst(r: FileMutation) {
    const p = this.rows.get(mutationKey(r));
    if (p?.attempts === 1 && r.attempts === 1) {
      this.rows.delete(mutationKey(r));
      return true;
    }
    return false;
  }
  async finish(r: FileMutation) {
    this.rows.delete(mutationKey(r));
  }
}
function fixture() {
  const store = new MemoryStore(),
    r = record(),
    receipt = { requestId: randomUUID(), revision: 1 };
  let posts = 0,
    applied = false,
    lost = true;
  const api: MutationApi = {
    operation: async (_action, key, hash) => {
      assert.equal(key, r.input.requestKey);
      assert.equal(hash, mutationHash(r));
      return { currentUserId: scope.userId, receipt: applied ? receipt : null };
    },
    changePermission: async () => {
      throw new Error("wrong endpoint");
    },
    link: async () => {
      throw new Error("wrong endpoint");
    },
    unlink: async (_id, input) => {
      posts++;
      assert.equal(store.rows.get(mutationKey(r))?.attempts, posts);
      assert.deepEqual(input, r.input);
      applied = true;
      if (lost) {
        lost = false;
        throw new Error("lost response");
      }
      return { projectId: scope.projectId, ...receipt };
    },
  };
  return { store, r, api, receipt, posts: () => posts };
}
test("lost unlink success is confirmed after the reference disappears without a second write", async () => {
  const f = fixture();
  await assert.rejects(
    runMutation(f.r, f.api, f.store, signal()),
    /lost response/,
  );
  assert.equal((await f.store.list(scope)).length, 1);
  assert.deepEqual(await runMutation(f.r, f.api, f.store, signal()), f.receipt);
  assert.equal(f.posts(), 1);
  assert.equal((await f.store.list(scope)).length, 0);
});
test("a missing receipt is only a read and retains the original request", async () => {
  const f = fixture();
  await f.store.prepare(f.r);
  assert.equal(await checkMutation(f.r, f.api, f.store, signal()), null);
  assert.equal(f.posts(), 0);
  assert.equal(
    (await f.store.list(scope))[0].input.requestKey,
    f.r.input.requestKey,
  );
});
test("a new key for the same intent recovers the first key; changed revision cannot overwrite uncertainty", async () => {
  const f = fixture();
  await assert.rejects(runMutation(f.r, f.api, f.store, signal()));
  const fresh = structuredClone(f.r);
  fresh.input.requestKey = randomUUID();
  assert.deepEqual(
    await runMutation(fresh, f.api, f.store, signal()),
    f.receipt,
  );
  assert.equal(f.posts(), 1);
  await f.store.prepare(f.r);
  const changed = structuredClone(f.r);
  if (changed.kind === "unlink") changed.input.revision++;
  await assert.rejects(
    runMutation(changed, f.api, f.store, signal()),
    /OPERATION_PENDING/,
  );
});
test("a later rejection discards only when the original key has no receipt", async () => {
  const f = fixture();
  f.api.unlink = async () => {
    throw new Error("network unavailable");
  };
  await assert.rejects(runMutation(f.r, f.api, f.store, signal()));
  f.api.unlink = async () => {
    throw { response: { status: 403 } };
  };
  const op = f.api.operation.bind(f.api);
  let lookups = 0;
  f.api.operation = async (...a: Parameters<typeof op>) => {
    if (++lookups === 2) throw new Error("offline");
    return op(...a);
  };
  // Later attempt, lookup unavailable: kept.
  await assert.rejects(runMutation(f.r, f.api, f.store, signal()));
  assert.equal((await f.store.list(scope))[0].attempts, 2);
  // Lookup answers no receipt for the original key: provably unapplied.
  f.api.operation = op;
  await assert.rejects(runMutation(f.r, f.api, f.store, signal()));
  assert.equal((await f.store.list(scope)).length, 0);
});
test("a definite first rejection allows correction, while 408 and 429 retain the intent", async () => {
  for (const status of [403, 409, 408, 429]) {
    const f = fixture();
    f.api.unlink = async () => {
      throw { response: { status } };
    };
    await assert.rejects(runMutation(f.r, f.api, f.store, signal()));
    assert.equal(
      (await f.store.list(scope)).length,
      [408, 429].includes(status) ? 1 : 0,
    );
  }
});
test("storage failure and account mismatch block all writes", async () => {
  const f = fixture(),
    store = new BrowserMutationStore();
  await assert.rejects(runMutation(f.r, f.api, store, signal()));
  assert.equal(f.posts(), 0);
  f.api.operation = async () => ({
    currentUserId: randomUUID(),
    receipt: f.receipt,
  });
  await assert.rejects(
    runMutation(f.r, f.api, f.store, signal()),
    /ACCOUNT_CHANGED/,
  );
  assert.equal(f.posts(), 0);
  assert.equal((await f.store.list(scope)).length, 1);
});
test("invalid or wrong-project receipts retain the original intent", async () => {
  const f = fixture();
  f.api.unlink = async () => ({ projectId: randomUUID(), ...f.receipt });
  await assert.rejects(
    runMutation(f.r, f.api, f.store, signal()),
    /OPERATION_INVALID/,
  );
  assert.equal((await f.store.list(scope)).length, 1);
  f.api.operation = async () => ({
    currentUserId: scope.userId,
    receipt: { requestId: "invalid", revision: 1 },
  });
  await assert.rejects(
    checkMutation(f.r, f.api, f.store, signal()),
    /OPERATION_INVALID/,
  );
  assert.equal((await f.store.list(scope)).length, 1);
});
test("link lookup and mutation use the target project while retaining the source scope", () => {
  const r: FileMutation = {
    schema: 1,
    scope,
    attempts: 0,
    kind: "link",
    objectId: randomUUID(),
    targetProjectId: randomUUID(),
    input: {
      requestKey: randomUUID(),
      sourceProjectId: scope.projectId,
      versionId: "",
    },
  };
  r.input.versionId = r.objectId;
  assert.equal(validMutation(r, scope), true);
  assert.equal(operationProject(r), r.targetProjectId);
  assert.equal(mutationBody(r).projectId, r.targetProjectId);
  assert.equal(validMutation(r, { ...scope, userId: randomUUID() }), false);
  assert.equal(
    validMutation({ ...r, targetProjectId: scope.projectId }, scope),
    false,
  );
  assert.equal(mutationHash({ ...r, attempts: 25 }), mutationHash(r));
});

test("a direct library relink pins independent provenance and cannot become a project permission or unlink", () => {
  const direct = { ...scope, projectId: "library", library: true };
  const r: FileMutation = {
    schema: 1,
    scope: direct,
    attempts: 0,
    kind: "link",
    objectId: randomUUID(),
    targetProjectId: randomUUID(),
    input: { requestKey: randomUUID(), versionId: "", fromLibrary: true },
  };
  r.input.versionId = r.objectId;
  assert.equal(validMutation(r, direct), true);
  assert.equal(
    validMutation({ ...r, input: { ...r.input, fromLibrary: false } }, direct),
    false,
  );
  assert.equal(
    validMutation(
      { ...r, input: { ...r.input, sourceProjectId: scope.projectId } },
      direct,
    ),
    false,
  );
  assert.equal(
    validMutation({ ...r, scope: { ...direct, library: false } }, direct),
    false,
  );
  assert.notEqual(
    mutationHash(r),
    mutationHash({
      ...r,
      input: { ...r.input, sourceProjectId: scope.projectId },
    }),
  );
  assert.ok(
    downloadKey({
      schema: 1,
      scope: direct,
      versionId: r.objectId,
      size: 1,
      sha256: "a".repeat(64),
    }).startsWith(teamFilePrefix(direct)),
  );
  assert.equal(
    validMutation(
      {
        ...r,
        kind: "unlink",
        input: {
          requestKey: r.input.requestKey,
          revision: 0,
          reason: "remove",
        },
      },
      direct,
    ),
    false,
  );
});
// SOT: one shared policy (lib/api/session.ts serverRejected). A local session
// fence may sit over a POST the server already applied, so it never frees a key.
test("a local session fence over an applied unlink keeps the original key; its receipt settles it once", async () => {
  const f = fixture(),
    unlink = f.api.unlink;
  f.api.unlink = async (...args: Parameters<typeof unlink>) => {
    await unlink(...args).catch(() => undefined);
    throw sessionChanged();
  };
  await assert.rejects(runMutation(f.r, f.api, f.store, signal()), /API_SESSION_CHANGED/);
  assert.equal((await f.store.list(scope))[0]?.input.requestKey, f.r.input.requestKey);
  assert.deepEqual(await runMutation(f.r, f.api, f.store, signal()), f.receipt);
  assert.equal(f.posts(), 1);
});
