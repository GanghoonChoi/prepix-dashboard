"use client";

import { useEffect, useState } from "react";
import { b2bService, type TeamCommerce, type TeamQuote } from "@/lib/api/services/b2b.service";
import { Button, Notice, Select, SettingsSection } from "@/components/ui";
import { BillingError, billingCode, kst, useTeamBilling, useWon } from "./billing-shared";
import { useCopy } from "./shared";

/** Real storage purchases share the team's card, order ledger and anniversary. */
export function TeamStorage({ workspaceId }: { workspaceId: string }) {
  const c = useCopy(), won = useWon();
  const { billing, api, scope, reload } = useTeamBilling(workspaceId);
  const [commerce, setCommerce] = useState<TeamCommerce | null>(null);
  const [packs, setPacks] = useState(1);
  const [mode, setMode] = useState<"one_off" | "automatic">("one_off");
  const [quote, setQuote] = useState<TeamQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reduceTo, setReduceTo] = useState(0);
  useEffect(() => { if (api) void api.commerce().then(setCommerce).catch(e => setError(billingCode(e))); }, [api, billing?.renewal.revision]);
  if (!billing || !api || !scope || !commerce?.configured || !commerce.currentPeriod) return null;
  const { product, currentPeriod: period } = commerce;
  if (product.currency === "USD") return <SettingsSection title={c("팀 저장공간", "Team storage")} description={c("기본 3TB · 100GB 추가당 $5 + 세금", "3TB included · $5 plus tax per additional 100GB")}><a className="text-sm underline underline-offset-4" href={`/dashboard/workspaces/${workspaceId}/plan`}>{c("저장공간과 갱신 관리", "Manage storage and renewal")}</a></SettingsSection>;
  const renewal = billing.renewal;
  const ready = billing.methods.some(m => m.state === "active" && (!renewal.methodId || m.id === renewal.methodId));
  const recurringReady = renewal.mode === "automatic" && renewal.consentedProductVersion === product.version;
  const intentKey = `prepix:storage:${scope.origin}:${scope.userId}:${workspaceId}`;
  const check = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const pending = sessionStorage.getItem(intentKey);
      if (pending) { await pay(); return; }
      const result = await b2bService.purchaseQuote(workspaceId, { requestKey: crypto.randomUUID(), productVersion: product.version, sourcePeriodId: period.id, target: "current", renewal: mode, extraSeats: 0, aiPacks: 0, storagePacks: packs });
      setQuote(result.quote);
    } catch (e) { setError(billingCode(e)); } finally { setBusy(false); }
  };
  const pay = async () => {
    setBusy(true); setError("");
    try {
      const saved = sessionStorage.getItem(intentKey);
      const intent: { quoteId: string; requestKey: string } = saved ? JSON.parse(saved) : { quoteId: quote!.id, requestKey: crypto.randomUUID() };
      // Persist before sending. A timeout/reload retries the identical charge.
      sessionStorage.setItem(intentKey, JSON.stringify(intent));
      let { order } = await api.charge(intent);
      for (let i = 0; i < 40 && ["awaiting_payment", "payment_unknown", "received", "applying"].includes(order.state); i++) {
        await new Promise(r => setTimeout(r, 1500));
        order = (await api.order(order.id)).order;
      }
      if (["applied", "canceled", "expired", "review_required"].includes(order.state)) sessionStorage.removeItem(intentKey);
      if (order.state !== "applied") throw new Error(order.state === "canceled" ? "B2B_SEAT_CHARGE_DECLINED" : "B2B_SEAT_CHARGE_PENDING");
      setQuote(null);
      setNotice(c("저장공간을 추가했어요. 결제 내역에서 확인할 수 있어요.", "Storage added. The payment is in your billing history."));
      await reload();
      window.dispatchEvent(new Event("workspaces:changed"));
    } catch (e) {
      const code = billingCode(e);
      if (/QUOTE_EXPIRED|QUOTE_TARGET_CHANGED|QUOTE_PERIOD_CHANGED/.test(code)) { sessionStorage.removeItem(intentKey); setQuote(null); }
      setError(code);
    } finally { setBusy(false); }
  };
  const reduce = async () => {
    setBusy(true); setError("");
    try {
      await api.changeRenewal({ requestKey: crypto.randomUUID(), revision: renewal.revision, mode: "automatic", methodId: renewal.methodId, extraSeats: renewal.extraSeats, aiPacks: 0, storagePacks: reduceTo, retainedUserIds: renewal.retainedUserIds, productVersion: product.version, consentVersion: billing.readiness.autoPayConsentVersion ?? undefined });
      await reload();
      setNotice(c("다음 Business 갱신일부터 변경돼요. 이번 기간의 용량은 유지됩니다.", "The change starts at the next Business renewal. Current capacity remains until then."));
    } catch (e) { setError(billingCode(e)); } finally { setBusy(false); }
  };
  return <SettingsSection title={c("추가 저장공간", "Additional storage")} description={c("팀 공용 기본 3TB · 좌석 수와 무관", "3TB shared base storage, independent of seat count")}>
    <p className="text-sm">{c(`100GB당 ${won(product.storagePack.supplyKrw)} · 부가세 별도`, `${won(product.storagePack.supplyKrw)} per 100GB · VAT extra`)}</p>
    <p className="mt-2 text-xs leading-5 text-muted">{c(`결제 즉시 적용 · ${kst(period.endsAt)} 직전까지 사용 · 중간 구매도 전액 청구. 일회성은 갱신일에 만료되고, 정기 추가는 같은 날 갱신됩니다.`, `Available immediately until ${kst(period.endsAt, "en")} KST (exclusive). Full price applies mid-period. One-time additions expire and recurring additions renew on the Business anniversary.`)}</p>
    <p className="mt-1 text-xs leading-5 text-muted">{c("단순 변심 환불은 제한됩니다. 결제 오류·미제공·법정 환불 예외는 환불 정책을 따릅니다. 100% 사용 시 새 업로드가 중단되며 자동 초과 과금은 없습니다.", "Change-of-mind refunds are restricted; payment errors, non-delivery and statutory exceptions follow the refund policy. Uploads stop at 100%, with no automatic overage charges.")}</p>
    {error && <BillingError code={error} />}
    {notice && <Notice role="status">{notice}</Notice>}
    {!ready ? <p className="mt-3 text-sm text-muted">{c("플랜과 결제에서 카드를 등록하고 Business 구독을 시작해 주세요.", "Register a card and start your Business subscription in Plan and billing.")}</p> : <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Select aria-label={c("추가할 저장공간", "Storage to add")} value={packs} disabled={busy} onChange={e => { setPacks(Number(e.target.value)); setQuote(null); }}>{Array.from({ length: 100 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n * 100}GB</option>)}</Select>
        <Select aria-label={c("갱신 방식", "Renewal mode")} value={mode} disabled={busy} onChange={e => { setMode(e.target.value as typeof mode); setQuote(null); }}>
          <option value="one_off">{c("이번 기간만", "This period only")}</option>
          <option value="automatic" disabled={!recurringReady}>{c("매월 갱신", "Renew monthly")}</option>
        </Select>
        <Button variant="secondary" disabled={busy} onClick={() => void check()}>{c("구매 내용 확인", "Review purchase")}</Button>
      </div>
      {!recurringReady && <p className="mt-2 text-xs text-muted">{c("새 상품 조건에 동의한 뒤 정기 추가를 사용할 수 있어요.", "Accept the updated product terms to buy recurring storage.")}</p>}
      {quote && <div className="mt-3 rounded-lg border border-border p-4">
        <p className="text-sm">{c(`${quote.selection.storagePacks * 100}GB · 지금 ${won(quote.amounts.totalKrw)} 결제 (VAT 포함)`, `${quote.selection.storagePacks * 100}GB · Pay ${won(quote.amounts.totalKrw)} now (VAT included)`)}</p>
        <p className="mt-1 text-xs text-muted">{quote.renewal === "automatic" ? c("다음 Business 갱신일부터 같은 용량을 매월 결제합니다.", "The same capacity is billed monthly from the next Business renewal.") : c("다음 Business 갱신일에 만료됩니다. 자동 갱신되지 않습니다.", "Expires at the next Business renewal. Does not renew.")}</p>
        <Button className="mt-3" disabled={busy} onClick={() => void pay()}>{busy ? c("결제 확인 중…", "Checking payment…") : c(`${won(quote.amounts.totalKrw)} 결제에 동의`, `Agree and pay ${won(quote.amounts.totalKrw)}`)}</Button>
      </div>}
      {renewal.storagePacks > 0 && <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-sm">{c(`매월 추가 ${renewal.storagePacks * 100}GB`, `${renewal.storagePacks * 100}GB recurring storage`)}</p>
        <div className="flex flex-wrap gap-3"><Select aria-label={c("다음 갱신일부터 유지할 추가 용량", "Recurring capacity at next renewal")} value={reduceTo} disabled={busy} onChange={e => setReduceTo(Number(e.target.value))}>{Array.from({ length: renewal.storagePacks }, (_, n) => <option key={n} value={n}>{n * 100}GB</option>)}</Select><Button variant="secondary" disabled={busy || !recurringReady} onClick={() => void reduce()}>{c("다음 갱신일부터 축소", "Reduce from next renewal")}</Button></div>
      </div>}
    </>}
  </SettingsSection>;
}
