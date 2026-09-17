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
 * Nothing here is refused now, because there is nothing to refuse: no balance,
 * no payment method, no invoices. The one figure that is real — storage — is
 * the one cost this actually incurs, and seats stay four separate numbers.
 */
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
    <TeamShell title={c("플랜과 결제", "Plan and billing")}>
      {personal ? (
        <section className="space-y-4 rounded-xl border border-border p-6">
          <h2 className="font-medium">{t("team.kind.personal")}</h2>
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {t("team.personalDesc")}
          </p>
        </section>
      ) : (
        <section className="space-y-4 rounded-xl border border-border p-6">
          <p className="text-xs text-muted">
            {c("현재 팀 플랜", "Current team plan")}
          </p>
          <h2 className="text-2xl font-medium">
            {c("팀 프리뷰", "Team preview")}
          </h2>
          {/* One sentence, not two empty sections. A "결제 수단" block and an
              "청구서 내역" block both saying there is nothing yet spend two
              headings to say the same thing once. */}
          <p className="max-w-2xl text-sm leading-6 text-muted">
            {c(
              "아직 청구되지 않습니다. 결제 수단과 청구서는 팀 결제가 연결된 뒤에 생깁니다.",
              "Nothing is being charged. A payment method and invoices arrive once team billing is connected.",
            )}
          </p>
          <Link href="/dashboard/plan" className={secondaryClass}>
            {c("내 플랜 보기", "View my plan")}
          </Link>
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
            {c("멤버 관리", "Manage members")}
          </Link>
        </>
      )}
      {error && <CloudError code={error} />}
      {storage && <StorageMeter storage={storage} />}
    </TeamShell>
  );
}
