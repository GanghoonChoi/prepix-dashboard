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
    resume: asset,
    signal: new AbortController().signal,
    onCreated: () => {},
    onProgress: () => {},
  });
  assert.equal(completed, 1);
  assert.equal(result.state, "verifying");
});

// Pins the partSize guard: `offset += status.partSize` trusted the server, so a
// 0 (or absurdly small) part size spun forever instead of failing.
test("an unusable part size fails instead of looping forever", async (t) => {
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
  cloudService.begin = async () => ({ asset, partSize: 0 });
  cloudService.part = async () => {
    throw new Error("A part must never be requested with an unusable size");
  };
  cloudService.complete = async () => asset;
  for (const partSize of [0, -1, 0.5, Number.NaN]) {
    cloudService.upload = async () => ({
      asset,
      partSize,
      parts: [],
      needsCompletion: false,
    });
    await assert.rejects(
      uploadFile({
        file,
        workspaceId: "team",
        resume: asset,
        signal: new AbortController().signal,
        onCreated: () => {},
        onProgress: () => {},
      }),
      { message: "UPLOAD_PART_SIZE_INVALID" },
      `partSize ${partSize}`,
    );
  }
  // A part size that is positive but absurd is the same hang by another route:
  // 1 byte per part over a 50 GB original is 50 billion round trips.
  const huge = {
    name: "50gb.mov",
    size: 50_000_000_000,
    slice: () => new Blob([]),
  } as unknown as File;
  cloudService.upload = async () => ({
    asset: { ...asset, size: huge.size },
    partSize: 1,
    parts: [],
    needsCompletion: false,
  });
  await assert.rejects(
    uploadFile({
      file: huge,
      workspaceId: "team",
      resume: { ...asset, size: huge.size },
      digest: asset.sha256,
      signal: new AbortController().signal,
      onCreated: () => {},
      onProgress: () => {},
    }),
    { message: "UPLOAD_PART_SIZE_INVALID" },
  );
});

// Pins the resume path: a digest already computed for this exact File object is
// reused, so pausing a 50 GB original does not re-hash it to resume.
test("resuming reuses the digest already computed for the same file", async (t) => {
  const original = { ...cloudService };
  t.after(() => Object.assign(cloudService, original));
  const file = new File(["original bytes"], "source.bin");
  const digest = createHash("sha256").update("original bytes").digest("hex");
  const asset = {
    id: "upload",
    name: file.name,
    size: file.size,
    sha256: digest,
    state: "uploading",
    folderId: null,
  } as Asset;
  cloudService.begin = async () => ({ asset, partSize: 16 * 1024 * 1024 });
  cloudService.upload = async () => ({
    asset,
    partSize: 16 * 1024 * 1024,
    parts: [],
    needsCompletion: true,
  });
  cloudService.complete = async () => ({ ...asset, state: "verifying" });
  const phases: string[] = [];
  await uploadFile({
    file,
    workspaceId: "team",
    resume: asset,
    digest,
    signal: new AbortController().signal,
    onCreated: () => {},
    onProgress: (phase) => phases.push(phase),
  });
  assert.equal(phases.includes("hashing"), false);
});
