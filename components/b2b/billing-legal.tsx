"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass, primaryClass, secondaryClass } from "@/components/workspaces/shared";
import type {
  B2bStatus,
  TeamRefundLine,
  TeamRefundState,
  TeamTerminationPreview,
} from "@/lib/api/services/b2b.service";
import { checkRecord, runRecord, type BillingRecord } from "@/lib/b2b-billing/operations";
import { BillingError, billingCode, kst, refundLabels, useTeamBilling, won } from "./billing-shared";
import { useCopy } from "./shared";

// Legal floor screens: renewal re-consent and mid-term termination.
// SOT: backend/docs/b2b-legal-floor.md §1-2. Billing authority only; the
// caller (B2bPlan) renders nothing of this for anyone else.
type Billing = ReturnType<typeof useTeamBilling>;
const openRefund: TeamRefundState[] = ["reserved", "cancelling", "provider_unknown", "review_required"];
const consentReasons: Record<string, [string, string]> = {
  price_increase: ["다음 갱신 금액이 올라갑니다.", "The next renewal costs more."],
  free_to_paid: ["무료였던 갱신이 유료로 바뀝니다.", "A free renewal becomes paid."],
  terms_changed: ["다음 갱신의 상품 조건이 바뀝니다.", "The next renewal's terms change."],
};

/** Price-increase / free-to-paid re-consent. Nothing is charged at the new
 * price without an explicit answer inside [opensAt, chargeAt). */
export function RenewalConsentCard({ billing }: { billing: Billing }) {
  const c = useCopy();
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
    <div className="space-y-2 text-sm">
      <p>{c("갱신 동의 답변의 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인합니다.", "Your answer has no confirmed result. The original request is checked.")}</p>
      {pending.map((p) => (
        <button key={p.action} type="button" className={secondaryClass} disabled={busy} onClick={() => void answer(p, true)}>
          {p.action === "renewal.consent.accept" ? c("동의 결과 확인", "Confirm consent result") : c("거절 결과 확인", "Confirm decline result")}
        </button>
      ))}
      {failure && (
        <p className="text-muted">
          {c(
            "아직 확인되지 않았습니다. 잠시 뒤 다시 확인해 주세요. 갱신 동의 요청이 닫히면 이 요청도 풀리고 최신 안내를 볼 수 있습니다.",
            "Still unconfirmed. Check again shortly. When the renewal consent closes, this request is released and the latest notice shows.",
          )}
        </p>
      )}
    </div>
  );
  if (consent.state !== "required") {
    if (!answeredVisible && pending.length === 0 && !failure) return null;
    return (
      <div className="space-y-3 rounded-lg border border-border p-4 text-sm leading-6">
        <p role="status" data-consent-state={consent.state}>
          {!answeredVisible
            ? null
            : consent.state === "consented"
            ? c(
                `바뀐 갱신 금액 ${won(consent.toTotalKrw)}에 동의했습니다 (${kst(consent.answeredAt!)}). ${kst(consent.chargeAt)} 이후 등록 카드로 결제합니다.`,
                `You consented to the new renewal price of ${won(consent.toTotalKrw)} (${kst(consent.answeredAt!)}). The card is charged after ${kst(consent.chargeAt)}.`,
              )
            : c(
                `바뀐 갱신 금액에 동의하지 않았습니다 (${kst(consent.answeredAt!)}). 결제하지 않으며, 팀은 이번 이용기간 끝에 종료됩니다.`,
                `You declined the new renewal price (${kst(consent.answeredAt!)}). Nothing is charged; the team ends with this period.`,
              )}
        </p>
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
    <section aria-labelledby="renewal-consent" className="space-y-4 rounded-lg border border-border bg-surface p-5" data-consent-state="required">
      <h2 id="renewal-consent" className="font-medium">
        {c("갱신 금액 변경 · 동의가 필요합니다", "Renewal price change · consent needed")}
      </h2>
      <p className="text-sm leading-6">{c(...(consentReasons[consent.reason] ?? consentReasons.terms_changed))}</p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{c("상품 조건", "Product")}</dt>
          <dd data-consent-product>
            {consent.fromProductVersion === consent.toProductVersion ? c("상품 조건은 그대로입니다", "Product terms unchanged") : c("상품 조건 변경", "Product terms changed")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{c("한 달 갱신 금액 (부가세 포함)", "Monthly renewal (VAT incl.)")}</dt>
          <dd className="tabular-nums" data-consent-total>
            {consent.fromTotalKrw === null ? c("확인 불가", "unknown") : won(consent.fromTotalKrw)} → {won(consent.toTotalKrw)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{c("결제 예정 (한국 시간)", "Charge (KST)")}</dt>
          <dd>{kst(consent.chargeAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">{c("다음 기간 구성", "Next period")}</dt>
          <dd>
            {c("추가 이용권", "Extra licences")} {consent.selection.extraSeats}
            {/* (integration) H: AI packs are no longer sold; only a legacy selection shows them. */}
            {consent.selection.aiPacks > 0 && <> · {c("AI 팩", "AI packs")} {consent.selection.aiPacks}</>} · {c("저장 팩", "Storage packs")} {consent.selection.storagePacks}
          </dd>
        </div>
      </dl>
      {consent.shortNotice && (
        <p className="text-sm leading-6" data-short-notice>
          {c(
            `안내가 늦어 동의할 수 있는 기간이 평소보다 짧습니다. ${kst(consent.chargeAt)} 전까지 답해 주세요.`,
            `This notice came late, so the consent window is shorter than usual. Answer before ${kst(consent.chargeAt)}.`,
          )}
        </p>
      )}
      <p className="text-sm leading-6 text-muted">
        {c(
          "동의하지 않거나 답하지 않으면 바뀐 금액으로 결제하지 않고, 팀은 이번 이용기간 끝까지 쓴 뒤 종료됩니다. 자동결제 중지와 중도해지는 언제든 이 화면과 결제 정보에서 할 수 있습니다.",
          "If you decline or do not answer, nothing is charged at the new price and the team ends with this period. You can stop renewal or terminate at any time from this page and billing details.",
        )}
      </p>
      {failure && <BillingError code={failure} />}
      {pending.length > 0 ? (
        recovery
      ) : !opened ? (
        <p role="status" className="text-sm leading-6">
          {c(`${kst(consent.opensAt)}부터 답할 수 있습니다. 그 전의 동의는 인정되지 않습니다.`, `You can answer from ${kst(consent.opensAt)}. Earlier consent does not count.`)}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={agreed === terms} disabled={busy} onChange={(e) => setAgreed(e.target.checked ? terms : "")} />
            <span>
              {c(
                `바뀐 상품 조건과 한 달 ${won(consent.toTotalKrw)}(부가세 포함)으로 ${kst(consent.chargeAt)} 이후 등록 카드로 자동결제하는 데 동의합니다.`,
                `I agree to automatic charges of ${won(consent.toTotalKrw)} a month (VAT incl.) under the changed terms, from ${kst(consent.chargeAt)}.`,
              )}
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryClass}
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
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy || !scope}
              onClick={() => void answer(record("renewal.consent.decline", { requestKey: crypto.randomUUID(), consentId: consent.id }))}
            >
              {c("동의하지 않음 · 기간 끝에 종료", "Decline · end with this period")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

const day = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" }).format(new Date(value));
type OrderTag = { paidAt: string | null; from: string | null; to: string | null };

const lineNames: Record<TeamRefundLine["kind"], [string, string]> = {
  base: ["기본", "Base"],
  extra_seat: ["추가 이용권", "Extra licences"],
  ai_pack: ["AI 팩", "AI packs"],
  storage_pack: ["저장 팩", "Storage packs"],
  overpayment: ["차액", "Difference"],
};

/** Mid-term termination (중도해지), next to "stop renewal": ends the running
 * period now and reserves original-order refunds. Only provider-confirmed
 * money is ever shown as refunded. */
export function TeamTermination({
  workspaceId,
  status,
  billing,
}: {
  workspaceId: string;
  status: Extract<B2bStatus, { enrolled: true }>;
  billing: Billing;
}) {
  const c = useCopy();
  const workspace = useWorkspace();
  const { billing: view, scope, api, store, reload } = billing;
  const [preview, setPreview] = useState<TeamTerminationPreview | null>(null);
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState<BillingRecord | null>(null);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [ended, setEnded] = useState(false);
  // Orders are named by payment date and period, never by their internal ID.
  const [tags, setTags] = useState<Record<string, OrderTag>>({});
  const generation = useRef(0);
  const refreshPending = useCallback(async () => {
    if (!scope) return setPending(null);
    const g = generation.current;
    try {
      const row = await store.get({ scope, action: "termination", topic: "termination" });
      if (g === generation.current) setPending(row);
    } catch (e) {
      if (g === generation.current) setFailure(billingCode(e));
    }
  }, [scope, store]);
  useEffect(() => {
    // Another account, team or service starts empty.
    generation.current++;
    setPreview(null);
    setReason("");
    setAgreed(false);
    setBusy("");
    setFailure("");
    setEnded(false);
    const t = setTimeout(() => void refreshPending(), 0);
    return () => clearTimeout(t);
  }, [api, refreshPending]);
  const settle = async (work: () => Promise<unknown>) => {
    const g = generation.current;
    setFailure("");
    try {
      await work();
      if (g !== generation.current) return;
      setPreview(null);
      setEnded(true);
    } catch (e) {
      if (g !== generation.current) return;
      const code = billingCode(e);
      setFailure(code);
      // The amount or its basis no longer holds: measure again before asking.
      if (code === "B2B_REFUND_AMOUNT_CHANGED" || code === "B2B_REFUND_BASIS_STALE" || code === "B2B_PAYMENT_PENDING") setPreview(null);
    } finally {
      if (g === generation.current) {
        setBusy("");
        await refreshPending();
        await reload();
        await workspace?.reload();
      }
    }
  };
  const t = view?.termination ?? null;
  // A restored team may be terminated again: the flag follows the team state.
  const teamState = status.team.currentState;
  useEffect(() => setEnded(false), [teamState]);
  const needTags = !!preview || !!t;
  useEffect(() => {
    if (!api || !needTags) return;
    let live = true;
    api
      .orders()
      .then((list) => {
        if (live) setTags(Object.fromEntries(list.items.map((o) => [o.id, { paidAt: o.receipt?.approvedAt ?? null, from: o.period.startsAt, to: o.period.endsAt }])));
      })
      .catch(() => undefined); // names are a convenience; the amounts come from the termination itself
    return () => {
      live = false;
    };
  }, [api, needTags]);
  const orderName = (id: string) => {
    const o = tags[id];
    if (!o?.paidAt) return c("주문", "Order");
    const span = o.from && o.to ? ` · ${day(o.from)} ~ ${day(o.to)}` : "";
    return c(`${day(o.paidAt)} 결제${span}`, `Paid ${day(o.paidAt)}${span}`);
  };
  const active = teamState === "active" && !ended;
  if (!view) return null;
  const zero = preview?.amounts.totalKrw === 0;
  return (
    <section aria-labelledby="termination" className="space-y-4 border-b border-border pb-8">
      <h2 id="termination" className="font-medium">
        {c("중도해지", "Mid-term termination")}
      </h2>
      {t && (
        <div className="space-y-3 rounded-lg border border-border p-4 text-sm leading-6" data-termination-status>
          <p role="status">
            {c(
              `${kst(t.endedAt)}에 중도해지했습니다. 원래 종료 시각은 ${kst(t.previousEndsAt)}이었습니다.`,
              `Terminated at ${kst(t.endedAt)}; the period would have ended at ${kst(t.previousEndsAt)}.`,
            )}{" "}
            {t.requestedTotalKrw === 0
              ? c("돌려드릴 금액이 없어 환불 없이 해지했습니다.", "There was nothing to refund, so the team ended without a refund.")
              : t.withdrawal
                ? c("청약철회로 원주문 전액을 환불합니다.", "Withdrawal: the original orders are refunded in full.")
                : c("쓰지 않은 부분을 환불합니다.", "The unused part is refunded.")}
          </p>
          {t.requestedTotalKrw > 0 && (
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-muted">{c("요청한 환불", "Requested")}</dt>
              <dd className="tabular-nums">{won(t.requestedTotalKrw)}</dd>
            </div>
            <div>
              <dt className="text-muted">{c("환불 완료 (결제사 확인)", "Refunded (provider confirmed)")}</dt>
              <dd className="tabular-nums" data-money="refunded">{won(t.refundedKrw)}</dd>
            </div>
            {t.pendingKrw > 0 && (
              <div>
                <dt className="text-muted">{c("환불 확인 중", "Refund being confirmed")}</dt>
                <dd className="tabular-nums" data-money="pending">{won(t.pendingKrw)}</dd>
              </div>
            )}
          </dl>
          )}
          {t.refunds.length > 0 && (
            <ul className="space-y-2">
              {t.refunds.map((r) => (
                <li key={r.refundId} className="flex flex-wrap justify-between gap-2 rounded-md border border-border p-3" data-refund-state={r.state}>
                  <span>
                    {r.state === "refunded"
                      ? c("환불 완료", "Refunded")
                      : openRefund.includes(r.state)
                        ? `${c("환불 확인 중", "Refund being confirmed")} · ${c(...refundLabels[r.state])}`
                        : c(...refundLabels[r.state])}
                    {" · "}
                    <Link
                      className="underline underline-offset-4"
                      aria-label={`${c("주문 보기", "View order")} · ${orderName(r.orderId)}`}
                      href={`/dashboard/workspaces/${workspaceId}/plan/orders/${r.orderId}`}
                    >
                      {c("주문 보기", "View order")} ({orderName(r.orderId)})
                    </Link>
                  </span>
                  <span className="tabular-nums">{won(r.totalKrw)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {active && (
        <p className="text-sm leading-6 text-muted">
          {c(
            "자동결제 중지는 이번 이용기간 끝까지 쓰고 다음 결제만 멈춥니다(환불 없음). 중도해지는 지금 바로 이용을 끝내고 환불 가능한 금액을 원결제로 돌려드립니다. 청약철회가 적용되는 주문은 전액을, 그 밖의 주문은 쓰지 않은 부분을 환불하며, 어느 쪽인지와 금액은 해지 전에 주문마다 보여 드립니다. 위약금은 없습니다. 해지하면 팀은 즉시 열람·다운로드만 가능해지고, 이후 보관·삭제 일정은 해지 시각부터 계산합니다.",
            "Stopping renewal keeps the team until the period ends and only stops the next charge (no refund). Termination ends the team now and refunds what is refundable to the original payment: orders under withdrawal in full, the others for the unused part, shown per order before you confirm. No penalty. After termination the team is read and export only, and the retention schedule starts from that moment.",
          )}{" "}
          <Link className="underline underline-offset-4" href={`/dashboard/workspaces/${workspaceId}/plan/settings`}>
            {c("자동결제 중지는 결제 정보에서", "Stop renewal in billing details")}
          </Link>
        </p>
      )}
      {failure && <BillingError code={failure === "B2B_PAYMENT_PENDING" ? "B2B_TERMINATION_PAYMENT_PENDING" : failure} />}
      {pending ? (
        <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p>{c("해지 요청의 결과를 확인하지 못했습니다. 같은 요청으로 결과를 확인하며 새 해지를 보내지 않습니다.", "The termination has no confirmed result. The original request is checked; no new termination is sent.")}</p>
          {failure && (
            <p className="text-muted" data-pending-hint>
              {c(
                "아직 확인되지 않았습니다. 잠시 뒤 다시 확인해 주세요. 환불 금액을 확인한 시각에서 10분이 지나면 이 요청이 풀리고 새로 시작할 수 있습니다.",
                "Still unconfirmed. Check again shortly. Ten minutes after the refund amount was measured, this request is released and you can start over.",
              )}
            </p>
          )}
          <button
            type="button"
            className={secondaryClass}
            disabled={!!busy || !api}
            onClick={() => {
              if (!api) return;
              setBusy("check");
              void settle(async () => {
                if (!(await checkRecord(pending, api, store))) await runRecord(pending, api, store);
              });
            }}
          >
            {c("해지 요청 결과 확인", "Confirm termination result")}
          </button>
        </div>
      ) : active && !preview ? (
        <button
          type="button"
          className={secondaryClass}
          disabled={!!busy || !api}
          onClick={async () => {
            if (!api) return;
            const g = generation.current;
            setBusy("preview");
            setFailure("");
            try {
              const next = await api.terminationPreview();
              if (g === generation.current) {
                setPreview(next);
                setAgreed(false);
              }
            } catch (e) {
              if (g === generation.current) setFailure(billingCode(e));
            } finally {
              if (g === generation.current) setBusy("");
            }
          }}
        >
          {busy === "preview" ? c("확인 중…", "Checking…") : c("해지 환불 금액 확인", "Check termination refund")}
        </button>
      ) : active && preview ? (
        <form
          aria-label={c("중도해지 확인", "Confirm termination")}
          className="space-y-4 rounded-lg border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!api || !scope || !agreed || !reason.trim()) return;
            setBusy("terminate");
            void settle(() =>
              runRecord(
                {
                  schema: 1,
                  scope,
                  action: "termination",
                  topic: "termination",
                  attempts: 0,
                  input: {
                    requestKey: crypto.randomUUID(),
                    reason: reason.trim(),
                    // Measured at the instant shown; the server refuses it after 10 minutes.
                    basisAt: preview.basisAt,
                    expectedTotalKrw: preview.amounts.totalKrw,
                  },
                },
                api,
                store,
              ),
            );
          }}
        >
          <p className="text-sm leading-6" data-withdrawal={preview.withdrawal} data-zero={zero}>
            {zero
              ? c("돌려드릴 금액이 없습니다. 해지하면 지금 이용이 끝납니다.", "There is nothing to refund. Terminating ends the team now.")
              : preview.withdrawal
                ? c("청약철회 적용: 기간 안에 팀이 아직 쓰지 않아 원주문 전액을 환불합니다.", "Withdrawal applies: the team has not used the service within the period, so the original orders are refunded in full.")
                : c("미사용분 환불: 청약철회 대상이 아니어서 쓰지 않은 부분을 환불합니다. 시작 전에 미리 구매한 기간은 전액 환불됩니다.", "Unused part refunded: withdrawal does not apply, so the part not used is refunded. A period bought ahead that has not started is refunded in full.")}
          </p>
          <ul className="space-y-1 text-sm leading-6">
            <li>{c(`지금 해지하면 이용이 바로 끝납니다. 원래 종료 시각은 ${kst(preview.previousEndsAt)}입니다.`, `Terminating ends the team now instead of at ${kst(preview.previousEndsAt)}.`)}</li>
            <li>{preview.renewalStops ? c("자동결제도 함께 멈춥니다. 다음 결제는 없습니다.", "Automatic renewal stops too. Nothing more is charged.") : c("예정된 자동결제가 없습니다. 다음 결제는 없습니다.", "No automatic renewal is scheduled. Nothing more is charged.")}</li>
          </ul>
          {!zero && (
          <ul className="space-y-2 text-sm" aria-label={c("원주문별 환불", "Refund per original order")}>
            {preview.orders.map((o) => (
              <li key={o.orderId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3" data-order-withdrawal={o.withdrawal}>
                <span>
                  {orderName(o.orderId)} · {o.withdrawal ? c("청약철회 전액", "Withdrawal, full") : c("미사용분 환불", "Unused part refunded")} ·{" "}
                  {o.lines.map((l) => `${c(...lineNames[l.kind])}${l.kind === "base" ? "" : ` ${l.quantity}`}`).join(", ")}
                </span>
                <span className="tabular-nums">{won(o.amounts.totalKrw)}</span>
              </li>
            ))}
          </ul>
          )}
          <p className="text-sm tabular-nums" role="status">
            {c("공급가액", "Supply")} {won(preview.amounts.supplyKrw)} · {c("부가세", "VAT")} {won(preview.amounts.vatKrw)} · {c("환불 예정 합계", "Refund total")}{" "}
            <strong data-termination-total>{won(preview.amounts.totalKrw)}</strong>
          </p>
          <p className="text-xs text-muted">
            {c(`${kst(preview.basisAt)} 기준 금액입니다. 10분이 지나면 다시 확인해야 합니다. 환불은 운영 확인 뒤 원결제 취소로 돌려드리며, 결제사가 확인한 금액만 환불 완료로 표시합니다.`, `Measured at ${kst(preview.basisAt)}; check again after 10 minutes. Refunds return to the original payment after operations review; only provider-confirmed money shows as refunded.`)}
          </p>
          <label className="block space-y-2 text-sm">
            <span>{c("해지 사유", "Reason")}</span>
            <input className={inputClass} value={reason} maxLength={500} disabled={!!busy} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="flex items-start gap-2 text-sm leading-6">
            <input type="checkbox" checked={agreed} disabled={!!busy} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              {zero
                ? c("환불받을 금액이 없음을 확인했고, 환불 없이 지금 팀 이용을 끝내는 데 동의합니다. 해지는 되돌릴 수 없습니다.", "I understand there is nothing to refund and agree to end the team now. This cannot be undone.")
                : c(
                    `환불 예정 금액 ${won(preview.amounts.totalKrw)}을 확인했고, 지금 팀 이용을 끝내는 데 동의합니다. 해지는 되돌릴 수 없습니다.`,
                    `I reviewed the refund of ${won(preview.amounts.totalKrw)} and agree to end the team now. This cannot be undone.`,
                  )}
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            <button className={primaryClass} disabled={!!busy || !agreed || !reason.trim()}>
              {busy === "terminate" ? c("해지 중…", "Terminating…") : zero ? c("중도해지", "Terminate") : `${c("중도해지", "Terminate")} · ${won(preview.amounts.totalKrw)}`}
            </button>
            <button type="button" className={secondaryClass} disabled={!!busy} onClick={() => setPreview(null)}>
              {c("취소", "Cancel")}
            </button>
          </div>
        </form>
      ) : !t ? (
        <p className="text-sm text-muted">{c("진행 중인 이용기간이 없어 중도해지할 것이 없습니다.", "There is no running period to terminate.")}</p>
      ) : null}
    </section>
  );
}
