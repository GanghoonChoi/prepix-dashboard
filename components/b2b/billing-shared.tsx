"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
  billingApi,
  BrowserBillingStore,
  type BillingApi,
  type BillingScope,
} from "@/lib/b2b-billing/operations";
import type {
  TeamBilling,
  TeamOrderState,
  TeamRefundState,
} from "@/lib/api/services/b2b.service";
import { savePgIntent, type PgIntent } from "@/lib/b2b-billing/pg-return";
import { secondaryClass } from "@/components/workspaces/shared";
import { B2bError, errorCode, useCopy } from "./shared";

export const won = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}원`;
export const kst = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));

// Payment declined, receipt unknown, not applied, operations check and refund
// in progress are distinct states; none of them is shown as success.
export const orderLabels: Record<TeamOrderState, [string, string]> = {
  awaiting_payment: ["결제 대기", "Awaiting payment"],
  payment_unknown: ["수납 확인 중 · 다시 결제하지 마세요", "Checking receipt · do not pay again"],
  received: ["수납 완료 · 이용권 반영 중", "Paid · applying"],
  applying: ["수납 완료 · 이용권 반영 중", "Paid · applying"],
  applied: ["반영 완료", "Applied"],
  review_required: ["운영 확인 중", "Under operations review"],
  canceled: ["결제 거절·취소", "Declined or cancelled"],
  expired: ["주문 만료", "Order expired"],
};
export const refundLabels: Record<TeamRefundState, [string, string]> = {
  reserved: ["환불 검토 중 · 미사용분 예약됨", "Refund under review · unused portion reserved"],
  cancelling: ["환불 처리 중", "Refund in progress"],
  provider_unknown: ["환불 결과 확인 중", "Checking refund result"],
  refunded: ["환불 완료", "Refunded"],
  rejected: ["환불 거절 · 예약 해제", "Refund declined · reservation released"],
  failed: ["환불 실패 · 운영 확인", "Refund failed · operations review"],
  review_required: ["환불 운영 확인 중", "Refund under operations review"],
};
const messages: Record<string, [string, string]> = {
  B2B_BILLING_OPERATION_PENDING: ["다른 창에서 시작한 결제 관련 요청이 확인 중입니다. 원래 요청의 결과를 먼저 확인해 주세요.", "A billing request started in another window is pending. Check the original request first."],
  B2B_BILLING_OPERATION_INVALID: ["보관된 요청 기록을 확인할 수 없습니다. 새 결제를 보내지 않고 중단했습니다.", "The saved request cannot be verified. No new payment was sent."],
  B2B_BILLING_SCOPE_CHANGED: ["다른 팀 화면으로 이동했습니다. 원래 팀에서 요청 결과를 확인해 주세요.", "The team changed. Check the request in the original team."],
  B2B_BILLING_SETTING_MISSING: ["판매나 결제에 필요한 설정이 확정되지 않아 이 동작을 할 수 없습니다.", "A required billing setting is not approved, so this action is unavailable."],
  B2B_BILLING_PAYMENT_NOT_CONFIGURED: ["자동결제 상점 설정이 준비되지 않았습니다.", "The automatic-payment merchant is not configured."],
  B2B_PAYMENT_NOT_CONFIGURED: ["결제 설정이 준비되지 않았습니다.", "Payment is not configured."],
  B2B_BILLING_KEY_CIPHER_NOT_CONFIGURED: ["결제 수단 보관 설정이 준비되지 않았습니다.", "Payment-method storage is not configured."],
  B2B_CHECKOUT_NOT_READY: ["결제가 아직 열리지 않았습니다.", "Checkout is not open yet."],
  B2B_PAYMENT_PENDING: ["확인 중인 결제가 있습니다. 결과를 확인한 뒤 진행해 주세요. 다시 결제하지 마세요.", "A payment is still being checked. Wait for its result; do not pay again."],
  B2B_TERMINATION_PAYMENT_PENDING: ["진행 중인 결제가 끝난 뒤 해지 금액을 다시 확인해 주세요.", "Check the termination amount again after the payment in progress has finished."],
  B2B_NEXT_PERIOD_ALREADY_PURCHASED: ["다음 한 달은 이미 구매되었습니다.", "The next month is already purchased."],
  B2B_ORDER_NOT_PAYABLE: ["이 주문은 지금 결제할 수 없습니다. 주문 상태를 확인해 주세요.", "This order cannot be paid now. Check its state."],
  B2B_ORDER_EXPIRED: ["주문 유효시간이 지났습니다. 견적부터 다시 확인해 주세요.", "The order expired. Start from a new quote."],
  B2B_ORDER_NOT_FOUND: ["현재 계정에서 이 주문을 확인할 수 없습니다.", "This order is unavailable to the current account."],
  B2B_PAYMENT_KEY_CONFLICT: ["다른 결제 정보가 이미 이 주문에 연결되어 있습니다.", "A different payment is already bound to this order."],
  B2B_QUOTE_EXPIRED: ["견적 유효시간이 지났습니다. 견적을 다시 확인해 주세요.", "The quote expired. Check a new quote."],
  B2B_QUOTE_ALREADY_ORDERED: ["이 견적으로 이미 주문을 만들었습니다.", "This quote already has an order."],
  B2B_BUYER_INVALID: ["사업자 정보 형식을 확인해 주세요.", "Check the business details."],
  B2B_BILLING_SCHEMA_NOT_CONFIGURED: ["사업자 정보 항목이 아직 확정되지 않았습니다.", "Business detail fields are not approved yet."],
  B2B_BILLING_PROFILE_REQUIRED: ["사업자 정보를 먼저 저장해 주세요.", "Save business details first."],
  B2B_REVISION_CONFLICT: ["다른 곳에서 먼저 변경되었습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.", "Someone changed this first. Review the latest version and save again."],
  B2B_REQUEST_KEY_CONFLICT: ["처음 요청과 다른 내용으로 같은 요청을 보낼 수 없습니다.", "The original request cannot be resent with different content."],
  B2B_AUTOPAY_CONSENT_REQUIRED: ["자동결제 동의 내용이나 상품 조건이 바뀌었습니다. 최신 내용을 확인하고 다시 동의해 주세요.", "Consent text or product terms changed. Review and consent again."],
  B2B_PAYMENT_METHOD_REQUIRED: ["사용 가능한 결제 수단이 필요합니다.", "An active payment method is required."],
  B2B_PAYMENT_METHOD_MISMATCH: ["결제 수단 등록 정보가 일치하지 않습니다. 등록을 처음부터 다시 진행해 주세요.", "The registration does not match. Start the registration again."],
  B2B_PAYMENT_METHOD_NOT_FOUND: ["결제 수단을 찾을 수 없습니다.", "The payment method is unavailable."],
  B2B_RENEWAL_PLAN_INVALID: ["다음 기간 정원과 유지 대상을 확인해 주세요.", "Check the next-period capacity and retained members."],
  B2B_RENEWAL_RETAINED_EXCEEDS_SEATS: ["유지 대상이 다음 기간 정원보다 많습니다. 부족한 정원은 자동으로 구매하지 않습니다.", "More retained members than next-period seats. Missing seats are never bought automatically."],
  B2B_REFUND_POLICY_NOT_CONFIGURED: ["이 주문 상품의 환불 기준이 확정되지 않아 환불을 요청할 수 없습니다.", "No approved refund policy exists for this order's product."],
  B2B_REFUND_NOT_REFUNDABLE: ["선택한 항목에는 환불할 미사용분이 없거나 승인된 기준상 환불 대상이 아닙니다.", "The selection has no refundable unused portion under the approved policy."],
  B2B_REFUND_PENDING: ["환불이 처리 중입니다. 끝난 뒤에 진행해 주세요. 같은 기간의 새 구매도 그때까지 막힙니다.", "A refund is in progress. Continue after it finishes; buying the same period again waits too."],
  B2B_REFUND_BASIS_STALE: ["환불 금액을 확인한 지 시간이 지났습니다. 다시 확인해 주세요.", "The refund amount was checked a while ago. Check it again."],
  B2B_REFUND_SEATS_IN_USE: ["사용 중인 좌석은 환불할 수 없습니다. 멤버 화면에서 좌석을 먼저 꺼 주세요.", "Seats in use cannot be refunded. Turn seats off on People first."],
  B2B_REFUND_STORAGE_IN_USE: ["사용 중인 저장 용량은 환불할 수 없습니다.", "Storage in use cannot be refunded."],
  B2B_REFUND_AI_IN_USE: ["사용·예약된 AI 제공량은 환불할 수 없습니다.", "Used or reserved AI cannot be refunded."],
  B2B_REFUND_AMOUNT_CHANGED: ["사용량이 바뀌어 환불 금액이 달라졌습니다. 다시 확인해 주세요.", "Usage changed the refund amount. Review it again."],
  B2B_REFUND_EXCEEDS_BALANCE: ["원결제 잔액을 넘는 환불은 할 수 없습니다. 운영 확인이 필요합니다.", "The refund exceeds the original payment balance."],
  B2B_TERMINATION_REQUIRED: ["진행 중인 이용기간의 기본 상품은 중도해지로 환불합니다. 플랜과 결제의 중도해지를 이용해 주세요.", "The running period's base plan is refunded through mid-term termination. Use termination on plan and billing."],
  B2B_TERMINATION_NOT_ACTIVE: ["지금 진행 중인 이용기간이 없어 중도해지할 것이 없습니다.", "There is no running period to terminate."],
  B2B_TERMINATION_NOT_OFFERED: ["승인된 환불 기준이 이 기간의 중도해지 환불을 제공하지 않습니다. 운영팀에 문의해 주세요.", "The approved refund policy offers no termination refund for this period. Contact support."],
  B2B_REASON_REQUIRED: ["사유를 입력해 주세요.", "Enter a reason."],
  B2B_RENEWAL_CONSENT_NOT_OPEN: ["아직 동의할 수 있는 기간이 아닙니다. 안내된 시각부터 동의할 수 있습니다.", "Consent is not open yet. It opens at the time shown."],
  B2B_RENEWAL_CONSENT_CLOSED: ["이 갱신 동의 요청은 이미 답했거나 닫혔습니다. 최신 상태를 확인해 주세요.", "This renewal consent was already answered or has closed. Check the latest state."],
  B2B_RENEWAL_CONSENT_CHANGED: ["갱신 금액이나 상품이 바뀌었습니다. 새 금액을 확인하고 다시 동의해 주세요.", "The renewal price or product changed. Review the new amount and consent again."],
  B2B_RENEWAL_CONSENT_STALE: ["상품 조건이 다시 바뀌어 이 동의 요청으로는 갱신할 수 없습니다. 새 안내를 기다려 주세요.", "The product changed again, so this request can no longer renew. Wait for a new notice."],
  B2B_RENEWAL_CONSENT_NOT_FOUND: ["이 갱신 동의 요청을 찾을 수 없습니다.", "This renewal consent request is unavailable."],
  B2B_ORDER_NOT_REFUNDABLE: ["반영이 완료된 주문만 환불을 요청할 수 있습니다.", "Only applied orders can be refunded."],
  B2B_BILLING_STORAGE_UNAVAILABLE: ["이 브라우저에서 결제 요청 기록을 보존할 수 없어 진행하지 않았습니다.", "This browser cannot preserve the billing request, so nothing was sent."],
  B2B_BILLING_ACCOUNT_CHANGED: ["로그인 계정이 바뀌었습니다. 원래 계정으로 돌아가 결과를 확인해 주세요.", "The signed-in account changed. Return to the original account to confirm."],
  B2B_FILE_ACCOUNT_CHANGED: ["로그인 계정이 바뀌었습니다. 현재 계정으로 다시 열어 주세요.", "The signed-in account changed. Reopen for the current account."],
  B2B_BILLING_SERVICE_CHANGED: ["접속한 서비스가 바뀌었습니다. 다시 열어 주세요.", "The service changed. Reopen this page."],
  B2B_PG_RETURN_SCOPE_MISMATCH: ["이 결제는 다른 계정이나 팀에서 시작되었거나 이 브라우저에 시작 기록이 없습니다. 결제를 확정하지 않았습니다. 결제를 시작한 계정으로 열어 확인해 주세요.", "This payment was started from another account or team, or this browser has no record of starting it. Nothing was confirmed. Open it from the account that started the payment."],
  B2B_PG_RETURN_MISMATCH: ["결제창에서 돌아온 정보가 이 주문과 다릅니다. 결제를 확정하지 않았습니다.", "The payment window returned data for a different order. Nothing was confirmed."],
};
export function BillingError({ code, retry }: { code: string; retry?: () => void }) {
  const c = useCopy();
  const m = messages[code];
  if (!m) return <B2bError code={code} retry={retry} />;
  return (
    <div role="alert" className="rounded-lg border border-border bg-surface p-4 text-sm leading-6">
      <p>{c(...m)}</p>
      {retry && (
        <button type="button" className={`${secondaryClass} mt-3`} onClick={retry}>
          {c("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}
export const billingCode = (e: unknown) =>
  e instanceof Error && /^B2B_[A-Z_]+$/.test(e.message) ? e.message : errorCode(e);

/** The billing view of one team for the signed-in account. Reads after the
 * first pin the account; a changed account, team or service clears every
 * value from the previous one and never shows its business data. */
/** One topic, three pages: the plan, the billing details it runs on, and the
 * monthly statements it produces. They used to be two sidebar entries and a
 * button, with no way across from statements back to the plan. */
export const billingTabs = (
  workspaceId: string,
  c: (ko: string, en: string) => string,
) => {
  const base = `/dashboard/workspaces/${workspaceId}`;
  return [
    { href: `${base}/plan`, label: c("개요", "Overview") },
    { href: `${base}/plan/settings`, label: c("결제 정보", "Billing details") },
    { href: `${base}/statements`, label: c("월 이용명세서", "Statements") },
  ];
};

export function useTeamBilling(workspaceId: string) {
  const store = useMemo(() => new BrowserBillingStore(), []);
  const [billing, setBilling] = useState<TeamBilling | null>(null);
  const [scope, setScope] = useState<BillingScope | null>(null);
  const [error, setError] = useState("");
  const serial = useRef(0),
    pinned = useRef<string | null>(null);
  const load = useCallback(async () => {
    const call = ++serial.current;
    try {
      const origin = new URL(apiClient.defaults.baseURL!).origin;
      const view = await billingApi({ origin, userId: pinned.current, workspaceId }).overview();
      if (call !== serial.current) return;
      pinned.current = view.currentUserId;
      setScope((s) =>
        s?.userId === view.currentUserId && s.origin === origin && s.workspaceId === workspaceId
          ? s
          : { origin, userId: view.currentUserId, workspaceId },
      );
      setBilling(view);
      setError("");
    } catch (e) {
      if (call !== serial.current) return;
      // A failed read is never "no profile" or "no methods".
      setBilling(null);
      const code = billingCode(e);
      if (code === "B2B_FILE_ACCOUNT_CHANGED") {
        pinned.current = null;
        setScope(null);
        setError("B2B_BILLING_ACCOUNT_CHANGED");
      } else setError(code);
    }
  }, [workspaceId]);
  useEffect(() => {
    pinned.current = null;
    const s = serial;
    // A different team starts empty; nothing from the previous one is shown.
    const t = setTimeout(() => {
      setBilling(null);
      setScope(null);
      setError("");
      void load();
    }, 0);
    const recheck = () => void load();
    window.addEventListener("focus", recheck);
    window.addEventListener("storage", recheck);
    return () => {
      clearTimeout(t);
      s.current++;
      window.removeEventListener("focus", recheck);
      window.removeEventListener("storage", recheck);
    };
  }, [workspaceId, load]);
  const api: BillingApi | null = useMemo(() => (scope ? billingApi(scope) : null), [scope]);
  return { billing, scope, api, store, error, reload: load };
}
const tossScript = "https://js.tosspayments.com/v2/standard";
declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (o: { customerKey: string }) => {
        requestPayment: (o: Record<string, unknown>) => Promise<void>;
        requestBillingAuth: (o: Record<string, unknown>) => Promise<void>;
      };
    };
  }
}
async function toss() {
  if (!window.TossPayments)
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = tossScript;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("B2B_CHECKOUT_UNAVAILABLE"));
      document.head.appendChild(s);
    });
  return window.TossPayments!;
}
/** Opens the official payment window, or the local double in local tests. */
export async function openPaymentWindow(input: {
  client: { mode: "toss" | "local_double"; clientKey: string; doubleCheckoutUrl: string | null };
  orderId: string;
  orderName: string;
  amount: number;
  method: "카드" | "계좌이체";
  successUrl: string;
  failUrl: string;
  // Written down before leaving; the return confirms only against it.
  intent: PgIntent;
}) {
  savePgIntent(input.intent);
  if (input.client.mode === "local_double") {
    const q = new URLSearchParams({
      clientKey: input.client.clientKey,
      orderId: input.orderId,
      orderName: input.orderName,
      amount: String(input.amount),
      method: input.method === "카드" ? "CARD" : "TRANSFER",
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    });
    window.location.assign(`${input.client.doubleCheckoutUrl}/checkout?${q}`);
    return;
  }
  const payment = (await toss())(input.client.clientKey).payment({ customerKey: "ANONYMOUS" });
  await payment.requestPayment({
    method: input.method === "카드" ? "CARD" : "TRANSFER",
    amount: { currency: "KRW", value: input.amount },
    orderId: input.orderId,
    orderName: input.orderName,
    successUrl: input.successUrl,
    failUrl: input.failUrl,
  });
}
export async function openBillingAuth(input: {
  client: { mode: "toss" | "local_double"; clientKey: string; doubleCheckoutUrl: string | null };
  customerKey: string;
  successUrl: string;
  failUrl: string;
}) {
  if (input.client.mode === "local_double") {
    const q = new URLSearchParams({
      clientKey: input.client.clientKey,
      customerKey: input.customerKey,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    });
    window.location.assign(`${input.client.doubleCheckoutUrl}/billing-auth?${q}`);
    return;
  }
  const payment = (await toss())(input.client.clientKey).payment({ customerKey: input.customerKey });
  await payment.requestBillingAuth({ method: "CARD", successUrl: input.successUrl, failUrl: input.failUrl });
}
