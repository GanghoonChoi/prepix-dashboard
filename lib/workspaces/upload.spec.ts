import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fileDigest, resumeMatches, bytes, uploadFile } from "./upload";
import { cloudService } from "../api/services/cloud.service";
import type { Asset } from "../api/services/cloud.service";
test("incremental digest preserves exact bytes across chunk boundaries without reading the full file", async () => {
  const content = Buffer.alloc(9 * 1024 * 1024 + 17, 52);
  const blob = new Blob([content]);
  blob.arrayBuffer = async () => {
    throw new Error("Whole-file buffer forbidden");
  };
  const progress: number[] = [];
  assert.equal(
    await fileDigest(blob, new AbortController().signal, (n) =>
      progress.push(n),
    ),
    createHash("sha256").update(content).digest("hex"),
  );
  assert.deepEqual(progress, [
    4 * 1024 * 1024,
    8 * 1024 * 1024,
    content.length,
  ]);
});
test("pause interrupts hashing and resume checks content, not just file names", async () => {
  const controller = new AbortController();
  await assert.rejects(
    fileDigest(
      new Blob([Buffer.alloc(9 * 1024 * 1024)]),
      controller.signal,
      () => controller.abort(),
    ),
    { name: "AbortError" },
  );
  const asset = {
    sha256: "a".repeat(64),
    size: 3,
    name: "original.mov",
  } as Asset;
  assert.equal(
    resumeMatches({ name: "original.mov", size: 3 }, "b".repeat(64), asset),
    false,
  );
  assert.equal(
    resumeMatches({ name: "renamed.mov", size: 3 }, asset.sha256, asset),
    true,
  );
  assert.equal(
    resumeMatches({ name: "original.mov", size: 4 }, asset.sha256, asset),
    false,
  );
});
test("storage labels use decimal GB consistently with the quota", () => {
  assert.equal(bytes(300_000_000_000), "300 GB");
  assert.equal(bytes(0), "0 B");
});
test("a stored original with a lost completion response is finalized without uploading parts again", async (t) => {
  const original = { ...cloudService };
  t.after(() => Object.assign(cloudService, original));
  const file = new File(["original bytes"], "source.bin");
  const asset = {
    id: "upload",
    name: file.name,
    size: file.size,
    sha256: createHash("sha256").update("original bytes").digest("hex"),
    state: "uploading",
    folderId: null,
  } as Asset;
  let completed = 0;
  cloudService.begin = async () => ({ asset, partSize: 16 * 1024 * 1024 });
  cloudService.upload = async () => ({
    asset,
    partSize: 16 * 1024 * 1024,
    parts: [],
    needsCompletion: true,
  });
  cloudService.part = async () => {
    throw new Error("Already stored bytes must not be uploaded again");
  };
  cloudService.complete = async () => {
    completed++;
    return { ...asset, state: "verifying" };
  };
  const result = await uploadFile({
    file,
    workspaceId: "team",
    projectId: "project",
    resume: asset,
    signal: new AbortController().signal,
    onCreated: () => {},
    onProgress: () => {},
  });
  assert.equal(completed, 1);
  assert.equal(result.state, "verifying");
});
