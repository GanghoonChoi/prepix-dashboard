import type { Asset } from "../api/services/cloud.service";

/**
 * The PREVIEW axis, which F04.6 keeps separate from the storage verdict.
 *
 * Returns `null` when there is nothing truthful to say, and that is the common
 * case on purpose:
 *
 * - `stored` says only that the bytes are held. The storage axis already
 *   renders 보관됨, and there is no proxy worker yet, so adding a preview line
 *   here would promise a preview that cannot happen.
 * - A quarantined ORIGINAL also stays `stored` — the server never moves it to
 *   `failed`, because reporting a failed original as a failed preview is what
 *   the spec forbids. Returning `null` is what keeps that honest on this side
 *   too, even if the field ever arrives wrong.
 *
 * `failed` states that the ORIGINAL is fine, because a proxy failure must never
 * read as "upload this again".
 */
export function previewAxis(
  asset: Pick<Asset, "previewState">,
  lang: string,
): string | null {
  const ko = lang === "ko";
  switch (asset.previewState) {
    case "pending":
      return ko ? "미리보기 준비 중" : "Preparing preview";
    case "ready":
      return ko ? "미리보기 가능" : "Preview available";
    case "failed":
      return ko
        ? "미리보기 생성 실패 · 원본은 정상 보관됨"
        : "Preview could not be created · the original is stored";
    case "app_check_required":
      return ko ? "앱에서 호환성 확인 필요" : "Check compatibility in the app";
    default:
      return null;
  }
}

/** Whether a preview failure points at storage, which has a cleanup path. */
export function previewFailureIsSpace(failure: string | null) {
  return !!failure && /SPACE|STORAGE|QUOTA|FULL/i.test(failure);
}

/**
 * The STORAGE axis, and only that.
 *
 * F04.6 separates storage from preview and from app compatibility, so this
 * never folds a preview problem into a storage verdict — `previewAxis` above
 * carries that. It lived inside the archive page until the grid needed the
 * same sentence the list was already printing.
 *
 * `cancelled` is finished, so saying capacity is still held would simply be
 * wrong; `cancelling` is not finished, so saying it is released would be too.
 */
export function storageLabel(
  asset: Pick<
    Asset,
    "state" | "trashedAt" | "expiresAt" | "uploadExpiresAt"
  >,
  lang: string,
  now = Date.now(),
): string {
  const ko = lang === "ko";
  if (asset.trashedAt) return ko ? "휴지통" : "Trash";
  switch (asset.state) {
    case "ready":
      return new Date(asset.expiresAt).getTime() <= now
        ? ko
          ? "보관 기한 만료"
          : "Expired"
        : ko
          ? "보관됨"
          : "Stored";
    case "uploading":
      return new Date(asset.uploadExpiresAt).getTime() <= now
        ? ko
          ? "업로드 만료"
          : "Upload expired"
        : ko
          ? "이어 올리기 대기"
          : "Ready to resume";
    case "verifying":
      return ko ? "원본 검증 중" : "Verifying original";
    case "quarantined":
      return ko
        ? "검증 실패 · 다운로드 차단"
        : "Verification failed · download blocked";
    case "cancelling":
      return ko
        ? "취소 정리 중 · 용량 예약 유지"
        : "Cancelling · storage still reserved";
    default:
      return ko ? "취소됨 · 용량 예약 해제" : "Cancelled · reservation released";
  }
}
