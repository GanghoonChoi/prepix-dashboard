import { test } from "node:test";
import assert from "node:assert/strict";
import { sortRows } from "../components/ui/sort";

test("sortRows: numbers by value, text with numbers inside, empties last either way", () => {
  const rows = [{ n: "자료 10", v: 3 }, { n: "자료 2", v: null }, { n: "가", v: 10 }];
  const by = (dir: "asc" | "desc", key: "n" | "v") => sortRows(rows, { key, dir }, (r, k) => r[k], "ko").map((r) => r.n);
  assert.deepEqual(by("asc", "n"), ["가", "자료 2", "자료 10"]);
  assert.deepEqual(by("desc", "n"), ["자료 10", "자료 2", "가"]);
  assert.deepEqual(by("asc", "v"), ["자료 10", "가", "자료 2"]);
  assert.deepEqual(by("desc", "v"), ["가", "자료 10", "자료 2"]);
});
