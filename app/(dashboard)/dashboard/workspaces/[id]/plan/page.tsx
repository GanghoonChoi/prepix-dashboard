"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { useI18n } from "@/lib/i18n/context";
import { TeamShell, secondaryClass } from "@/components/workspaces/shared";
import {
  cloudService,
  type StorageUsage,
} from "@/lib/api/services/cloud.service";
import {
  CloudError,
  cloudErrorCode,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
export default function Page() {
  const { data, cloudEnabled } = useWorkspace()!;
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (cloudEnabled && data.role !== "reviewer")
      void cloudService
        .overview(data.workspace.id)
        .then((r) => {
          if (live) setStorage(r.storage);
        })
        .catch((e) => {
          if (live) setError(cloudErrorCode(e));
        });
    return () => {
      live = false;
    };
  }, [cloudEnabled, data.workspace.id, data.role]);
  return (
    <TeamShell
      title={c("플랜과 사용량", "Plan and usage")}
      description={data.workspace.name}
    >
      <section className="space-y-4 rounded-xl border border-border p-6">
        <p className="text-xs text-muted">
          {c("현재 팀 플랜", "Current team plan")}
        </p>
        <h2 className="text-2xl font-medium">
          {c("팀 프리뷰", "Team preview")}
        </h2>
        <p className="max-w-2xl text-sm leading-6 text-muted">
          {c(
            "팀 요금과 결제 시작일은 아직 정해지지 않았습니다. 팀 사용으로 청구되거나 개인 구독이 변경되지 않습니다. 실제 결제를 시작하기 전에 소유자가 요금과 적용일을 확인하게 됩니다.",
            "Team pricing and billing dates are not set. Team use does not create a charge or change personal subscriptions. The owner will review pricing and effective dates before billing starts.",
          )}
        </p>
      </section>
      <section className="space-y-4 rounded-xl border border-border p-6">
        <h2 className="font-medium">{c("팀 좌석", "Team seats")}</h2>
        <p className="text-3xl font-medium tabular-nums">
          {data.seats.used + data.seats.reserved} / {data.workspace.seatLimit}
        </p>
        <p className="text-sm leading-6 text-muted">
          {c(
            `참여 중 ${data.seats.used}명 · 초대 예약 ${data.seats.reserved}명. 소유자·관리자·편집자는 좌석을 사용합니다. 검토자와 참여 정지 멤버는 좌석을 사용하지 않습니다.`,
            `${data.seats.used} active seats · ${data.seats.reserved} reserved invitations. Owners, admins and editors use seats. Reviewers and suspended members do not.`,
          )}
        </p>
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${data.workspace.id}/members`}
        >
          {c("멤버와 좌석 관리", "Manage members and seats")}
        </Link>
      </section>
      {error && <CloudError code={error} />}
      {storage && <StorageMeter storage={storage} />}
      <p className="text-sm leading-6 text-muted">
        {c(
          "멤버 제거는 구독 좌석 수량을 자동으로 줄이지 않습니다. 업로드 중인 파일과 휴지통 파일도 저장 용량에 포함됩니다. 팀 AI 사용량과 자동 결제는 아직 제공하지 않습니다.",
          "Removing a member does not automatically reduce subscription quantity. Pending uploads and trashed files count toward storage. Team AI allowances and automated billing are not available yet.",
        )}
      </p>
    </TeamShell>
  );
}
