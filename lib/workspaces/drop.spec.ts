import { test } from "node:test";
import assert from "node:assert/strict";
import { folderPaths, readDrop } from "./drop";

// Minimal FileSystemEntry doubles: a folder reads its children in two batches,
// like Chrome's 100-at-a-time readEntries.
const file = (name: string) => ({ name, isFile: true, isDirectory: false, file: (ok: (f: File) => void) => ok(new File(["x"], name)) });
const dir = (name: string, children: unknown[]) => ({
  name,
  isFile: false,
  isDirectory: true,
  createReader: () => {
    const batches = [children.slice(0, 1), children.slice(1), []];
    return { readEntries: (ok: (e: unknown[]) => void) => ok(batches.shift()!) };
  },
});

test("a dropped folder keeps its tree; junk and loose files are handled", async () => {
  const dropped = await readDrop([
    new File(["x"], "loose.mov"),
    dir("Shoot", [file("a.mov"), file(".DS_Store"), dir("Day 2", [file("b.mov")])]),
  ] as never);
  assert.deepEqual(
    dropped.map((d) => [d.path.join("/"), d.file.name]),
    [["", "loose.mov"], ["Shoot", "a.mov"], ["Shoot/Day 2", "b.mov"]],
  );
  assert.deepEqual(folderPaths(dropped), [["Shoot"], ["Shoot", "Day 2"]]);
});
