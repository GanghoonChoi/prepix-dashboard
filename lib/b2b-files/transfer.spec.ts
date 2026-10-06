import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type {
  TeamFileUpload,
  TeamFileUploadStatus,
} from "../api/generated/b2b";
import type { FileApi, FileScope } from "./api";
import {
  mergeRecord,
  scopeKey,
  validRecord,
  type TransferRecord,
  type TransferStore,
} from "./store";
import {
  prepareTransfer,
  resumeTransfer,
  cancelTransfer,
  checkParts,
} from "./transfer";

const scope: FileScope = {
  origin: "http://localhost:3312",
  userId: randomUUID(),
  workspaceId: randomUUID(),
  projectId: randomUUID(),
};
const signal = () => new AbortController().signal;
const noop = () => {};
class Store implements TransferStore {
  rows = new Map<string, TransferRecord>();
  failing = false;
  async list(s: FileScope) {
    return [...this.rows.values()].filter(
      (r) => scopeKey(r.scope) === scopeKey(s),
    );
  }
  async save(record: TransferRecord) {
    if (this.failing) throw new Error("B2B_FILE_TRANSFER_STORAGE_UNAVAILABLE");
    const saved = mergeRecord(
      this.rows.get(record.input.requestKey),
      structuredClone(record),
    );
    this.rows.set(saved.input.requestKey, saved);
    return structuredClone(saved);
  }
  async remove(record: TransferRecord) {
    this.rows.delete(record.input.requestKey);
  }
}
async function fixture(content = "original bytes") {
  const file = new File([content], "Original.wav"),
    store = new Store();
  const record = await prepareTransfer({
    file,
    scope,
    kind: "original",
    maxFileBytes: 1000,
    store,
    signal: signal(),
    progress: noop,
  });
  let upload: TeamFileUpload | null = null,
    cancelled = false,
    begins = 0,
    completes = 0;
  let parts: TeamFileUploadStatus["parts"] = [],
    needsCompletion = false;
  const api: FileApi = {
    capabilities: async () => {
      throw new Error("unused");
    },
    versions: async () => {
      throw new Error("unused");
    },
    download: async () => {
      throw new Error("unused");
    },
    lookup: async () => ({ currentUserId: scope.userId, upload, cancelled }),
    begin: async (input) => {
      begins++;
      assert.equal(
        store.rows.get(input.requestKey)?.input.sha256,
        input.sha256,
        "intent must be durable before begin",
      );
      upload ??= {
        id: randomUUID(),
        workspaceId: scope.workspaceId,
        projectId: scope.projectId,
        assetId: randomUUID(),
        versionId: randomUUID(),
        name: input.name,
        kind: input.kind,
        size: input.size,
        sha256: input.sha256,
        state: "uploading",
        failure: null,
        lastActivityAt: new Date().toISOString(),
        idleExpiresAt: new Date(Date.now() + 86400000).toISOString(),
        cleanedAt: null,
        partSize: 4,
        previewState: "not_requested",
      };
      return { upload, parts, needsCompletion };
    },
    status: async () => ({ upload: upload!, parts, needsCompletion }),
    part: async (id, number, checksum) => {
      assert.equal(id, upload!.id);
      return {
        url: `https://storage.example.test/part/${number}`,
        headers: { "x-amz-checksum-sha256": checksum },
      };
    },
    complete: async () => {
      completes++;
      upload = { ...upload!, state: "verifying" };
      return { upload };
    },
    cancel: async (requestKey) => {
      assert.equal(requestKey, record.input.requestKey);
      assert.equal(store.rows.get(requestKey)?.cancelRequested, true);
      cancelled = true;
      if (upload) upload = { ...upload, state: "cancelled" };
      return {
        uploadId: upload?.id ?? null,
        cancelled: true,
        requestId: "same-receipt",
      };
    },
  };
  return {
    file,
    store,
    record,
    api,
    stats: () => ({ begins, completes, upload }),
    partState: (p: typeof parts, complete = false) => {
      parts = p;
      needsCompletion = complete;
    },
  };
}
test("durable begin survives lost response and sends only genuinely missing parts after reload and content re-selection", async () => {
  const f = await fixture(),
    originalBegin = f.api.begin,
    numbers: number[] = [];
  f.api.begin = async (...args) => {
    await originalBegin(...args);
    throw new Error("response lost");
  };
  await assert.rejects(
    resumeTransfer({ ...f, signal: signal(), progress: noop }),
    /response lost/,
  );
  assert.equal(f.stats().begins, 1);
  f.partState([
    {
      number: 1,
      size: 4,
      etag: "part-one",
      checksum: createHash("sha256").update("orig").digest("base64"),
    },
  ]);
  const part = f.api.part;
  f.api.part = async (...args) => {
    numbers.push(args[1]);
    return part(...args);
  };
  const restored = (await f.store.list(scope))[0];
  const result = await resumeTransfer({
    record: restored,
    file: new File(["original bytes"], "Renamed.wav"),
    api: f.api,
    store: f.store,
    signal: signal(),
    progress: noop,
    put: async (_url, headers, body) => {
      assert.equal(
        headers["x-amz-checksum-sha256"],
        createHash("sha256")
          .update(Buffer.from(await body.arrayBuffer()))
          .digest("base64"),
      );
    },
  });
  assert.deepEqual(numbers, [2, 3, 4]);
  assert.equal(f.stats().begins, 1);
  assert.equal(result.state, "verifying");
});
test("same name and size do not permit resuming changed contents, and a corrupt completed part cannot be skipped", async () => {
  const f = await fixture();
  await f.api.begin(f.record.input);
  let puts = 0;
  await assert.rejects(
    resumeTransfer({
      ...f,
      file: new File(["modified bytes"], f.file.name),
      signal: signal(),
      progress: noop,
      put: async () => {
        puts++;
      },
    }),
    /UPLOAD_RESUME_MISMATCH/,
  );
  f.partState([
    {
      number: 1,
      size: 4,
      etag: "bad",
      checksum: createHash("sha256").update("bad!").digest("base64"),
    },
  ]);
  await assert.rejects(
    resumeTransfer({
      ...f,
      signal: signal(),
      progress: noop,
      put: async () => {
        puts++;
      },
    }),
    /UPLOAD_RESUME_MISMATCH/,
  );
  assert.equal(puts, 0);
  assert.equal(f.stats().completes, 0);
});
test("a completed original with lost completion reply needs no source file or part retransmission", async () => {
  const f = await fixture();
  await f.api.begin(f.record.input);
  f.partState([], true);
  const result = await resumeTransfer({
    ...f,
    file: undefined,
    signal: signal(),
    progress: noop,
    put: async () => {
      throw new Error("no parts");
    },
  });
  assert.equal(result.state, "verifying");
  assert.equal(f.stats().completes, 1);
  await resumeTransfer({
    ...f,
    file: undefined,
    signal: signal(),
    progress: noop,
  });
  assert.equal(f.stats().completes, 1);
});
test("unpersistable intent blocks network mutations; an uncertain cancellation is persisted and retries the same key", async () => {
  const f = await fixture();
  f.store.failing = true;
  await assert.rejects(
    resumeTransfer({ ...f, signal: signal(), progress: noop }),
    /STORAGE_UNAVAILABLE/,
  );
  assert.equal(f.stats().begins, 0);
  f.store.failing = false;
  const originalCancel = f.api.cancel,
    keys: string[] = [];
  f.api.cancel = async (key) => {
    keys.push(key);
    const receipt = await originalCancel(key);
    if (keys.length === 1) throw new Error("lost cancel reply");
    return receipt;
  };
  await assert.rejects(
    cancelTransfer(f.record, f.api, f.store, signal()),
    /lost cancel reply/,
  );
  assert.equal((await f.store.list(scope))[0].cancelRequested, true);
  assert.equal(
    (
      await cancelTransfer(
        (
          await f.store.list(scope)
        )[0],
        f.api,
        f.store,
        signal(),
      )
    ).cancelled,
    true,
  );
  assert.deepEqual(keys, [
    f.record.input.requestKey,
    f.record.input.requestKey,
  ]);
  await assert.rejects(
    resumeTransfer({ ...f, signal: signal(), progress: noop }),
    /B2B_FILE_CANCEL_PENDING/,
  );
  assert.equal(f.stats().begins, 0);
});
test("a cancellation from another tab is monotonic, while changed immutable inputs and a mismatched server account fail closed", async () => {
  const f = await fixture();
  await f.store.save({ ...f.record, cancelRequested: true });
  assert.equal((await f.store.save(f.record)).cancelRequested, true);
  assert.throws(
    () =>
      mergeRecord(f.record, {
        ...f.record,
        input: { ...f.record.input, name: "different.wav" },
      }),
    /RECORD_CONFLICT/,
  );
  const g = await fixture();
  g.api.lookup = async () => ({
    currentUserId: randomUUID(),
    upload: null,
    cancelled: false,
  });
  await assert.rejects(
    resumeTransfer({ ...g, signal: signal(), progress: noop }),
    /B2B_FILE_ACCOUNT_CHANGED/,
  );
  assert.equal(g.stats().begins, 0);
  assert.equal(
    validRecord(f.record, { ...scope, userId: randomUUID() }),
    false,
  );
});
test("pause aborts before another part is signed or completed and status never means catalogue-ready", async () => {
  const f = await fixture(),
    controller = new AbortController();
  let signed = 0;
  const part = f.api.part;
  f.api.part = async (...args) => {
    signed++;
    return part(...args);
  };
  await assert.rejects(
    resumeTransfer({
      ...f,
      signal: controller.signal,
      progress: noop,
      put: async () => {
        controller.abort();
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(signed, 1);
  assert.equal(f.stats().completes, 0);
  assert.equal(f.stats().upload?.state, "uploading");
});
test("malformed server part lists and unusable part size cannot drive a transfer loop", async () => {
  const f = await fixture(),
    state = await f.api.begin(f.record.input);
  for (const parts of [
    [{ number: 0, size: 4, etag: "bad" }],
    [{ number: 1, size: 3, etag: "bad" }],
    [
      { number: 1, size: 4, etag: "a" },
      { number: 1, size: 4, etag: "b" },
    ],
  ])
    assert.throws(() => checkParts({ ...state, parts }), /PARTS_INVALID/);
  assert.throws(
    () => checkParts({ ...state, upload: { ...state.upload, partSize: 0 } }),
    /PART_SIZE_INVALID/,
  );
});
