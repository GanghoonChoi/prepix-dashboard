import { test } from "node:test";
import assert from "node:assert/strict";
import { POSTER_LIMIT, evictable, posterKey } from "./poster-cache";

test("a re-uploaded file does not inherit the old poster", () => {
  // The id survives a replace in some flows; the digest never does. Keying on
  // the id alone would show the previous cut's frame on the new file, which is
  // worse than showing nothing at all.
  const before = posterKey({ id: "asset-1", sha256: "a".repeat(64) });
  const after = posterKey({ id: "asset-1", sha256: "b".repeat(64) });
  assert.notEqual(before, after);
  assert.equal(before, posterKey({ id: "asset-1", sha256: "a".repeat(64) }));
});

test("different assets never collide", () => {
  assert.notEqual(
    posterKey({ id: "a", sha256: "1" }),
    posterKey({ id: "b", sha256: "1" }),
  );
  // A separator that cannot appear in either field, so "a" + "b:c" and
  // "a:b" + "c" stay distinct.
  assert.notEqual(
    posterKey({ id: "a", sha256: "b:c" }),
    posterKey({ id: "a:b", sha256: "c" }),
  );
});

test("nothing is evicted while under the limit", () => {
  const entries = [
    { key: "k1", at: 1 },
    { key: "k2", at: 2 },
  ];
  assert.deepEqual(evictable(entries, 10), []);
  assert.deepEqual(evictable([], 10), []);
});

test("the oldest go first, and only enough to fit", () => {
  const entries = [
    { key: "newest", at: 500 },
    { key: "oldest", at: 100 },
    { key: "middle", at: 300 },
    { key: "old", at: 200 },
  ];
  assert.deepEqual(evictable(entries, 2), ["oldest", "old"]);
  assert.deepEqual(evictable(entries, 3), ["oldest"]);
  assert.deepEqual(evictable(entries, 0), ["oldest", "old", "middle", "newest"]);
});

test("the shipped limit is a real bound, not a placeholder", () => {
  assert.ok(POSTER_LIMIT > 0 && POSTER_LIMIT <= 1000);
});
