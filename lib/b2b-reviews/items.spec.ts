import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReviewSummary } from "../api/generated/b2b";
import { itemMeta } from "./items";

const item: ReviewSummary = {
  id: "r1",
  projectId: "p1",
  title: "고객사 a 런칭 영상",
  round: 3,
  versionId: "v1",
  ordinal: 2,
  revision: 4,
  approval: "no_approver",
  approver: null,
  previousRounds: 2,
  publisher: { userId: "u1", name: "김편집" },
  commentCount: 5,
  createdAt: "2026-10-06T00:00:00.000Z",
  updatedAt: "2026-10-07T01:02:00.000Z",
};
const ko = (k: string) => k;
const en = (_: string, e: string) => e;

test("a published item reads publisher, version, date and comment count", () => {
  assert.equal(itemMeta(item, ko, (iso) => iso.slice(0, 10)), "김편집 · v2 · 2026-10-07 · 코멘트 5");
  assert.equal(itemMeta(item, en, () => "today"), "김편집 · v2 · today · comments 5");
});

test("a publisher without a name still gets a label", () => {
  const anon = { ...item, publisher: { userId: "u2", name: null }, commentCount: 0 };
  assert.equal(itemMeta(anon, ko, () => "d"), "이름 없음 · v2 · d · 코멘트 0");
});
