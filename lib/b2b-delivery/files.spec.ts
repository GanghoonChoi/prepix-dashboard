import { test } from "node:test";
import assert from "node:assert/strict";
import { nativeDeliveryItems, verifiedOpenedItems, type InspectedDeliveryFile } from "./files";
import type { TeamNativeProject } from "../api/generated/b2b";
const inspected = (name: string, size: number, sha256: string): InspectedDeliveryFile => ({ file: { name } as File, size, sha256 });
const document: TeamNativeProject = { format: "prepix-team-project", formatVersion: 1, createdAt: new Date().toISOString(), document: { version: 4 }, sources: [{ mediaId: "original-1", name: "cut.mp4", kind: "video", size: 120, sha256: "a".repeat(64), durationTicks: 720000, width: 1920, height: 1080, frameRate: 30, audioChannels: 2 }] };
test("native proposals require the exact source bytes and keep source measurements", () => {
  const project = inspected("working.prepixwork", 100, "b".repeat(64));
  assert.throws(() => nativeDeliveryItems(document, project, [inspected("cut.mp4", 120, "c".repeat(64))], [], []), /SOURCE_MANIFEST_MISMATCH/);
  const list = nativeDeliveryItems(document, project, [inspected("renamed.mp4", 120, "a".repeat(64))], [], []);
  assert.equal(list.length, 2);
  assert.equal(list[1].itemId, "original-1");
  assert.equal(list[1].media?.durationTicks, 720000);
  assert.equal(list[1].location, "external");
});
test("open evidence requires every complete file; matching names or changed size cannot pass", () => {
  const list = nativeDeliveryItems(document, inspected("working.prepixwork", 100, "b".repeat(64)), [inspected("cut.mp4", 120, "a".repeat(64))], [], []);
  assert.throws(() => verifiedOpenedItems(list, [inspected("working.prepixwork", 100, "b".repeat(64))]), /OPENED_FILES_MISMATCH/);
  assert.throws(() => verifiedOpenedItems(list, [inspected("working.prepixwork", 100, "b".repeat(64)), inspected("cut.mp4", 121, "a".repeat(64))]), /OPENED_FILES_MISMATCH/);
  const opened = verifiedOpenedItems(list, [inspected("another-name", 100, "b".repeat(64)), inspected("elsewhere", 120, "a".repeat(64))]);
  assert.equal(opened[1].itemId, "original-1");
  assert.equal(opened[1].media?.audioChannels, 2);
});
