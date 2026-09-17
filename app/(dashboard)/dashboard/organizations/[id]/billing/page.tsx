"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  organizationService,
  type OrganizationDetail,
} from "@/lib/api/services/organization.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { bytes } from "@/lib/workspaces/upload";
import {
  Block,
  TeamShell,
  TeamError,
  TeamLoading,
  secondaryClass,
} from "@/components/workspaces/shared";
import { CloudProgress } from "@/components/workspaces/cloud-shared";

/**
 * Organisation billing, laid out the way the Console lays it out: a stack of
 * titled sections separated by rules, each with a one-line description, its
 * figures on the left and its actions on the right.
 *
 * What is NOT copied is the data. We have no organisation balance, no payment
 * method and no invoices, and a screen that shows a number where there is none
 * is worse than one that says there is none. Exactly one figure here is real —
 * storage — and it is the one cost this layer genuinely incurs today.
 */
export default function OrganizationBillingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}

function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<OrganizationDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await organizationService.detail(id));
      setError("");
    } catch (e) {
      setError(workspaceError(e));
    }
  }, [id]);
  useEffect(() => {
    // Deferred by a tick, as the archive and the switcher do: the first fetch
    // is a subscription to an external system, not a render-time state write.
    const initial = window.setTimeout(() => void load(), 0);
    // Also on focus — a bill read in one tab while somebody uploads in another
    // is a bill that was true a minute ago.
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  if (error && !data) return <TeamError code={error} retry={load} />;
  if (!data) return <TeamLoading />;
  if (!data.canManageBilling)
    // The server already refuses the numbers; this is the door matching the
    // lock. An admin runs the team without being handed the card.
    return (
      <TeamShell title={c("플랜과 결제", "Plan and billing")}>
        <p className="text-sm leading-6 text-muted">
          {c(
            "결제는 소유자와 결제 담당자만 볼 수 있습니다.",
            "Only the owner and billing members can see billing.",
          )}
        </p>
      </TeamShell>
    );

  const { storage, workspaces: spaces } = data;
  const total = storage.used + storage.reserved;
  const percent = storage.limit
    ? Math.min(100, Math.round((total / storage.limit) * 100))
    : 0;

  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")}>
      <div className="space-y-8">
        {/* ── 플랜 ───────────────────────────────────────────────── */}
        <Block
          title={c("팀 플랜", "Team plan")}
          description={c(
            "팀 단위 결제는 아직 연결되지 않았습니다. 지금은 멤버 각자의 개인 플랜이 그대로 적용됩니다.",
            "Team billing is not connected yet. Each member's personal plan still applies.",
          )}
          actions={
            <Link href="/dashboard/plan" className={secondaryClass}>
              {c("내 플랜 보기", "View my plan")}
            </Link>
          }
        >
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-sm">
            <Info
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="shrink-0 text-muted"
            />
            <p className="leading-6">
              {c(
                "이 조직으로 청구되는 금액은 없습니다.",
                "Nothing is being charged to this organisation.",
              )}
            </p>
          </div>
        </Block>

        {/* ── 저장 용량 ───────────────────────────────────────────── */}
        <Block
          title={c("저장 용량", "Storage")}
          description={c(
            "이 조직의 워크스페이스가 보관 중인 원본입니다. 휴지통 파일도 포함되며, 수거가 끝난 파일은 빠집니다.",
            "Originals held by this organisation's workspaces. Trashed files count; reclaimed ones do not.",
          )}
        >
          <div className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums">
              {c(`${bytes(total)} 사용됨`, `${bytes(total)} used`)}
            </p>
            <p className="text-sm text-muted tabular-nums">
              {c(
                `워크스페이스 ${spaces.length}개 · 각 ${bytes(storage.perWorkspaceLimit)}`,
                `${spaces.length} workspaces · ${bytes(storage.perWorkspaceLimit)} each`,
              )}
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <CloudProgress
                  label={c("조직 저장 용량", "Organisation storage")}
                  value={total}
                  max={storage.limit || 1}
                />
              </div>
              <span className="shrink-0 text-sm tabular-nums text-muted">
                {c(`${percent}% 사용됨`, `${percent}% used`)}
              </span>
            </div>
            {storage.reserved > 0 && (
              <p className="text-xs leading-5 text-muted tabular-nums">
                {c(
                  `${bytes(storage.reserved)} 업로드 중`,
                  `${bytes(storage.reserved)} uploading`,
                )}
              </p>
            )}
          </div>
        </Block>

        {/* ── 좌석 ───────────────────────────────────────────────── */}
        <Block
          title={c("좌석", "Seats")}
          description={c(
            "검토자는 좌석을 사용하지 않습니다. 지금은 좌석이 아무도 막지 않으며, 팀 플랜이 생기면 그때 한도가 됩니다.",
            "Reviewers use no seat. Nothing is refused today; the number becomes a limit when a team plan exists.",
          )}
        >
          <p className="text-2xl font-semibold tabular-nums">
            {data.members.length}
          </p>
          <p className="text-sm text-muted">
            {c("조직 멤버", "Organisation members")}
          </p>
        </Block>

        {/* ── 결제 정보 ───────────────────────────────────────────── */}
        <Block
          title={c("결제 정보", "Payment details")}
          description={c(
            "청구지 주소와 결제 수단은 팀 결제가 연결된 뒤에 설정합니다.",
            "A billing address and payment method are set once team billing is connected.",
          )}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm text-muted">
            <CircleCheck
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="shrink-0"
            />
            <p className="leading-6">
              {c(
                "등록된 결제 수단이 없습니다.",
                "No payment method on file.",
              )}
            </p>
          </div>
        </Block>

        {/* ── 청구서 내역 ─────────────────────────────────────────── */}
        <Block
          title={c("청구서 내역", "Invoices")}
          description={c(
            "이 조직으로 발행된 청구서가 여기에 쌓입니다.",
            "Invoices issued to this organisation appear here.",
          )}
        >
          <p className="py-4 text-sm text-muted">
            {c("아직 청구서가 없습니다.", "No invoices yet.")}
          </p>
        </Block>
      </div>
    </TeamShell>
  );
}
