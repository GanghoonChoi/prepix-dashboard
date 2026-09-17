import { test } from "node:test";
import assert from "node:assert/strict";
import {
  READY_TO_PLAY,
  isPlayable,
  nextSort,
  sortAssets,
  type ArchiveSort,
} from "./archive-view";

type Row = {
  name: string;
  size: number;
  createdAt: string;
  state: string;
  trashedAt: string | null;
  expiresAt: string;
};
const asset = (over: Partial<Row>): Row => ({
  name: "a.mp4",
  size: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  state: READY_TO_PLAY,
  trashedAt: null,
  expiresAt: "2099-01-01T00:00:00.000Z",
  ...over,
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

test("a clip numbered 10 sorts after the one numbered 2", () => {
  // Plain lexicographic order puts clip10 between clip1 and clip2, which is
  // wrong for the only naming scheme a camera actually produces.
  const rows = [
    asset({ name: "clip10.mp4" }),
    asset({ name: "clip2.mp4" }),
    asset({ name: "clip1.mp4" }),
  ];
  assert.deepEqual(names(sortAssets(rows, { key: "name", dir: "asc" })), [
    "clip1.mp4",
    "clip2.mp4",
    "clip10.mp4",
  ]);
});

test("names sort by locale, not by code point", () => {
  const rows = [asset({ name: "하늘.mp4" }), asset({ name: "가을.mp4" })];
  assert.deepEqual(names(sortAssets(rows, { key: "name", dir: "asc" })), [
    "가을.mp4",
    "하늘.mp4",
  ]);
});

test("size and date sort both ways", () => {
  const rows = [
    asset({ name: "mid", size: 20, createdAt: "2026-02-01T00:00:00.000Z" }),
    asset({ name: "big", size: 30, createdAt: "2026-03-01T00:00:00.000Z" }),
    asset({ name: "small", size: 10, createdAt: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(names(sortAssets(rows, { key: "size", dir: "asc" })), [
    "small",
    "mid",
    "big",
  ]);
  assert.deepEqual(names(sortAssets(rows, { key: "size", dir: "desc" })), [
    "big",
    "mid",
    "small",
  ]);
  assert.deepEqual(names(sortAssets(rows, { key: "createdAt", dir: "desc" })), [
    "big",
    "mid",
    "small",
  ]);
});

test("sorting does not mutate the array it was given", () => {
  const rows = [asset({ name: "b.mp4" }), asset({ name: "a.mp4" })];
  sortAssets(rows, { key: "name", dir: "asc" });
  assert.deepEqual(names(rows), ["b.mp4", "a.mp4"]);
});

test("equal keys keep the server's order", () => {
  // The server already orders by upload time; a sort on a column where every
  // row ties must not reshuffle that into an arbitrary order.
  const rows = [
    asset({ name: "first", size: 5 }),
    asset({ name: "second", size: 5 }),
    asset({ name: "third", size: 5 }),
  ];
  assert.deepEqual(names(sortAssets(rows, { key: "size", dir: "asc" })), [
    "first",
    "second",
    "third",
  ]);
});

test("clicking a column toggles it, clicking a new one starts fresh", () => {
  const byName: ArchiveSort = { key: "name", dir: "asc" };
  assert.deepEqual(nextSort(byName, "name"), { key: "name", dir: "desc" });
  assert.deepEqual(nextSort({ key: "name", dir: "desc" }, "name"), {
    key: "name",
    dir: "asc",
  });
  // A new column starts descending for the two where "most" is the
  // interesting end, and ascending for a name.
  assert.deepEqual(nextSort(byName, "size"), { key: "size", dir: "desc" });
  assert.deepEqual(nextSort(byName, "createdAt"), {
    key: "createdAt",
    dir: "desc",
  });
  assert.deepEqual(nextSort({ key: "size", dir: "asc" }, "name"), {
    key: "name",
    dir: "asc",
  });
});

test("only a stored, unexpired, untrashed original is worth opening", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  assert.equal(
    isPlayable(asset({ state: READY_TO_PLAY, expiresAt: future })),
    true,
  );
  // Still arriving, quarantined, trashed or past its retention: the bytes are
  // either not there or must not be handed out, and the player would open onto
  // a signed URL the server refuses.
  assert.equal(
    isPlayable(asset({ state: "uploading", expiresAt: future })),
    false,
  );
  assert.equal(
    isPlayable(asset({ state: "quarantined", expiresAt: future })),
    false,
  );
  assert.equal(
    isPlayable(asset({ state: READY_TO_PLAY, expiresAt: future, trashedAt: past })),
    false,
  );
  assert.equal(
    isPlayable(asset({ state: READY_TO_PLAY, expiresAt: past })),
    false,
  );
});
