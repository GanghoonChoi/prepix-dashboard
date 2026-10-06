import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  checkRequest,
  runRequest,
  requestHash,
  requestKey,
  sameRequestIntent,
  validRequest,
  type RequestRecord,
  type RequestStore,
  type RequestScope,
} from "./operations";
import type { ProjectRequestMutationResult } from "../api/generated/b2b";
const scope: RequestScope = {
  origin: "https://api.example.test",
  userId: randomUUID(),
  workspaceId: randomUUID(),
  projectId: randomUUID(),
};
const target = randomUUID(),
  submissionId = randomUUID();
function record(action: RequestRecord["action"]): RequestRecord {
  const common = { requestKey: randomUUID() };
  const input =
    action === "create"
      ? { ...common, title: "Deliver source", body: "Editable project" }
      : action === "submit"
        ? {
            ...common,
            requestRevision: 1,
            versionIds: [randomUUID()],
            note: "",
          }
        : action === "decide"
          ? { ...common, decision: "confirmed", note: "" }
          : ["close", "reopen"].includes(action)
            ? { ...common, revision: 4, reason: "Recheck delivery" }
            : {
                ...common,
                revision: 4,
                title: "Deliver source",
                body: "Editable project",
              };
  return {
    schema: 1,
    scope,
    action,
    input,
    attempts: 0,
    ...(action !== "create" ? { target } : {}),
    ...(action === "decide" ? { submissionId } : {}),
  };
}
const receipt = (r: RequestRecord): ProjectRequestMutationResult => ({
  requestId: randomUUID(),
  request: {
    id: r.target ?? randomUUID(),
    revision: r.action === "create" ? 0 : 5,
    state:
      r.action === "submit"
        ? "submitted"
        : r.action === "decide"
          ? "confirmed"
          : r.action === "close"
            ? "waived"
            : "open",
  },
  ...(r.action === "submit" ? { submissionId: randomUUID() } : {}),
  ...(r.action === "decide" ? { confirmationId: randomUUID() } : {}),
});
class MemoryStore implements RequestStore {
  row?: RequestRecord;
  async list(s: RequestScope) {
    return this.row && requestKey(this.row.scope) === requestKey(s)
      ? [this.row]
      : [];
  }
  async prepare(r: RequestRecord) {
    if (this.row && !sameRequestIntent(this.row, r)) throw new Error("pending");
    return (this.row ??= structuredClone(r));
  }
  async start(r: RequestRecord) {
    assert.equal(this.row?.input.requestKey, r.input.requestKey);
    return (this.row = { ...this.row!, attempts: this.row!.attempts + 1 });
  }
  async finish(r: RequestRecord) {
    assert.ok(!this.row || this.row.input.requestKey === r.input.requestKey);
    this.row = undefined;
  }
  async rejectFirst(r: RequestRecord) {
    if (
      this.row?.input.requestKey === r.input.requestKey &&
      this.row.attempts === 1 &&
      r.attempts === 1
    )
      this.row = undefined;
  }
}
const signal = () => new AbortController().signal;
test("request records bind account, service, project, target, submission and the canonical original input", () => {
  const r = record("decide");
  assert.ok(validRequest(r, scope));
  assert.ok(
    !validRequest(structuredClone(r), { ...scope, userId: randomUUID() }),
  );
  assert.ok(
    !validRequest(structuredClone(r), { ...scope, projectId: randomUUID() }),
  );
  assert.ok(
    !validRequest(structuredClone(r), {
      ...scope,
      origin: "https://other.example.test",
    }),
  );
  assert.equal(sameRequestIntent(r, { ...r, target: randomUUID() }), false);
  assert.equal(
    sameRequestIntent(r, { ...r, submissionId: randomUUID() }),
    false,
  );
  assert.ok(
    sameRequestIntent(r, {
      ...r,
      input: { ...r.input, requestKey: randomUUID() },
    }),
  );
  assert.equal(
    requestHash(r),
    requestHash({
      ...r,
      input: {
        note: "",
        decision: "confirmed",
        requestKey: r.input.requestKey,
      },
    }),
  );
  assert.ok(!validRequest({ ...r, submissionId: undefined }, scope));
  assert.ok(
    !validRequest(
      {
        ...record("close"),
        input: { requestKey: randomUUID(), revision: 4, reason: "" },
      },
      scope,
    ),
  );
});
test("every request action survives a lost applied response and client restart using lookup alone", async () => {
  for (const action of [
    "create",
    "update",
    "accept",
    "close",
    "reopen",
    "submit",
    "decide",
  ] as const) {
    const r = record(action),
      store = new MemoryStore();
    let applied = 0,
      result: ProjectRequestMutationResult | null = null;
    const api = {
      operation: async () => ({ currentUserId: scope.userId, receipt: result }),
      apply: async () => {
        applied++;
        result = receipt(r);
        throw new Error("response lost");
      },
    };
    await assert.rejects(runRequest(r, api, store, signal()), /response lost/);
    assert.equal(store.row?.attempts, 1);
    const restored = structuredClone(store.row!);
    const confirmed = await checkRequest(restored, api, store, signal());
    assert.deepEqual(confirmed, result);
    assert.equal(applied, 1);
    assert.equal(store.row, undefined);
  }
});
test("an empty receipt never performs a POST; wrong actor, target, state and revision cannot clear pending intent", async () => {
  const r = record("update");
  for (const mutate of [
    (v: ProjectRequestMutationResult) => v,
    (v: ProjectRequestMutationResult) => ({
      ...v,
      request: { ...v.request, id: randomUUID() },
    }),
    (v: ProjectRequestMutationResult) => ({
      ...v,
      request: { ...v.request, revision: 99 },
    }),
  ]) {
    const store = new MemoryStore();
    await store.prepare(r);
    const value = mutate(receipt(r));
    let applied = 0;
    const api = {
      operation: async () => ({
        currentUserId: scope.userId,
        receipt: value,
      }),
      apply: async () => {
        applied++;
      },
    };
    if (value.request.id === r.target && value.request.revision === 5) {
      api.operation = async () => ({
        currentUserId: randomUUID(),
        receipt: value,
      });
    }
    await assert.rejects(checkRequest(r, api, store, signal()));
    assert.ok(store.row);
    assert.equal(applied, 0);
  }
  const store = new MemoryStore();
  await store.prepare(r);
  let posts = 0;
  assert.equal(
    await checkRequest(
      r,
      {
        operation: async () => ({ currentUserId: scope.userId, receipt: null }),
        apply: async () => {
          posts++;
        },
      },
      store,
      signal(),
    ),
    null,
  );
  assert.ok(store.row);
  assert.equal(posts, 0);
  const submitting = record("submit"),
    pending = new MemoryStore();
  await pending.prepare(submitting);
  const malformed = {
    ...receipt(submitting),
    request: { id: target, state: "confirmed" as const, revision: 5 },
  };
  await assert.rejects(
    checkRequest(
      submitting,
      {
        operation: async () => ({
          currentUserId: scope.userId,
          receipt: malformed,
        }),
        apply: async () => {},
      },
      pending,
      signal(),
    ),
  );
  assert.ok(pending.row);
});
test("prior ambiguous attempts stay pending after revoked access, while a first definitive POST rejection clears", async () => {
  const r = record("submit"),
    store = new MemoryStore();
  const denied = { response: { status: 403 } };
  const api = {
    operation: async () => ({ currentUserId: scope.userId, receipt: null }),
    apply: async () => {
      throw new Error("lost before reply");
    },
  };
  await assert.rejects(runRequest(r, api, store, signal()));
  api.apply = async () => {
    throw denied;
  };
  await assert.rejects(
    runRequest(
      { ...r, input: { ...r.input, requestKey: randomUUID() } },
      api,
      store,
      signal(),
    ),
  );
  assert.equal(store.row?.input.requestKey, r.input.requestKey);
  assert.equal(store.row?.attempts, 2);
  const fresh = new MemoryStore();
  await assert.rejects(runRequest(record("submit"), api, fresh, signal()));
  assert.equal(fresh.row, undefined);
});
test("a changed intent or failed persistence prevents a server mutation and an unverified POST body never clears the record", async () => {
  const r = record("close"),
    store = new MemoryStore();
  await store.prepare(r);
  let posts = 0;
  const api = {
    operation: async () => ({ currentUserId: scope.userId, receipt: null }),
    apply: async () => {
      posts++;
    },
  };
  await assert.rejects(
    runRequest({ ...r, action: "reopen" }, api, store, signal()),
  );
  assert.equal(posts, 0);
  const broken = {
    ...store,
    prepare: async () => {
      throw new Error("disk full");
    },
  } as unknown as RequestStore;
  await assert.rejects(runRequest(r, api, broken, signal()), /disk full/);
  assert.equal(posts, 0);
  await assert.rejects(runRequest(r, api, store, signal()), /PENDING/);
  assert.equal(posts, 1);
  assert.ok(store.row);
});
