"use client";
import { Download } from "lucide-react";
import {
  cloudService,
  type ArchiveDetail,
  type Asset,
} from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";

/**
 * Everything a row or a tile needs from the page to act on one asset.
 *
 * Passed as one object rather than a dozen props because the grid and the list
 * need exactly the same set, and a second copy of that parameter list is a
 * second place to forget one.
 */
export type ArchiveHandlers = {
  workspaceId: string;
  data: ArchiveDetail;
  trash: boolean;
  busy: string;
  canUpload: boolean;
  /**
   * One clock for the whole archive, ticking in the page.
   *
   * Retention and upload windows both expire while somebody is looking at the
   * screen, so these comparisons cannot read the wall clock during render —
   * that makes a component's output depend on when React happened to call it.
   * The page holds it and re-renders on a timer instead.
   */
  now: number;
  cancelUploadLabel: string;
  onDownload: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onResume: (asset: Asset) => void;
  onAction: (key: string, run: () => Promise<unknown>) => void;
  onConfirm: (label: string, run: () => Promise<unknown>) => void;
};

/**
 * One visible action, the rest behind a kebab.
 *
 * Five buttons per file turned a fifty-file archive into a wall of chrome and
 * made the one thing people come here for — the original — no easier to reach
 * than "영구 삭제". Download stays out front; the rest sit behind the same kebab
 * the members table uses.
 *
 * Shared by the list and the grid so a file offers the same things whichever
 * way you are looking at it.
 */
export function AssetActions({
  asset,
  handlers,
}: {
  asset: Asset;
  handlers: ArchiveHandlers;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const {
    workspaceId: id,
    data,
    trash,
    busy,
    canUpload,
    cancelUploadLabel,
    now,
  } = handlers;
  const ready = asset.state === "ready";
  const active =
    !asset.trashedAt && ready && new Date(asset.expiresAt).getTime() > now;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {active && data.canDownload && (
        <button
          className="grid size-9 place-items-center rounded-md text-muted transition-colors hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          disabled={!!busy}
          title={c("원본 다운로드", "Download original")}
          aria-label={c("원본 다운로드", "Download original")}
          onClick={() => handlers.onDownload(asset)}
        >
          <Download size={16} strokeWidth={1.5} />
        </button>
      )}
      <RowMenu label={c("파일 작업", "File actions")}>
        {data.canEdit && ready && !trash && (
          <>
            <RowMenuItem disabled={!!busy} onClick={() => handlers.onEdit(asset)}>
              {c("이름과 폴더 변경", "Rename or move")}
            </RowMenuItem>
            <RowMenuItem
              tone="danger"
              disabled={!!busy}
              onClick={() =>
                handlers.onConfirm(
                  c(
                    `${asset.name} 파일을 휴지통으로 옮길까요? 팀원의 다운로드가 중단됩니다.`,
                    `Move ${asset.name} to trash? Team members will no longer be able to download it.`,
                  ),
                  () => cloudService.update(id, asset.id, { trashed: true }),
                )
              }
            >
              {c("휴지통으로", "Move to trash")}
            </RowMenuItem>
          </>
        )}
        {data.canEdit && ready && trash && (
          <RowMenuItem
            disabled={!!busy || new Date(asset.expiresAt).getTime() <= now}
            onClick={() =>
              handlers.onAction(asset.id, () =>
                cloudService.update(id, asset.id, { trashed: false }),
              )
            }
          >
            {c("복구", "Restore")}
          </RowMenuItem>
        )}
        {data.canPurge && ready && trash && (
          <RowMenuItem
            tone="danger"
            disabled={!!busy}
            onClick={() =>
              handlers.onConfirm(
                c(
                  `${asset.name} 파일을 영구 삭제할까요? 원본을 복구할 수 없습니다. 저장소 정리가 끝난 뒤 용량이 반환됩니다.`,
                  `Permanently delete ${asset.name}? The original cannot be recovered. Capacity is released after storage cleanup finishes.`,
                ),
                () => cloudService.purge(id, asset.id, asset.name),
              )
            }
          >
            {c("영구 삭제", "Delete permanently")}
          </RowMenuItem>
        )}
        {asset.state === "uploading" &&
          data.canEdit &&
          asset.createdBy === data.currentUserId &&
          new Date(asset.uploadExpiresAt).getTime() > now && (
            <RowMenuItem
              disabled={!canUpload}
              onClick={() => handlers.onResume(asset)}
            >
              {c("같은 파일로 이어 올리기", "Select original to resume")}
            </RowMenuItem>
          )}
        {data.canEdit &&
          ["uploading", "quarantined", "verifying"].includes(asset.state) && (
            <RowMenuItem
              tone="danger"
              disabled={!!busy}
              onClick={() =>
                handlers.onConfirm(cancelUploadLabel, () =>
                  cloudService.cancel(id, asset.id),
                )
              }
            >
              {c("업로드 취소", "Cancel upload")}
            </RowMenuItem>
          )}
      </RowMenu>
    </div>
  );
}
