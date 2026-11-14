"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { b2bService, type InternationalBilling, type InternationalPurchase } from "@/lib/api/services/b2b.service";
import { TeamLoading, TeamShell } from "@/components/workspaces/shared";
import { Button, Notice, Select, SettingsSection, inputClass, buttonClass } from "@/components/ui";
import { BillingError, billingCode, kst, useTeamBilling } from "./billing-shared";
import { freeable } from "@/lib/api/session";
import type { BillingScope } from "@/lib/b2b-billing/operations";
import { useCopy } from "./shared";

const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
export function BillingCurrency({ workspaceId, preparing, children }: { workspaceId: string; preparing: boolean; children: (selector: ReactNode) => ReactNode }) {
  const c = useCopy();
  const { scope, error: scopeError, reload } = useTeamBilling(workspaceId);
  if (scopeError) return <TeamShell title={c("플랜과 결제", "Plan and billing")}><BillingError code={scopeError} /><Button onClick={() => void reload()}>{c("다시 확인", "Check again")}</Button></TeamShell>;
  if (!scope) return <TeamLoading />;
  return <ScopedBillingCurrency key={`${scope.origin}:${scope.userId}:${workspaceId}`} workspaceId={workspaceId} preparing={preparing} scope={scope}>{children}</ScopedBillingCurrency>;
}
function ScopedBillingCurrency({ workspaceId, preparing, scope, children }: { workspaceId: string; preparing: boolean; scope: BillingScope; children: (selector: ReactNode) => ReactNode }) {
  const c = useCopy();
  const [view, setView] = useState<InternationalBilling | null>(null);
  const [currency, setCurrency] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("currency") === "USD" ? "USD" : "KRW");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    b2bService.international(workspaceId, scope.userId!).then(result => { if (active) setView(result); }).catch(e => { if (active) setError(billingCode(e)); });
    return () => { active = false; };
  }, [workspaceId, scope.userId, retry]);
  if (error) return <TeamShell title={c("플랜과 결제", "Plan and billing")}><BillingError code={error} /><Button onClick={() => { setError(""); setRetry(value => value + 1); }}>{c("다시 확인", "Check again")}</Button></TeamShell>;
  if (!view) return <TeamLoading />;
  const international = !!view.account?.status || !!view.pending || currency === "USD";
  const selector = preparing && !view.account?.status && !view.pending ? <SettingsSection title={c("결제 통화", "Billing currency")}>
    <Select aria-label={c("결제 통화", "Billing currency")} value={international ? "USD" : "KRW"} onChange={e => setCurrency(e.target.value)}>
      <option value="KRW">{c("대한민국 · KRW", "South Korea · KRW")}</option>
      <option value="USD" disabled={!view.available}>{c("해외 · USD", "International · USD")}</option>
    </Select>
  </SettingsSection> : null;
  return international ? <InternationalPlan key={`${workspaceId}:${scope.userId}`} scope={scope} workspaceId={workspaceId} view={view} setView={setView} selector={selector} /> : children(selector);
}
export function InternationalPlan({ workspaceId, view, setView, selector, scope }: { scope: BillingScope; workspaceId: string; view: InternationalBilling; setView: (view: InternationalBilling) => void; selector?: ReactNode }) {
  const c = useCopy();
  const alive = useRef(true), sequence = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [seats, setSeats] = useState(1), [packs, setPacks] = useState(1);
  const [mode, setMode] = useState<"automatic" | "one_off">("one_off");
  const defaultsKey = `${view.account?.seats}:${view.account?.storagePacks}`;
  const [renewalDraft, setRenewalDraft] = useState({ key: defaultsKey, seats: view.account?.seats ?? 1, packs: view.account?.storagePacks ?? 0 });
  const keepSeats = renewalDraft.key === defaultsKey ? renewalDraft.seats : view.account?.seats ?? 1;
  const keepPacks = renewalDraft.key === defaultsKey ? renewalDraft.packs : view.account?.storagePacks ?? 0;
  const setKeepSeats = (seats: number) => setRenewalDraft({ key: defaultsKey, seats, packs: keepPacks });
  const setKeepPacks = (packs: number) => setRenewalDraft({ key: defaultsKey, seats: keepSeats, packs });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [refundId, setRefundId] = useState(""), [reason, setReason] = useState("");
  const account = view.account, active = !!account?.accessActive;
  const run = async (fn: () => Promise<InternationalBilling>) => {
    const call = ++sequence.current;
    setBusy(true); setError("");
    try { const result = await fn(); if (alive.current && call === sequence.current) setView(result); }
    catch (e) { if (alive.current && call === sequence.current) setError(billingCode(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  const refresh = useCallback(async () => {
    const call = ++sequence.current;
    const result = await b2bService.internationalRefresh(workspaceId, scope.userId!);
    if (alive.current && call === sequence.current) setView(result);
  }, [workspaceId, scope.userId, setView]);
  const needsPolling = !!view.pending || !!account?.syncPending;
  useEffect(() => {
    let active = true;
    const check = () => { if (active) void refresh().catch(() => {}); };
    check(); window.addEventListener("focus", check);
    const timer = window.setInterval(check, needsPolling ? 5000 : 60000);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", check); };
  }, [refresh, view.pending?.id, needsPolling]);
  const purchase = (action: InternationalPurchase["action"], quantity: number, renewal: InternationalPurchase["renewal"]) => run(async () => {
    if (!scope) throw new Error("B2B_BILLING_SCOPE_CHANGED");
    const key = `prepix:usd:${scope.origin}:${scope.userId}:${workspaceId}`;
    const prior = sessionStorage.getItem(key);
    const input: InternationalPurchase = prior ? JSON.parse(prior) : { requestKey: crypto.randomUUID(), action, quantity, renewal };
    sessionStorage.setItem(key, JSON.stringify(input));
    try {
      const result = await b2bService.internationalPurchase(workspaceId, input, scope.userId!);
      sessionStorage.removeItem(key);
      return result;
    } catch (error) {
      if (!prior && freeable(error)) sessionStorage.removeItem(key);
      throw error;
    }
  });
  const pending = view.pending;
  return <TeamShell title={c("플랜과 결제", "Plan and billing")}>
    {selector}
    {error && <BillingError code={error} />}
    <SettingsSection title="Business · USD" description={c("좌석당 월 $129 · 최소 1석 · 세금 별도", "$129 per seat per month · 1 seat minimum · taxes extra")}>
      <p className="text-sm">{c("팀 공용 3TB, 좌석당 월 600분의 원본 분석 시간을 팀이 공유합니다. 원본 분석과 기획 1회를 포함하며 같은 원본의 Agent 편집과 프로젝트 수는 무제한입니다.", "Includes 3TB shared team storage and a shared pool of 600 source-analysis minutes per paid seat per month. Source analysis and one plan are included. Agent editing of the same source and project count are unlimited.")}</p>
      <p className="mt-2 text-xs text-muted">{c("Owner·Admin·Editor는 각각 유료 1석입니다. Viewer는 무료이며 유료 좌석 수만큼 초대할 수 있습니다.", "Owner, Admin and Editor each use one paid seat. Viewers are free, up to the number of paid seats.")}</p>
      {account?.renewsAt && <p className="mt-3 text-sm">{c("다음 갱신일", "Next anniversary")}: {kst(account.renewsAt)} KST</p>}
      {active && <p className="mt-1 text-sm">{account!.cancelAtEnd ? c("이번 기간 종료 후 갱신하지 않습니다.", "Does not renew after this period.") : c(`다음 월 결제 ${dollars(account!.seats * 12900 + account!.storagePacks * 500)} + 세금`, `Next monthly payment ${dollars(account!.seats * 12900 + account!.storagePacks * 500)} plus tax`)}</p>}
      {account?.syncPending && account.status && <Notice className="mt-3">{c("결제사의 갱신 설정 반영을 확인하고 있습니다.", "Confirming the renewal change with the payment provider.")}</Notice>}
      {!active && !pending && <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className="text-sm">{c("유료 좌석 수", "Paid seats")} <input className={inputClass + " ml-2 w-24"} aria-label={c("유료 좌석 수", "Paid seats")} type="number" min={1} max={10000} value={seats} onChange={e => setSeats(Number(e.target.value))} /></label>
        <Button disabled={busy || !scope || !view.available || !Number.isInteger(seats) || seats < 1} onClick={() => void purchase("start", seats, "automatic")}>{c(`${dollars(seats * 12900)}/월 결제 내용 확인`, `Review ${dollars(seats * 12900)}/month checkout`)}</Button>
      </div>}
      {account?.status && <Button className="mt-4" variant="secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { const result = await b2bService.internationalPortal(workspaceId, scope.userId!); window.location.assign(result.url); } catch (e) { setError(billingCode(e)); } finally { setBusy(false); } }}>{c("결제 카드·영수증 관리 (최초 결제자)", "Manage card and receipts (original payer)")}</Button>}
    </SettingsSection>
    {pending && <SettingsSection title={c("결제 확인", "Review checkout")}>
      <p className="text-sm">{c(`공급가 ${dollars(pending.supplyCents)}. 최종 세금과 총액은 결제창에서 확인합니다.`, `${dollars(pending.supplyCents)} before tax. Review the final tax and total at checkout.`)}</p>
      <p className="mt-2 text-xs text-muted">{c("결제 후 이 화면으로 돌아오면 이용권을 확인합니다. 상태가 확인되기 전에는 새 결제를 만들지 마세요.", "Return here after payment to confirm your entitlement. Wait for confirmation before starting another payment.")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {pending.checkoutUrl && pending.state === "open" && <a href={pending.checkoutUrl} className={buttonClass({})}>{c("결제창 열기", "Open checkout")}</a>}
        <Button variant="secondary" disabled={busy} onClick={() => void run(() => b2bService.internationalRefresh(workspaceId, scope.userId!))}>{c("결제 상태 확인", "Check payment")}</Button>
        {["open", "review", "creating"].includes(pending.state) && <Button variant="ghost" disabled={busy} onClick={() => void run(() => b2bService.internationalCancelCheckout(workspaceId, pending.id, scope.userId!))}>{c("이 주문 취소", "Cancel this checkout")}</Button>}
      </div>
    </SettingsSection>}
    {active && <>
      <SettingsSection title={c("저장공간 추가", "Add storage")} description={c("100GB당 $5 + 세금 · 일회성·정기 추가 동일 가격", "$5 plus tax per 100GB · same price for once and recurring")}>
        <p className="mb-3 text-xs text-muted">{c("구매 즉시 다음 Business 갱신 시각 전까지 적용됩니다. 월 중 구매도 정가이며 일할 계산하지 않습니다. 일회성은 갱신일에 만료되고, 정기 추가는 같은 갱신일에 같은 용량으로 다시 부여되어 누적되지 않습니다.", "Available immediately until the next Business anniversary, exclusive. Full pack price applies mid-month. Once expires at renewal. Recurring renews on the same anniversary without accumulating capacity.")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label={c("추가 저장공간", "Additional storage")} value={packs} disabled={busy || !!pending} onChange={e => setPacks(Number(e.target.value))}>{Array.from({ length: 100 }, (_, n) => <option key={n + 1} value={n + 1}>{(n + 1) * 100}GB · {dollars((n + 1) * 500)}</option>)}</Select>
          <Select aria-label={c("갱신 방식", "Renewal")} value={account!.cancelAtEnd ? "one_off" : mode} disabled={busy || !!pending} onChange={e => setMode(e.target.value as typeof mode)}><option value="one_off">{c("이번 기간만", "This period only")}</option><option value="automatic" disabled={account!.cancelAtEnd}>{c("매월 갱신", "Renew monthly")}</option></Select>
          <Button disabled={busy || !!pending || !scope} onClick={() => void purchase("storage", packs, account!.cancelAtEnd ? "one_off" : mode)}>{c("구매 내용 확인", "Review purchase")}</Button>
        </div>
        <p className="mt-3 text-xs text-muted">{c("80%·90%에서 알림을 보내며, 100%에서는 새 업로드를 막습니다. 자동 초과 과금은 없습니다. 추가 용량은 단순 변심 환불이 제한되며 법정 사유·결제 오류·미제공 예외는 별도로 검토합니다.", "Warnings at 80% and 90%; new uploads stop at 100%. No automatic overage charges. Storage change-of-mind refunds are restricted; statutory rights, billing errors and non-provision exceptions are reviewed separately.")}</p>
      </SettingsSection>
      {!account!.cancelAtEnd && <><SettingsSection title={c("좌석 추가", "Add seats")}>
        <p className="mb-3 text-xs text-muted">{c("이번 기간에 남은 시간만큼 결제하고 다음 갱신부터 좌석당 월 $129 + 세금으로 갱신합니다.", "Pay for the remaining time this period, then $129 plus tax per added seat at each anniversary.")}</p>
        <div className="flex gap-3"><input className={inputClass + " w-24"} aria-label={c("추가 좌석 수", "Seats to add")} type="number" min={1} max={10000} value={seats} onChange={e => setSeats(Number(e.target.value))} /><Button disabled={busy || !!pending || !scope || !Number.isInteger(seats) || seats < 1} onClick={() => void purchase("seats", seats, "automatic")}>{c("추가 금액 확인", "Review added seats")}</Button></div>
      </SettingsSection>
      <SettingsSection title={c("다음 갱신 설정", "Next renewal")} description={c("축소와 해지는 다음 갱신일부터 적용됩니다.", "Reductions and cancellation apply at the next anniversary.")}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">{c("유지할 좌석", "Seats to keep")} <input className={inputClass + " ml-2 w-24"} type="number" min={1} max={account!.seats} value={keepSeats} onChange={e => setKeepSeats(Number(e.target.value))} /></label>
          <label className="text-sm">{c("유지할 100GB 추가분", "100GB packs to keep")} <input className={inputClass + " ml-2 w-24"} type="number" min={0} max={account!.storagePacks} value={keepPacks} onChange={e => setKeepPacks(Number(e.target.value))} /></label>
          <Button variant="secondary" disabled={busy || !!pending || keepSeats < 1 || keepSeats > account!.seats || keepPacks < 0 || keepPacks > account!.storagePacks} onClick={() => void run(() => b2bService.internationalRenewal(workspaceId, { revision: account!.revision, seats: keepSeats, storagePacks: keepPacks, cancelAtEnd: false }, scope.userId!))}>{c("다음 갱신에 적용", "Apply at next renewal")}</Button>
        </div>
        <Button className="mt-4" variant="ghost" disabled={busy} onClick={() => void run(() => b2bService.internationalRenewal(workspaceId, { revision: account!.revision, seats: account!.seats, storagePacks: account!.storagePacks, cancelAtEnd: true }, scope.userId!))}>{c("이번 기간 종료 후 구독 해지", "Cancel after this period")}</Button>
      </SettingsSection></>}
    </>}
    {view.payments.length > 0 && <SettingsSection title={c("결제 내역", "Payments")}>
      <ul className="divide-y divide-border">{view.payments.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span>{kst(p.paidAt)} · {dollars(p.totalCents)} <span className="text-muted">{c(`(세금 ${dollars(p.taxCents)} 포함)`, `(includes ${dollars(p.taxCents)} tax)`)}</span></span>
        {p.refunded ? <span>{c("환불 완료", "Refunded")}</span> : p.refundPending || (p.refundRequested && !p.refundDenied) ? <span>{c("환불 검토·처리 중", "Refund under review")}</span> : p.refundDenied ? <span>{c("환불 요청 검토 완료", "Refund request reviewed")}</span> : <Button variant="ghost" size="sm" onClick={() => { setRefundId(p.id); setReason(""); }}>{c("환불 검토 요청", "Request refund review")}</Button>}
      </li>)}</ul>
      {refundId && <div className="mt-4"><label className="block text-sm">{c("환불 사유", "Refund reason")}<textarea className={inputClass + " mt-2 w-full"} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><Button className="mt-3" disabled={busy || !reason.trim()} onClick={() => void run(async () => { const result = await b2bService.internationalRefund(workspaceId, refundId, reason.trim(), scope.userId!); setRefundId(""); return result; })}>{c("사유 제출", "Submit reason")}</Button></div>}
    </SettingsSection>}
  </TeamShell>;
}
