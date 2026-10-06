"use client";
import type { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { bytes } from "@/lib/workspaces/upload";
import { secondaryClass } from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";
export function FileDownloads({
  downloads,
}: { downloads: ReturnType<typeof useFileDownloads> }) {
  const c = useCopy();
  if (!downloads.jobs.length && !downloads.error) return null;
  return (
    <section
      className="space-y-4"
      aria-label={c("원본 수령", "Original file receipts")}
    >
      <h2 className="font-medium">
        {c("원본 수령", "Original file receipts")}
      </h2>
      <p className="text-sm text-muted">
        {c(
          "받은 부분은 이 브라우저에 임시 보관합니다. 크기와 전체 해시, 현재 다운로드 권한을 확인한 뒤 파일 저장을 시작합니다.",
          "Received bytes are staged in this browser. Saving starts after the size, full hash and current download access are verified.",
        )}
      </p>
      {downloads.error && <B2bError code={downloads.error} />}
      <ul className="divide-y divide-border">
        {downloads.jobs.map((job) => {
          const busy = ["checking", "receiving", "authorizing"].includes(
            job.state,
          );
          return (
            <li key={job.record.versionId} className="space-y-3 py-4">
              <p className="break-all text-sm font-medium">
                {job.version
                  ? `${job.version.assetName} · ${c("버전", "Version")} ${job.version.ordinal}`
                  : c(
                      "현재 접근할 수 없는 수령 기록",
                      "Receipt unavailable to the current account",
                    )}
              </p>
              <p role="status" className="text-sm text-muted tabular-nums">
                {job.state === "checking"
                  ? c("받은 부분 확인 중", "Checking received bytes")
                  : job.state === "receiving"
                    ? c("원본 받는 중", "Receiving original")
                    : job.state === "authorizing"
                      ? c(
                          "저장 전 권한 확인 중",
                          "Checking access before saving",
                        )
                      : job.state === "saved"
                        ? c(
                            "검증 완료 · 파일 저장 시작됨",
                            "Verified; file saving started",
                          )
                        : c(
                            "중단됨 · 재개 시 받은 부분 확인",
                            "Paused; received bytes will be checked on resume",
                          )}
                {job.version &&
                  ` · ${bytes(job.bytes)} / ${bytes(job.record.size)}`}
              </p>
              {busy && job.version && (
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-border"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={job.record.size}
                  aria-valuenow={job.bytes}
                  aria-label={c("원본 수령 진행", "Original receipt progress")}
                >
                  <div
                    className="h-full bg-foreground"
                    style={{
                      width: `${Math.min(100, (job.bytes / job.record.size) * 100)}%`,
                    }}
                  />
                </div>
              )}
              {job.error && <B2bError code={job.error} />}
              <div className="flex flex-wrap gap-3">
                {busy ? (
                  <button
                    className={secondaryClass}
                    onClick={() => downloads.pause(job.record.versionId)}
                  >
                    {c("수령 중단", "Pause receipt")}
                  </button>
                ) : (
                  <>
                    {job.version && (
                      <button
                        className={secondaryClass}
                        onClick={() => void downloads.start(job.version!)}
                      >
                        {job.state === "saved"
                          ? c(
                              "검증한 파일 다시 저장",
                              "Save verified file again",
                            )
                          : c("원본 수령 재개", "Resume original receipt")}
                      </button>
                    )}
                    <button
                      className={secondaryClass}
                      onClick={() => void downloads.discard(job.record)}
                    >
                      {c("임시 수령 삭제", "Remove staged receipt")}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
