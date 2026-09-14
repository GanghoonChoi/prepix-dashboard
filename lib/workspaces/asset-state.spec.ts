import { test } from "node:test";
import assert from "node:assert/strict";
import { previewAxis, previewFailureIsSpace } from "./asset-state";
import type { Asset } from "../api/services/cloud.service";

const row = (previewState?: Asset["previewState"]) =>
  ({ previewState }) as Pick<Asset, "previewState">;

// F04.6 wants the preview axis distinguishable from the storage verdict. The
// harness has no proxy worker, so these five values are pinned here rather than
// end to end.
test("each preview state gets its own line, in both languages", () => {
  assert.equal(previewAxis(row("pending"), "ko"), "미리보기 준비 중");
  assert.equal(previewAxis(row("pending"), "en"), "Preparing preview");
  assert.equal(previewAxis(row("ready"), "ko"), "미리보기 가능");
  assert.equal(previewAxis(row("ready"), "en"), "Preview available");
  assert.equal(
    previewAxis(row("app_check_required"), "ko"),
    "앱에서 호환성 확인 필요",
  );
  assert.equal(
    previewAxis(row("app_check_required"), "en"),
    "Check compatibility in the app",
  );
  // A proxy failure must never read as "the upload failed, do it again".
  for (const lang of ["ko", "en"])
    assert.match(
      previewAxis(row("failed"), lang)!,
      lang === "ko" ? /원본은 정상 보관됨/ : /the original is stored/,
      lang,
    );
});

// The important silence. `stored` is the resting state of every row today, and
// a quarantined ORIGINAL deliberately stays `stored` too — so anything that
// starts printing a preview line here would be reporting a failed original as a
// failed preview, which the spec forbids.
test("stored says nothing on the preview axis, and neither does a missing field", () => {
  for (const lang of ["ko", "en"]) {
    assert.equal(previewAxis(row("stored"), lang), null);
    // Older server: no field at all.
    assert.equal(previewAxis(row(undefined), lang), null);
  }
});

test("only a storage-shaped failure offers the cleanup path", () => {
  assert.equal(previewFailureIsSpace("PREVIEW_STORAGE_FULL"), true);
  assert.equal(previewFailureIsSpace("TEAM_STORAGE_QUOTA_EXCEEDED"), true);
  assert.equal(previewFailureIsSpace("TRANSCODE_UNSUPPORTED"), false);
  assert.equal(previewFailureIsSpace(null), false);
});
