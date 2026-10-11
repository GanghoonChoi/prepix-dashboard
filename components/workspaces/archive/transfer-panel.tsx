"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Pause, Play, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { bytes } from "@/lib/workspaces/upload";
import {
  canCancel,
  canPause,
  canResume,
  isSettled,
  transferProgress,
  type Transfer,
} from "@/lib/workspaces/queue";
import type { UploadQueue } from "@/lib/workspaces/use-upload-queue";
import { CloudProgress, cloudMessage } from "@/components/workspaces/cloud-shared";
import { Button, IconButton } from "@/components/ui";

/** What the upload queue is doing, one row per file (F04.3) — a tray in the
 * corner, like a video cloud's upload sheet (2026-10-08): it floats over the
 * archive instead of pushing it down, and folds to one line. */
export function TransferPanel({
  queue,
  onCancel,
}: {
  queue: UploadQueue;
  /** The page owns the confirmation, because it owns the dialog. */
  onCancel: (entry: Transfer) => void;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const { transfers, summary } = queue;
  const [folded, setFolded] = useState(false);
  if (!transfers.length) return null;

  /*
    The two passes are numbered because the bar crosses its halfway mark when
    the second one starts.

    `uploadFile` hashes the whole file before it sends a byte — the server
    needs the sha256 to create the asset row — so one transfer reads the file
    twice, and the bar now spans both. Reading from disk is far quicker than
    sending over a network, so it reaches half fast and then slows right down;
    the numbers say why instead of leaving that looking like a stall.
  */
  const stateLabel = (state: Transfer["state"]) =>
    ({
      queued: c("대기 중", "Waiting"),
      hashing: c("1단계 · 파일 확인 중", "Step 1 · Checking file"),
      uploading: c("2단계 · 업로드 중", "Step 2 · Uploading"),
      verifying: c("전송 완료 확인 중", "Finalizing transfer"),
      done: c(
        "전송 완료 · 검증 후 다운로드 가능",
        "Transferred · downloadable after verification",
      ),
      paused: c("멈춤", "Paused"),
      cancelled: c("취소됨", "Cancelled"),
      invalid: c("업로드할 수 없음", "Cannot upload"),
      failed: c("실패", "Failed"),
    })[state] ?? c("실패", "Failed");

  // Icon buttons with their name as the label: three worded buttons per file
  // made a five-file queue louder than the archive under it.
  return (
    <section
      aria-label={c("전송 패널", "Transfer panel")}
      className="fixed bottom-4 right-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-overlay shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border py-1.5 pl-4 pr-1.5">
        {/* Five counters, four of them usually zero. Only what is actually
            happening earns a place on the line. */}
        <p role="status" className="text-[13px] font-medium tabular-nums">
          {[
            [summary.running, c("진행", "running")] as const,
            [summary.waiting, c("대기", "waiting")] as const,
            [summary.done, c("완료", "done")] as const,
            [summary.failed, c("실패", "failed")] as const,
          ]
            .filter(([count]) => count > 0)
            .map(([count, label]) =>
              lang === "ko" ? `${label} ${count}` : `${count} ${label}`,
            )
            .join(" · ") ||
            c(`전송 ${summary.total}개`, `${summary.total} transfers`)}
        </p>
        <div className="flex shrink-0 items-center">
          {transfers.some((entry) => isSettled(entry.state)) && (
            <Button variant="ghost" size="xs" className="text-muted" onClick={queue.clearSettled}>
              {c("끝난 항목 지우기", "Clear finished")}
            </Button>
          )}
          <IconButton
            size="md"
            label={folded ? c("펼치기", "Expand") : c("접기", "Collapse")}
            aria-expanded={!folded}
            onClick={() => setFolded((v) => !v)}
          >
            {folded ? (
              <ChevronUp size={16} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} strokeWidth={1.75} aria-hidden="true" />
            )}
          </IconButton>
        </div>
      </div>
      <ul className="max-h-72 divide-y divide-border overflow-y-auto px-4" hidden={folded}>
        {transfers.map((entry) => {
          const shown = transferProgress(entry);
          return (
            <li key={entry.id} className="space-y-1.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 break-all text-[13px] font-medium">{entry.name}</p>
                <div className="flex shrink-0">
                  {canPause(entry.state) && (
                    <IconButton
                      size="md"
                      label={c("멈추기", "Pause")}
                      onClick={() => queue.pause(entry)}
                    >
                      <Pause size={16} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  )}
                  {canResume(entry.state) && (
                    <IconButton
                      size="md"
                      label={c("이어 올리기", "Resume")}
                      onClick={() => queue.resume(entry)}
                    >
                      <Play size={16} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  )}
                  {canCancel(entry.state) && (
                    <IconButton
                      size="md"
                      label={c("취소", "Cancel")}
                      onClick={() => onCancel(entry)}
                    >
                      <X size={16} strokeWidth={1.75} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </div>
              <CloudProgress
                value={shown.value}
                max={shown.max}
                label={`${entry.name} ${c("전송 진행률", "transfer progress")}`}
              />
              <p className="text-xs leading-5 text-muted tabular-nums">
                {/* `moved` — the bytes of the pass it is IN. `shown.value`
                    spans both passes and would read as "125 MB / 100 MB". */}
                {stateLabel(entry.state)} · {bytes(shown.moved)} /{" "}
                {bytes(entry.total)}
              </p>
              {entry.error && (
                <p className="text-xs leading-5" role="alert">
                  {cloudMessage(entry.error, lang)}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
