"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice, PropertyList } from "@/components/ui";
import { checkRecord, runRecord, type BillingRecord } from "@/lib/b2b-billing/operations";
import { BillingError, billingCode, kst, useTeamBilling, useWon } from "./billing-shared";
import { useCopy } from "./shared";

// Legal floor: renewal re-consent. SOT: backend/docs/b2b-legal-floor.md §2.
// Mid-term termination left the web on 2026-10-12 (user: "중도해지는 없는거야
// … 이번달까지 쓰고 다음달부터 결제 안하는거야"): 해지 is stopping renewal.
// Billing authority only; the caller (B2bPlan) renders nothing of this for
// anyone else.
type Billing = ReturnType<typeof useTeamBilling>;
const consentReasons: Record<string, [string, string]> = {
  price_increase: ["다음 갱신 금액이 올라갑니다.", "The next renewal costs more."],
  free_to_paid: ["무료였던 갱신이 유료로 바뀝니다.", "A free renewal becomes paid."],
  terms_changed: ["다음 갱신의 상품 조건이 바뀝니다.", "The next renewal's terms change."],
};

/** Price-increase / free-to-paid re-consent. Nothing is charged at the new
 * price without an explicit answer inside [opensAt, chargeAt). */
export function RenewalConsentCard({ billing }: { billing: Billing }) {
  const c = useCopy();
  const won = useWon();
  const { billing: view, scope, api, store, reload } = billing;
  const consent = view?.renewalConsent ?? null;
  const [pending, setPending] = useState<BillingRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  // The exact terms the person ticked; any change of price or product unticks.
  const [agreed, setAgreed] = useState("");
  const generation = useRef(0);
  const consentId = consent?.id;
  const refreshPending = useCallback(async () => {
    if (!scope || !consentId) return setPending([]);
    const g = generation.current;
    try {
      const rows = await Promise.all(
        (["renewal.consent.accept", "renewal.consent.decline"] as const).map((action) => store.get({ scope, action, topic: consentId })),
      );
      if (g === generation.current) setPending(rows.filter((r): r is BillingRecord => !!r));
    } catch (e) {
      if (g === generation.current) setFailure(billingCode(e));
    }
  }, [scope, store, consentId]);
  useEffect(() => {
    generation.current++;
    setBusy(false);
    setFailure("");
    setAgreed("");
    const t = setTimeout(() => void refreshPending(), 0);
    return () => clearTimeout(t);
  }, [api, refreshPending]);
  if (!view || !consent || consent.state === "superseded") return null;
  // An answered request lingers on the server forever; the answer matters only
  // until the charge time. Later, the paused reason on billing details speaks.
  const answeredVisible = (consent.state === "consented" || consent.state === "declined") && Date.parse(view.serverTime) < Date.parse(consent.chargeAt);
  const answer = async (record: BillingRecord, recheck = false) => {
    if (!api || busy) return;
    const g = generation.current;
    setBusy(true);
    setFailure("");
    try {
      if (!recheck || !(await checkRecord(record, api, store))) await runRecord(record, api, store);
    } catch (e) {
      if (g !== generation.current) return;
      const code = billingCode(e);
      setFailure(code);
      if (code === "B2B_RENEWAL_CONSENT_CHANGED") setAgreed("");
    } finally {
      if (g === generation.current) {
        setBusy(false);
        await refreshPending();
        await reload();
      }
    }
  };
  // A lost answer stays checkable by its key even after the view moved on.
  const recovery = pending.length > 0 && (
    <div className="space-y-3 text-[13px] leading-5">
      <Notice>{c("갱신 동의 답변의 결과를 확인하지 못했습니다.", "Your answer has no confirmed result.")}</Notice>
      {pending.map((p) => (
        <Button key={p.action} variant="secondary" disabled={busy} onClick={() => void answer(p, true)}>
          {p.action === "renewal.consent.accept" ? c("동의 결과 확인", "Confirm consent result") : c("거절 결과 확인", "Confirm decline result")}
        </Button>
      ))}
      {failure && (
        <p className="text-muted">
          {c(
            "아직 확인되지 않았습니다. 잠시 뒤 다시 확인해 주세요.",
            "Still unconfirmed. Check again shortly.",
          )}
        </p>
      )}
    </div>
  );
  if (consent.state !== "required") {
    if (!answeredVisible && pending.length === 0 && !failure) return null;
    return (
      <div className="space-y-3">
        {answeredVisible && (
          <Notice role="status">
            <span data-consent-state={consent.state}>
              {consent.state === "consented"
                ? c(
                    `바뀐 갱신 금액 ${won(consent.toTotalKrw)}에 동의했습니다 (${kst(consent.answeredAt!)}). ${kst(consent.chargeAt)} 이후 등록 카드로 결제합니다.`,
                    `You consented to the new renewal price of ${won(consent.toTotalKrw)} (${kst(consent.answeredAt!)}). The card is charged after ${kst(consent.chargeAt)}.`,
                  )
                : c(
                    `바뀐 갱신 금액에 동의하지 않았습니다 (${kst(consent.answeredAt!)}). 결제하지 않으며, 팀은 이번 이용기간 끝에 종료됩니다.`,
                    `You declined the new renewal price (${kst(consent.answeredAt!)}). Nothing is charged; the team ends with this period.`,
                  )}
            </span>
          </Notice>
        )}
        {failure && <BillingError code={failure} />}
        {recovery}
      </div>
    );
  }
  const terms = `${consent.id}|${consent.toProductVersion}|${consent.toTotalKrw}`;
  const opened = Date.parse(view.serverTime) >= Date.parse(consent.opensAt);
  const record = <A extends "renewal.consent.accept" | "renewal.consent.decline">(action: A, input: BillingRecord<A>["input"]): BillingRecord<A> => ({
    schema: 1,
    scope: scope!,
    action,
    topic: consent.id,
    attempts: 0,
    input,
  });
  return (
    <section aria-labelledby="renewal-consent" className="space-y-5 rounded-lg border border-border bg-surface p-5" data-consent-state="required">
      <div>
        <h2 id="renewal-consent" className="text-base font-semibold">
          {c("갱신 금액 변경 · 동의가 필요합니다", "Renewal price change · consent needed")}
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-muted">
          {c(...(consentReasons[consent.reason] ?? consentReasons.terms_changed))}{" "}
          {c(
            "답하지 않으면 바뀐 금액으로 결제하지 않고 팀은 이번 이용기간 끝에 종료됩니다. 구독은 언제든 해지할 수 있습니다.",
            "Without an answer nothing is charged at the new price and the team ends with this period. You can terminate at any time.",
          )}
        </p>
      </div>
      <PropertyList
        divided
        items={[
          [
            c("한 달 갱신 금액 (부가세 포함)", "Monthly renewal (VAT incl.)"),
            <span key="total" className="tabular-nums" data-consent-total>
              {consent.fromTotalKrw === null ? c("확인 불가", "unknown") : won(consent.fromTotalKrw)} → {won(consent.toTotalKrw)}
            </span>,
          ],
          [c("결제 예정", "Charge"), kst(consent.chargeAt)],
          [
            c("상품 조건", "Product"),
            <span key="product" data-consent-product>
              {consent.fromProductVersion === consent.toProductVersion ? c("상품 조건은 그대로입니다", "Product terms unchanged") : c("상품 조건 변경", "Product terms changed")}
            </span>,
          ],
          [
            c("다음 기간 구성", "Next period"),
            <span key="next">
              {c("추가 이용권", "Extra licences")} {consent.selection.extraSeats}
              {/* (integration) H: AI packs are no longer sold; only a legacy selection shows them. */}
              {consent.selection.aiPacks > 0 && <> · {c("AI 팩", "AI packs")} {consent.selection.aiPacks}</>} · {c("저장 팩", "Storage packs")} {consent.selection.storagePacks}
            </span>,
          ],
        ]}
      />
      {consent.shortNotice && (
        <Notice>
          <span data-short-notice>
            {c(
              `안내가 늦어 답할 수 있는 기간이 평소보다 짧습니다. ${kst(consent.chargeAt)} 전까지 답해 주세요.`,
              `This notice came late, so the window is shorter than usual. Answer before ${kst(consent.chargeAt)}.`,
            )}
          </span>
        </Notice>
      )}
      {failure && <BillingError code={failure} />}
      {pending.length > 0 ? (
        recovery
      ) : !opened ? (
        <p role="status" className="text-[13px] leading-5">
          {c(`${kst(consent.opensAt)}부터 답할 수 있습니다. 그 전의 동의는 인정되지 않습니다.`, `You can answer from ${kst(consent.opensAt)}. Earlier consent does not count.`)}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2.5 text-sm leading-6">
            <input type="checkbox" className="mt-1.5 shrink-0" checked={agreed === terms} disabled={busy} onChange={(e) => setAgreed(e.target.checked ? terms : "")} />
            <span>
              {c(
                `바뀐 상품 조건과 한 달 ${won(consent.toTotalKrw)}(부가세 포함)으로 ${kst(consent.chargeAt)} 이후 등록 카드로 자동결제하는 데 동의합니다.`,
                `I agree to automatic charges of ${won(consent.toTotalKrw)} a month (VAT incl.) under the changed terms, from ${kst(consent.chargeAt)}.`,
              )}
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || agreed !== terms || !scope}
              onClick={() =>
                void answer(
                  record("renewal.consent.accept", {
                    requestKey: crypto.randomUUID(),
                    productVersion: consent.toProductVersion,
                    expectedTotalKrw: consent.toTotalKrw,
                    consentId: consent.id,
                  }),
                )
              }
            >
              {c("동의하고 갱신", "Consent and renew")} · {won(consent.toTotalKrw)}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !scope}
              onClick={() => void answer(record("renewal.consent.decline", { requestKey: crypto.randomUUID(), consentId: consent.id }))}
            >
              {c("동의하지 않음 · 기간 끝에 종료", "Decline · end with this period")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
