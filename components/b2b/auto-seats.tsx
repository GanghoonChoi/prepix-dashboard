"use client";
import { useState } from "react";
import type { TeamBilling } from "@/lib/api/services/b2b.service";
import type { BillingApi } from "@/lib/b2b-billing/operations";
import { Button, SettingsSection } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { BillingError, billingCode } from "./billing-shared";
import { useCopy } from "./shared";

/** The words below the switch; the server accepts only this version. */
const AUTO_SEATS_CONSENT_VERSION = "auto-seats-2026-10-12";

/**
 * A member who joins mid-period gets a seat at once, paid for the days left
 * on the renewal card — no 좌석 추가 to press. Its own consent: the renewal's
 * covers next month, not a charge today. Off is one click.
 */
export function AutoSeats({ billing, api, reload }: { billing: TeamBilling; api: BillingApi; reload: () => Promise<void> }) {
  const c = useCopy();
  const { lang } = useI18n();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const on = billing.renewal.autoSeats;
  const ready =
    billing.renewal.mode === "automatic" &&
    billing.methods.some((m) => m.id === billing.renewal.methodId && m.state === "active");
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setFailure("");
    try {
      await api.changeAutoSeats({
        requestKey: crypto.randomUUID(),
        enabled,
        ...(enabled ? { consentVersion: AUTO_SEATS_CONSENT_VERSION } : {}),
      });
      setConsent(false);
      await reload();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection
      title={c("멤버 추가 자동결제", "Automatic seats")}
      description={c(
        "뷰어가 아닌 멤버가 합류해 좌석이 모자라면, 이번 이용기간에 남은 날만큼만 바로 결제하고 좌석을 드려요. 다음 달부터는 자동결제에 함께 포함돼요.",
        "When a member who isn't a viewer joins and seats run short, the days left in this period are charged at once and they get a seat. From next month the seat renews with the team.",
      )}
      action={
        on && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => void toggle(false)}>
            {c("끄기", "Turn off")}
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {failure && <BillingError code={failure} />}
        {on ? (
          <p role="status" className="text-[13px] leading-5">
            {c(
              `${formatDate(on.since, lang)}부터 켜져 있어요. 좌석이 모자라면 자동결제 카드로 결제돼요.`,
              `On since ${formatDate(on.since, lang)}. A shortfall is charged to the renewal card.`,
            )}
          </p>
        ) : !ready ? (
          <p className="text-[13px] leading-5 text-muted">
            {c("먼저 위에서 매월 자동결제와 카드를 설정해 주세요.", "Set up monthly automatic payment and a card above first.")}
          </p>
        ) : (
          <>
            <label className="flex items-start gap-2.5 text-sm leading-6">
              <input type="checkbox" className="mt-1.5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {c(
                  "멤버가 합류하거나 역할이 바뀌어 좌석이 모자라면, 이번 이용기간의 남은 기간만큼 좌석 요금(일할, 부가세 별도)을 자동결제 카드로 바로 결제하는 데 동의합니다. 언제든 끌 수 있습니다.",
                  "When members join or change roles and seats run short, I agree to an immediate charge to the renewal card for the rest of this period (prorated, VAT extra). It can be turned off at any time.",
                )}
              </span>
            </label>
            <Button size="sm" disabled={!consent || busy} aria-busy={busy} onClick={() => void toggle(true)}>
              {c("켜기", "Turn on")}
            </Button>
          </>
        )}
      </div>
    </SettingsSection>
  );
}
