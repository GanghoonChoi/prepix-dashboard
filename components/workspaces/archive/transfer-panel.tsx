"use client";
import { Pause, Play, X } from "lucide-react";
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
import { secondaryClass } from "@/components/workspaces/shared";

/** What the upload queue is doing, one row per file (F04.3). */
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
  if (!transfers.length) return null;

  const stateLabel = (state: Transfer["state"]) =>
    ({
      queued: c("대기 중", "Waiting"),
      hashing: c("파일 확인 중", "Checking file"),
      uploading: c("업로드 중", "Uploading"),
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

  return (
    <section
      aria-label={c("전송 패널", "Transfer panel")}
      className="space-y-4 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Five counters, four of them usually zero. Only what is actually
            happening earns a place on the line. */}
        <p role="status" className="text-sm tabular-nums">
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
        {transfers.some((entry) => isSettled(entry.state)) && (
          <button className={secondaryClass} onClick={queue.clearSettled}>
            {c("끝난 항목 지우기", "Clear finished")}
          </button>
        )}
      </div>
      <ul className="divide-y divide-border">
        {transfers.map((entry) => {
          const shown = transferProgress(entry);
          return (
            <li key={entry.id} className="space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm">{entry.name}</p>
                <div className="flex flex-wrap gap-2">
                  {canPause(entry.state) && (
                    <button
                      className={secondaryClass}
                      onClick={() => queue.pause(entry)}
                    >
                      <Pause size={16} strokeWidth={1.5} />
                      {c("멈추기", "Pause")}
                    </button>
                  )}
                  {canResume(entry.state) && (
                    <button
                      className={secondaryClass}
                      onClick={() => queue.resume(entry)}
                    >
                      <Play size={16} strokeWidth={1.5} />
                      {c("이어 올리기", "Resume")}
                    </button>
                  )}
                  {canCancel(entry.state) && (
                    <button
                      className={secondaryClass}
                      onClick={() => onCancel(entry)}
                    >
                      <X size={16} strokeWidth={1.5} />
                      {c("취소", "Cancel")}
                    </button>
                  )}
                </div>
              </div>
              <CloudProgress
                value={shown.value}
                max={shown.max}
                label={`${entry.name} ${c("전송 진행률", "transfer progress")}`}
              />
              <p className="text-xs leading-5 text-muted tabular-nums">
                {stateLabel(entry.state)} · {bytes(shown.value)} /{" "}
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
