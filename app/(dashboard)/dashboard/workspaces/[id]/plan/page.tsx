"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { useI18n } from "@/lib/i18n/context";
import {
  TeamShell,
  SeatBreakdown,
  secondaryClass,
} from "@/components/workspaces/shared";
import { isPersonal } from "@/lib/workspaces/kind";
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
  const { lang, t } = useI18n();
  const personal = isPersonal(data.workspace);
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (cloudEnabled && data.role !== "reviewer")
      void cloudService
        .archive(data.workspace.id)
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
    >
      {!personal && (
        <section className="space-y-4 rounded-xl border border-border p-6">
          <p className="text-xs text-muted">
            {c("현재 팀 플랜", "Current team plan")}
          </p>
          <h2 className="text-2xl font-medium">
            {c("팀 프리뷰", "Team preview")}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {c(
              "아직 청구되지 않습니다. 결제를 시작하기 전에 소유자가 요금과 적용일을 먼저 확인합니다.",
              "Nothing is being charged. The owner reviews pricing and dates before billing starts.",
            )}
          </p>
        </section>
      )}
      {/*
        Seats belong to a team. A personal space consumes none, so this whole
        block is absent rather than showing zeros — and for a team it is four
        figures, never `used + reserved / limit`, which is the single total the
        Dropbox admin read as "nothing changed" for four to six billed months.
      */}
      {!personal && (
        <>
          <SeatBreakdown detail={data} />
          <Link
            className={secondaryClass}
            href={`/dashboard/workspaces/${data.workspace.id}/members`}
          >
            {c("멤버와 좌석 관리", "Manage members and seats")}
          </Link>
        </>
      )}
      {personal && (
        <section className="space-y-4 rounded-xl border border-border p-6">
          <h2 className="font-medium">{t("team.kind.personal")}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {t("team.personalDesc")}
          </p>
        </section>
      )}
      {error && <CloudError code={error} />}
      {storage && <StorageMeter storage={storage} />}
      {!personal && (
      <p className="text-sm leading-6 text-muted">
        {c(
          "멤버를 빼도 좌석 수량은 줄지 않습니다. 업로드 중인 파일과 휴지통 파일도 저장 용량에 포함됩니다.",
          "Removing a member does not reduce seat quantity. Pending uploads and trashed files count toward storage.",
        )}
      </p>
      )}
    </TeamShell>
  );
}
