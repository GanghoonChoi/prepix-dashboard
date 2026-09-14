import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canCancel,
  canPause,
  canResume,
  fileRejection,
  nextQueued,
  patch,
  queueSummary,
  transferProgress,
  type Transfer,
} from "./queue";

const maxFileBytes = 1_000;
function enqueue(files: { name: string; size: number }[]): Transfer[] {
  return files.map((file, index) => {
    const error = fileRejection(file, maxFileBytes);
    return {
      id: `t${index}`,
      name: file.name,
      total: file.size,
      hashed: 0,
      sent: 0,
      state: error ? "invalid" : "queued",
      error,
    };
  });
}

// Pins BLOCKER 2.1. The old guard was
// `files.some(f => f.size === 0 || f.size > max)` followed by a single
// setError and no upload at all: one bad sidecar refused the whole drop.
test("one rejected file is marked in the queue and the rest still upload", () => {
  const queue = enqueue([
    { name: "a.mov", size: 10 },
    { name: "sidecar.xml", size: 0 },
    { name: "b.mov", size: 20 },
    { name: "huge.mov", size: 5_000 },
  ]);
  assert.deepEqual(
    queue.map((t) => t.state),
    ["queued", "invalid", "queued", "invalid"],
  );
  assert.deepEqual(
    queue.filter((t) => t.state === "invalid").map((t) => t.name),
    ["sidecar.xml", "huge.mov"],
  );
  // Every rejection names itself; none of them is a verdict on the selection.
  assert.equal(queue[1].error, "UPLOAD_FILE_INVALID");
  assert.equal(nextQueued(queue)?.name, "a.mov");
  assert.equal(queueSummary(queue).waiting, 2);
});

// Pins BLOCKER 2.2. The old `for` loop threw out of the batch on file 3, so
// files 4..N were never attempted and carried no status at all.
test("a failure on one file does not end the queue", () => {
  let queue = enqueue([
    { name: "1.mov", size: 10 },
    { name: "2.mov", size: 10 },
    { name: "3.mov", size: 10 },
  ]);
  queue = patch(queue, "t0", { state: "done", sent: 10 });
  queue = patch(queue, "t1", { state: "failed", error: "UPLOAD_TRANSFER_FAILED" });
  // The next file is still reachable — this is the `continue` the loop lacked.
  assert.equal(nextQueued(queue)?.name, "3.mov");
  assert.deepEqual(queueSummary(queue), {
    total: 3,
    done: 1,
    failed: 1,
    running: 0,
    waiting: 1,
  });
  // And the failed row is retryable on its own, without re-picking the others.
  assert.equal(canResume("failed"), true);
  queue = patch(queue, "t1", { state: "queued", error: undefined });
  assert.equal(nextQueued(queue)?.name, "2.mov");
});

// Pins BLOCKER 2.3. One AbortController for the batch meant "pause" stopped
// everything and the user was told to re-select the remaining files by hand.
test("pausing one transfer leaves the other rows alone", () => {
  let queue = enqueue([
    { name: "1.mov", size: 10 },
    { name: "2.mov", size: 10 },
    { name: "3.mov", size: 10 },
  ]);
  queue = patch(queue, "t0", { state: "uploading", sent: 4 });
  assert.equal(canPause("uploading"), true);
  queue = patch(queue, "t0", { state: "paused" });
  assert.deepEqual(
    queue.map((t) => t.state),
    ["paused", "queued", "queued"],
  );
  // A paused row keeps its progress, so resuming does not start from zero.
  assert.equal(queue[0].sent, 4);
  assert.equal(canResume("paused"), true);
  assert.equal(nextQueued(queue)?.name, "2.mov");
  // Settled rows are done being acted on.
  for (const state of ["done", "cancelled", "invalid"] as const)
    assert.equal(canCancel(state), false, state);
  assert.equal(canCancel("queued"), true);
});

// Pins BLOCKER 2.4 and the hashing phase: queued files are visible rows, and
// finishing the hash does not slam a full bar back to zero.
test("every file has its own row, and hashing has its own progress", () => {
  let queue = enqueue([
    { name: "1.mov", size: 100 },
    { name: "2.mov", size: 100 },
  ]);
  assert.equal(queue.length, 2);
  assert.deepEqual(transferProgress(queue[1]), { value: 0, max: 100 });

  queue = patch(queue, "t0", { state: "hashing", hashed: 100 });
  assert.deepEqual(transferProgress(queue[0]), { value: 100, max: 100 });
  // The transfer bar starts from transferred bytes, not from the hash's 100%.
  queue = patch(queue, "t0", { state: "uploading", sent: 25 });
  assert.deepEqual(transferProgress(queue[0]), { value: 25, max: 100 });
  queue = patch(queue, "t0", { state: "done", sent: 100 });
  assert.deepEqual(transferProgress(queue[0]), { value: 100, max: 100 });
});
