"use client";
import type { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { bytes } from "@/lib/workspaces/upload";
import { Button, cardClass, Meter, InfoTip } from "@/components/ui";
import { B2bError, useCopy } from "./shared";
export function FileDownloads({
  downloads,
}: {
  downloads: ReturnType<typeof useFileDownloads>;
}) {
  const c = useCopy();
  if (!downloads.jobs.length && !downloads.error) return null;
  return (
    // A card of its own while anything is being received; gone when idle.
    <section
      className={`${cardClass} space-y-4 p-5`}
      aria-label={c("원본 수령", "Original file receipts")}
    >
      <h2 className="text-base font-semibold">
        {c("원본 수령", "Original file receipts")}
      </h2>
      {downloads.error && <B2bError code={downloads.error} />}
      <ul className="divide-y divide-border border-y border-border">
        {downloads.jobs.map((job) => {
          const busy = ["checking", "receiving", "authorizing"].includes(
            job.state,
          );
          return (
            <li key={job.record.versionId} className="space-y-2 py-3">
              <p className="break-all text-sm font-medium">
                {job.version
                  ? `${job.version.assetName} · ${c("버전", "Version")} ${job.version.ordinal}`
                  : c(
                      "현재 접근할 수 없는 수령 기록",
                      "Receipt unavailable to the current account",
                    )}
              </p>
              <p role="status" className="text-[13px] text-muted tabular-nums">
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
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={job.record.size}
                  aria-valuenow={job.bytes}
                  aria-label={c("원본 수령 진행", "Original receipt progress")}
                >
                  <Meter tone="neutral" value={(job.bytes / job.record.size) * 100} />
                </div>
              )}
              {job.error && <B2bError code={job.error} />}
              <div className="flex flex-wrap gap-2">
                {busy ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloads.pause(job.record.versionId)}
                  >
                    {c("수령 중단", "Pause receipt")}
                  </Button>
                ) : (
                  <>
                    {job.version && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void downloads.start(job.version!)}
                      >
                        {job.state === "saved"
                          ? c(
                              "검증한 파일 다시 저장",
                              "Save verified file again",
                            )
                          : c("원본 수령 재개", "Resume original receipt")}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void downloads.discard(job.record)}
                    >
                      {c("임시 수령 삭제", "Remove staged receipt")}
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <InfoTip label={c("받은 파일은 어떻게 확인하나요?", "How is a download checked?")} text={c("다운로드 방식", "How downloads work")}>
        {c(
          "받은 부분은 이 브라우저에 임시 보관합니다. 크기와 전체 해시, 현재 다운로드 권한을 확인한 뒤 파일 저장을 시작합니다.",
          "Received bytes are staged in this browser. Saving starts after the size, full hash and current download access are verified.",
        )}
      </InfoTip>
    </section>
  );
}
