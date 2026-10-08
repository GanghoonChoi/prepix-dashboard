"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { useI18n } from "@/lib/i18n/context";
import {
  Block,
  TeamShell,
  SeatBreakdown,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bPlan } from "@/components/b2b/plan";
import { AccessDenied } from "@/components/b2b/shared";
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

/**
 * Plan, seats, storage and billing — one screen.
 *
 * There used to be two: this one and `/dashboard/organizations/<id>/billing`,
 * reached from the same sidebar entry depending on a race. They showed the
 * same seats and the same storage from two different endpoints, and the
 * organisation copy also refused itself to everybody except the owner, so
 * three of the four roles clicked 플랜과 결제 and got a single sentence saying
 * they may not look.
 *
 * Owners and admins only (2026-10-08), like the B2B plan page: anyone else
 * gets the one access-denied screen, not a read-only copy. The one figure that
 * is real — storage — is the one cost this actually incurs, and seats stay
 * four separate numbers.
 */
export default function Page() {
  const { data, cloudEnabled, b2b } = useWorkspace()!;
  const { lang, t } = useI18n();
  const personal = isPersonal(data.workspace);
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [storage, setStorage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    if (cloudEnabled && data.canManage)
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
  }, [cloudEnabled, data.workspace.id, data.canManage]);
  if (b2b?.enrolled) return <B2bPlan status={b2b} workspace={data.workspace} />;
  if (!personal && !data.canManage)
    return <AccessDenied code="B2B_TEAM_MANAGER_REQUIRED" />;
  const myPlan = (
    <Link href="/dashboard/plan" className={secondaryClass}>
      {c("내 플랜 보기", "View my plan")}
    </Link>
  );
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")}>
      {personal ? (
        <Block
          title={t("team.kind.personal")}
          description={t("team.personalDesc")}
          actions={myPlan}
        />
      ) : (
        <>
          {/* One sentence, not two empty sections: a "결제 수단" block and an
              "청구서 내역" block both saying there is nothing yet. */}
          <Block
            title={c("팀 프리뷰", "Team preview")}
            description={c(
              "팀 결제가 연결되기 전이라 청구되지 않습니다.",
              "Nothing is charged until team billing is connected.",
            )}
            actions={myPlan}
          />
          {/*
            Seats belong to a team. A personal space consumes none, so this
            whole block is absent rather than showing zeros — and for a team it
            is four figures, never `used + reserved / limit`, which is the
            single total the Dropbox admin read as "nothing changed" for four to
            six billed months.
          */}
          <div className="space-y-3">
            <SeatBreakdown detail={data} />
            <Link
              className={secondaryClass}
              href={`/dashboard/workspaces/${data.workspace.id}/members`}
            >
              {c("멤버 관리", "Manage members")}
            </Link>
          </div>
        </>
      )}
      {error && <CloudError code={error} />}
      {storage && <StorageMeter storage={storage} />}
    </TeamShell>
  );
}
