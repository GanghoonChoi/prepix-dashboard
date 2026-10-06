import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  clearPending,
  kst,
  loadPending,
  monthLabel,
  savePending,
  verifiedPdf,
  type StatementScope,
} from "./statements";

class Memory {
  rows = new Map<string, string>();
  getItem = (k: string) => this.rows.get(k) ?? null;
  setItem = (k: string, v: string) => void this.rows.set(k, v);
  removeItem = (k: string) => void this.rows.delete(k);
}
const scope: StatementScope = {
  origin: "http://127.0.0.1:3558",
  userId: randomUUID(),
  workspaceId: randomUUID(),
};

test("a pending issue request is exact to service, account, team and month", () => {
  const storage = new Memory(),
    key = randomUUID();
  savePending(storage, scope, "2027-01", key);
  assert.equal(loadPending(storage, scope, "2027-01")?.requestKey, key);
  for (const other of [
    { ...scope, origin: "http://127.0.0.1:3308" },
    { ...scope, userId: randomUUID() },
    { ...scope, workspaceId: randomUUID() },
  ])
    assert.equal(loadPending(storage, other, "2027-01"), null);
  assert.equal(loadPending(storage, scope, "2027-02"), null);
  storage.rows.set([...storage.rows.keys()][0], "{broken");
  assert.equal(loadPending(storage, scope, "2027-01"), null);
  clearPending(storage, scope, "2027-01");
  assert.equal(storage.rows.size, 0);
});

test("only the exact issued bytes verify", () => {
  const bytes = new TextEncoder().encode("%PDF-1.7 statement");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.ok(verifiedPdf(bytes.buffer, { sha256, bytes: bytes.length }));
  const changed = bytes.slice();
  changed[changed.length - 1] ^= 1;
  assert.equal(verifiedPdf(changed.buffer, { sha256, bytes: bytes.length }), false);
  assert.equal(verifiedPdf(bytes.buffer, { sha256, bytes: bytes.length + 1 }), false);
});

test("labels use the Korean calendar month and KST", () => {
  assert.equal(monthLabel("2027-01"), "2027년 1월");
  assert.equal(monthLabel("2027-01", "en"), "January 2027");
  assert.equal(kst("2027-01-31T15:00:00.000Z"), "2027-02-01 00:00");
  assert.equal(kst(null), "-");
});
