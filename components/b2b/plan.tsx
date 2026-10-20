"use client";
import { Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CreditCard } from "lucide-react";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { BusinessCheckout } from "./business-checkout";
import { RenewalConsentCard } from "./billing-legal";
import type {
  B2bStatus,
  TeamBuyer,
  TeamCommerce,
  TeamOrderList,
} from "@/lib/api/services/b2b.service";
import {
  AUTO_SEATS_CONSENT_VERSION,
  BillingError,
  billingCode,
  kst,
  kstDay,
  openBillingAuth,
  orderLabels,
  orderTones,
  refundLabels,
  refundTones,
  targetLabels,
  useTeamBilling,
  useWon,
} from "./billing-shared";
import { formatPhone } from "@/lib/api/generated/b2b";
import { runRecord, checkRecord, discardRecord, type BillingAction, type BillingRecord } from "@/lib/b2b-billing/operations";
import { TeamLoading, TeamShell } from "@/components/workspaces/shared";
import {
  Badge,
  Button,
  buttonClass,
  inputClass,
  Notice,
  numClass,
  SettingsSection,
  SortHeader,
  sortRows,
  tableClass,
  tdClass,
  useSort,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { B2bError, definitivelyRejected, StateBadge, useCopy } from "./shared";

const fields: [keyof TeamBuyer, string, string, string, string][] = [
  ["businessName", "상호", "Business name", "organization", "text"],
  ["businessRegistrationNumber", "사업자등록번호", "Registration number", "off", "text"],
  ["representative", "대표자", "Representative", "name", "text"],
  ["address", "사업장 주소", "Business address", "street-address", "text"],
  ["receiptEmail", "세금계산서 이메일", "Invoice email", "email", "email"],
  ["contactName", "담당자 이름", "Contact name", "name", "text"],
  ["contactPhone", "담당자 연락처", "Contact phone", "tel", "tel"],
];
const actionLabels: Record<BillingAction, [string, string]> = {
  order: ["주문", "Order"],
  profile: ["세금계산서 정보", "Invoice details"],
  renewal: ["구독 다시 시작", "Resume subscription"],
  "renewal.stop": ["구독 해지", "Cancel subscription"],
  refund: ["환불 요청", "Refund request"],
  "method.start": ["카드 등록", "Card registration"],
  "method.remove": ["카드 삭제", "Card removal"],
  termination: ["중도해지", "Termination"],
  "renewal.consent.accept": ["갱신 금액 동의", "Renewal consent"],
  "renewal.consent.decline": ["갱신 금액 거절", "Renewal consent decline"],
};
// Why automatic payment stopped, when it did not stop by our own 해지.
const paused: Record<string, [string, string]> = {
  method_removed: ["결제 카드가 없어 자동결제가 멈췄어요.", "Automatic payment stopped: no card."],
  method_owner_lost_authority: ["카드를 등록한 사람의 결제 권한이 해제돼 자동결제가 멈췄어요.", "Stopped: the card's owner lost billing permission."],
  consent_owner_lost_authority: ["동의한 사람의 결제 권한이 해제돼 자동결제가 멈췄어요.", "Stopped: the consenting person lost billing permission."],
  product_changed: ["상품 조건이 바뀌어 다시 동의가 필요해요.", "The product changed. Consent again."],
  profile_missing: ["세금계산서 정보가 없어 자동결제가 멈췄어요.", "Stopped: invoice details are missing."],
  method_environment_changed: ["결제 환경이 바뀌었어요. 카드를 다시 등록해 주세요.", "The payment environment changed. Register the card again."],
  renewal_consent_declined: ["바뀐 갱신 금액에 동의하지 않아 이번 기간 끝에 종료돼요.", "Changed renewal price declined · ends with this period."],
};
const registrationOwnerKey = (methodId: string) => `prepix:card-registration:${methodId}`;

/** A label, what it is, and at most one action: the shape of every line here. */
function Row({ label, children, action }: { label: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-6">
      <dt className="shrink-0 text-[13px] text-muted sm:w-[8.75rem]">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * 플랜과 결제, one page (2026-10-12, after Claude Team and Figma billing):
 * the plan, the card, the invoice details, the payments, and 해지 last.
 * Nothing to configure about renewal: it follows the members, and 해지 means
 * "use this period, pay nothing after". Every edit opens from its own line.
 */
export function B2bPlan(props: { status: Extract<B2bStatus, { enrolled: true }>; workspace: { id: string; name: string } }) {
  return (
    <Suspense>
      <Plan {...props} />
    </Suspense>
  );
}

function Plan({
  status,
  workspace,
}: {
  status: Extract<B2bStatus, { enrolled: true }>;
  workspace: { id: string; name: string };
}) {
  const c = useCopy();
  const won = useWon();
  const { lang } = useI18n();
  const params = useSearchParams();
  const billing = useTeamBilling(workspace.id);
  const { billing: view, api, scope, store, reload, error } = billing;
  const [orders, setOrders] = useState<TeamOrderList | null>(null);
  const [commerce, setCommerce] = useState<TeamCommerce | null>(null);
  const [pending, setPending] = useState<BillingRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [draft, setDraft] = useState<TeamBuyer | null>(null);
  const cardDialog = useOverlayState();
  const profileDialog = useOverlayState();
  const cancelDialog = useOverlayState();
  const resumeDialog = useOverlayState();
  const seatsDialog = useOverlayState();
  const [sort, sortBy] = useSort<"date" | "item" | "amount" | "state">({ key: "date", dir: "desc" });

  const refreshPending = useCallback(async () => {
    if (!scope) return setPending([]);
    try {
      setPending(await store.list(scope));
    } catch (e) {
      setFailure(billingCode(e));
    }
  }, [scope, store]);
  useEffect(() => {
    if (!api) return;
    let live = true;
    void api.orders().then((r) => live && setOrders(r)).catch((e) => live && setFailure(billingCode(e)));
    void api.commerce().then((r) => live && setCommerce(r)).catch(() => undefined);
    const t = setTimeout(() => void refreshPending(), 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [api, refreshPending, view?.renewal.revision]);

  // Back from the card window: the server issues and checks the key; the
  // one-time authKey leaves the address bar once the server has answered.
  // While the checkout is on screen (unpaid or lapsed) it owns the return.
  const completing = useRef(false);
  const registration = params.get("registration");
  const checkoutShown = !status.team.periodEndsAt || ["read_only", "recovery", "deletion_due"].includes(status.team.currentState);
  useEffect(() => {
    const authKey = params.get("authKey"),
      customerKey = params.get("customerKey");
    if (checkoutShown || !api || !registration || !authKey || !customerKey || completing.current) return;
    let owner: string | null = null;
    try {
      owner = sessionStorage.getItem(registrationOwnerKey(registration));
    } catch {
      /* unknown owner */
    }
    if (owner && scope?.userId && owner !== scope.userId) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    completing.current = true;
    setBusy("method.complete");
    void api
      .completeMethod(registration, { requestKey: `complete-${registration}`, customerKey, authKey })
      .then((r) => {
        setNotice(
          r.method.state === "active"
            ? c("카드를 등록했어요.", "Card registered.")
            : r.method.state === "issuing"
              ? c("카드 등록을 확인하고 있어요. 잠시 뒤 다시 확인해 주세요.", "Checking the card. Look again in a moment.")
              : c("카드를 등록하지 못했어요. 다시 시도해 주세요.", "The card was not registered. Try again."),
        );
        if (r.method.state !== "issuing") window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((e) => {
        setFailure(billingCode(e));
        if (definitivelyRejected(e)) window.history.replaceState(null, "", window.location.pathname);
      })
      .finally(() => {
        completing.current = false;
        setBusy("");
        void reload();
      });
  }, [api, scope, registration, params, reload, c, checkoutShown]);

  const run = async <A extends BillingAction>(action: A, topic: string, input: BillingRecord<A>["input"]) => {
    if (!api || !scope || busy) return null;
    setBusy(action);
    setFailure("");
    setNotice("");
    try {
      const result = await runRecord({ schema: 1, scope, action, topic, input, attempts: 0 }, api, store);
      await reload();
      return result;
    } catch (e) {
      setFailure(billingCode(e));
      return null;
    } finally {
      setBusy("");
      await refreshPending();
    }
  };
  const settle = async (r: BillingRecord, keep: boolean) => {
    if (!api) return;
    setBusy("check");
    try {
      if (keep) {
        if (!(await checkRecord(r, api, store))) await runRecord(r, api, store);
      } else await discardRecord(r, api, store);
      await reload();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy("");
      await refreshPending();
    }
  };

  if (!status.allowedActions.billing) return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  if (!view) return error ? <BillingError code={error} retry={() => void reload()} /> : <TeamLoading />;

  const r = view.readiness;
  const plan = view.renewal;
  const team = status.team;
  // What is sold now: the price line, the renewal estimate and the consent
  // all name it. A team that bought this period on older terms (the launch
  // product: 2 seats) renews on these, after its re-consent.
  const product = commerce?.configured ? commerce.product : null;
  const period = commerce?.configured ? commerce.currentPeriod : null;
  // Seats are counted on the terms this period was bought with.
  const bought = period?.product ?? product;
  const lapsed = ["read_only", "recovery", "deletion_due"].includes(team.currentState);
  const target = !team.periodEndsAt ? "initial" : lapsed ? "restore" : null;
  const running = team.currentState === "active";
  const card = view.methods.find((m) => m.state === "active");
  const automatic = plan.mode === "automatic";
  const ends = team.periodEndsAt;
  const seats = bought && period ? bought.base.seats + period.extraSeats : null;
  // Seats beyond the current product's minimum, at its price.
  const extraNow = product && seats !== null ? Math.max(0, seats - product.base.seats) : 0;
  // The renewal bills members but viewers, never past the consented seats;
  // today's paid seats at today's price are the honest estimate (VAT included).
  const estimate =
    product && seats !== null
      ? Math.round(
          (product.base.supplyKrw + product.extraSeat.supplyKrw * Math.min(plan.extraSeats ?? extraNow, extraNow)) *
            (1 + product.settlement.vatBasisPoints / 10_000),
        )
      : null;
  const failedRun = view.runs.find((x) => x.state === "scheduled" && x.attempts > 0);
  const nextCharge = automatic && plan.firstChargeAt && plan.firstChargeAt > view.serverTime ? plan.firstChargeAt : null;
  const profile = view.profile;
  const openProfile = () => {
    setDraft({
      schemaVersion: r.profileSchemaVersion ?? "",
      businessName: profile?.businessName ?? "",
      businessRegistrationNumber: profile?.businessRegistrationNumber ?? "",
      representative: profile?.representative ?? "",
      address: profile?.address ?? "",
      receiptEmail: profile?.receiptEmail ?? "",
      contactName: profile?.contactName ?? "",
      contactPhone: profile?.contactPhone ? formatPhone(profile.contactPhone) : "",
    });
    profileDialog.open();
  };
  const openCard = () => {
    setConsent(false);
    cardDialog.open();
  };
  const startCard = async () => {
    const result = (await run("method.start", "method", {
      requestKey: crypto.randomUUID(),
      consentVersion: r.autoPayConsentVersion!,
    })) as { methodId: string; customerKey: string; checkout?: Parameters<typeof openBillingAuth>[0]["client"] | null } | null;
    if (!result) return;
    if (!result.checkout) return setFailure("B2B_BILLING_PAYMENT_NOT_CONFIGURED");
    const back = `${window.location.origin}/dashboard/workspaces/${workspace.id}/plan`;
    try {
      sessionStorage.setItem(registrationOwnerKey(result.methodId), scope?.userId ?? "");
    } catch {
      /* the return then completes as before */
    }
    await openBillingAuth({
      client: result.checkout,
      customerKey: result.customerKey,
      successUrl: `${back}?registration=${result.methodId}`,
      failUrl: `${back}?registration_failed=${result.methodId}`,
    }).catch((e) => setFailure(billingCode(e)));
  };
  // 다시 시작 = the subscription with both consents, as at checkout: renewal
  // for the members it has, and new members charged the days left.
  const resume = async () => {
    if (!api || !card || !product || !period) return;
    const done = await run("renewal", "renewal", {
      requestKey: crypto.randomUUID(),
      revision: plan.revision,
      mode: "automatic",
      methodId: card.id,
      extraSeats: Math.max(plan.extraSeats ?? 0, extraNow),
      aiPacks: 0,
      storagePacks: plan.storagePacks,
      retainedUserIds: plan.retainedUserIds,
      consentVersion: r.autoPayConsentVersion ?? undefined,
      productVersion: product.version,
    });
    if (!done) return;
    await api
      .changeAutoSeats({ requestKey: crypto.randomUUID(), enabled: true, consentVersion: AUTO_SEATS_CONSENT_VERSION })
      .catch(() => undefined);
    await reload();
    resumeDialog.close();
  };
  const autoSeats = async (enabled: boolean) => {
    if (!api || busy) return;
    setBusy("seats");
    setFailure("");
    try {
      await api.changeAutoSeats({
        requestKey: crypto.randomUUID(),
        enabled,
        ...(enabled ? { consentVersion: AUTO_SEATS_CONSENT_VERSION } : {}),
      });
      await reload();
      seatsDialog.close();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy("");
    }
  };
  const consentBox = (text: string) => (
    <label className="flex items-start gap-2.5 text-[13px] leading-5">
      <input type="checkbox" className="mt-0.5 shrink-0" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
      <span>{text}</span>
    </label>
  );
  const subscriptionConsent = c(
    "매월 결제일에 등록한 카드로 뷰어를 뺀 멤버 수만큼 자동결제하고, 멤버가 늘면 이번 기간에 남은 날만큼 바로 결제하는 데 동의합니다. 언제든 해지할 수 있습니다.",
    "I agree to monthly charges to this card for every member but viewers, and to an immediate charge for the days left when members are added. Cancel any time.",
  );

  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")}>
      <RenewalConsentCard billing={billing} />
      {r.missing.length > 0 && (
        <Notice role="status">
          {c("승인되지 않은 결제 설정이 있어 일부 동작을 막았어요.", "Some billing actions are blocked by unapproved settings.")}{" "}
          <span className="text-xs">{r.missing.join(", ")}</span>
        </Notice>
      )}
      {failure && <BillingError code={failure} />}
      {notice && <Notice role="status">{notice}</Notice>}
      {params.get("registration_failed") && !checkoutShown && (
        <Notice role="status">{c("카드 등록을 마치지 않았어요. 결제되지 않았어요.", "Card registration was not finished. Nothing was charged.")}</Notice>
      )}
      {pending.length > 0 && (
        <Notice role="status">
          <span className="block">{c("결과를 확인하지 못한 요청이 있어요.", "Some requests have no confirmed result.")}</span>
          <span className="mt-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <span key={p.topic + p.action} className="flex gap-2">
                <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => void settle(p, true)}>
                  {c("결과 확인", "Check")} · {c(...actionLabels[p.action])}
                </Button>
                <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void settle(p, false)}>
                  {c("버리기", "Discard")}
                </Button>
              </span>
            ))}
          </span>
        </Notice>
      )}

      <SettingsSection
        title="Business"
        description={
          product
            ? c(
                `좌석당 월 ${won(product.extraSeat.supplyKrw)} · 최소 ${product.base.seats}석 · 부가세 별도`,
                `${won(product.extraSeat.supplyKrw)} per seat a month · ${product.base.seats} seats minimum · VAT extra`,
              )
            : undefined
        }
        action={
          running && !automatic ? (
            <Badge tone="warning" dot>
              {c("해지 예정", "Ends at period end")}
            </Badge>
          ) : (
            <StateBadge state={team.currentState} />
          )
        }
      >
        {(seats !== null || ends) && (
        <dl>
          {seats !== null && (
            <Row
              label={c("좌석", "Seats")}
              action={
                <Link href={`/dashboard/workspaces/${workspace.id}/members`} className={buttonClass({ variant: "secondary", size: "sm" })}>
                  {c("멤버 관리", "Manage members")}
                </Link>
              }
            >
              {c(`${seats}석`, `${seats} seats`)}
            </Row>
          )}
          {ends && team.periodStartsAt && (
            <Row label={c("이용기간", "Period")}>
              <span title={c(`${kst(ends)}까지 (한국 시간)`, `Until ${kst(ends, "en")} KST`)}>
                {kstDay(team.periodStartsAt, lang, ends)} – {kstDay(ends, lang, team.periodStartsAt)}
              </span>
            </Row>
          )}
          {running && ends && (
            <Row
              label={c("다음 결제", "Next payment")}
              action={
                !automatic &&
                card && (
                  <Button size="sm" onClick={() => (setConsent(false), resumeDialog.open())}>
                    {c("구독 다시 시작", "Resume")}
                  </Button>
                )
              }
            >
              {!automatic ? (
                <>
                  {c("없음", "None")}
                  <span className="block text-[13px] text-muted">
                    {c(`자동결제가 꺼져 있어요. ${kstDay(ends, lang)}까지 쓸 수 있어요.`, `Automatic payment is off. Usable until ${kstDay(ends, lang)}.`)}
                  </span>
                </>
              ) : plan.upcomingSkipped ? (
                c(
                  `이번 기간은 자동결제되지 않아요. ${kstDay(ends, lang)}에 끝나면 다시 결제해 주세요.`,
                  `This period is not renewed automatically. Pay again when it ends on ${kstDay(ends, lang)}.`,
                )
              ) : nextCharge ? (
                <>
                  {kstDay(nextCharge, lang)}
                  {estimate !== null && <span className="text-muted"> · {c(`약 ${won(estimate)}`, `about ${won(estimate)}`)}</span>}
                </>
              ) : (
                c(`${kstDay(ends, lang)}부터 다음 기간`, `Next period from ${kstDay(ends, lang)}`)
              )}
              {failedRun?.nextAttemptAt && (
                <span className="block text-[13px] text-danger-ink">
                  {c(`결제가 실패했어요 · ${kstDay(failedRun.nextAttemptAt, lang)}에 다시 시도해요`, `Payment failed · retrying ${kstDay(failedRun.nextAttemptAt, lang)}`)}
                </span>
              )}
              {plan.pausedReason && paused[plan.pausedReason] && (
                <span className="block text-[13px] text-danger-ink">{c(...paused[plan.pausedReason])}</span>
              )}
            </Row>
          )}
          {running && automatic && (
            <Row
              label={c("멤버 추가", "New members")}
              action={
                plan.autoSeats ? (
                  <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => void autoSeats(false)}>
                    {c("끄기", "Turn off")}
                  </Button>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => (setConsent(false), seatsDialog.open())}>
                    {c("자동 결제로", "Automate")}
                  </Button>
                )
              }
            >
              {plan.autoSeats
                ? c("남은 기간만큼 바로 자동결제", "Charged for the days left, automatically")
                : c("멤버 화면에서 직접 결제", "Paid by hand on People")}
            </Row>
          )}
        </dl>
        )}
      </SettingsSection>

      {target && (
        <SettingsSection title={target === "initial" ? c("결제하고 시작", "Pay to start") : c("다시 시작", "Restart")}>
          <BusinessCheckout workspaceId={workspace.id} target={target} billing={billing} />
        </SettingsSection>
      )}

      {!target && (
        <SettingsSection
          title={c("결제 수단", "Payment method")}
          action={
            r.billing &&
            r.autoPayConsentVersion && (
              <Button variant="secondary" size="sm" disabled={!!busy} onClick={openCard}>
                {card ? c("변경", "Change") : c("등록", "Add")}
              </Button>
            )
          }
        >
          <p className="flex items-center gap-3 text-sm">
            <span aria-hidden="true" className="grid h-8 w-12 shrink-0 place-items-center rounded-md border border-border text-muted">
              <CreditCard size={16} strokeWidth={1.75} />
            </span>
            {card ? (
              <span className="font-mono tabular-nums">{card.cardNumberMasked ?? c("카드", "Card")}</span>
            ) : (
              <span className="text-muted">
                {view.methods.some((m) => m.state === "issuing")
                  ? c("등록 확인 중", "Being registered")
                  : c("등록된 카드가 없어요", "No card")}
              </span>
            )}
          </p>
        </SettingsSection>
      )}

      {!target && (
        <SettingsSection
          title={c("세금계산서 정보", "Invoice details")}
          action={
            r.profileSchemaVersion && (
              <Button variant="secondary" size="sm" disabled={!!busy} onClick={openProfile}>
                {profile ? c("수정", "Edit") : c("입력", "Add")}
              </Button>
            )
          }
        >
          {profile ? (
            <dl>
              {fields.map(([key, ko, en]) => (
                <Row key={key} label={c(ko, en)}>
                  {/* Saved before 2026-10-20, a profile may lack the email or the person in charge. */}
                  {!profile[key] ? (
                    <span className="text-[13px] text-muted">{c("없음 · 수정에서 입력해 주세요", "Missing · add it with Edit")}</span>
                  ) : key === "contactPhone" ? (
                    formatPhone(profile.contactPhone!)
                  ) : (
                    profile[key]
                  )}
                </Row>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-muted">{c("아직 입력하지 않았어요.", "Not added yet.")}</p>
          )}
        </SettingsSection>
      )}

      {orders && orders.items.length > 0 && (
        <SettingsSection
          title={c("결제 내역", "Payments")}
          action={
            <Link href={`/dashboard/workspaces/${workspace.id}/statements`} className={buttonClass({ variant: "ghost", size: "sm" })}>
              {c("월 이용명세서", "Monthly statements")}
            </Link>
          }
        >
          <div className="-mx-1 overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <SortHeader column="date" label={c("날짜", "Date")} sort={sort} onSort={sortBy} />
                  <SortHeader column="item" label={c("내용", "Item")} sort={sort} onSort={sortBy} />
                  <SortHeader column="amount" label={c("금액", "Amount")} sort={sort} onSort={sortBy} align="right" />
                  <SortHeader column="state" label={c("상태", "Status")} sort={sort} onSort={sortBy} />
                </tr>
              </thead>
              <tbody>
                {sortRows(orders.items, sort, (o, key) =>
                  key === "date" ? Date.parse(o.createdAt) : key === "amount" ? o.amounts.totalKrw : key === "item" ? c(...(targetLabels[o.target] ?? [o.target, o.target])) : c(...orderLabels[o.state]),
                lang).map((o) => (
                  <tr key={o.id} className="relative transition-colors hover:bg-surface focus-within:bg-surface">
                    <td className={`${tdClass} whitespace-nowrap tabular-nums text-muted`}>{formatDate(o.createdAt, lang)}</td>
                    <td className={`${tdClass} font-medium`}>
                      <Link
                        className="whitespace-nowrap after:absolute after:inset-0 focus-visible:outline-none"
                        href={`/dashboard/workspaces/${workspace.id}/plan/orders/${o.id}`}
                      >
                        {c(...(targetLabels[o.target] ?? [o.target, o.target]))}
                      </Link>
                    </td>
                    <td className={`${tdClass} ${numClass} whitespace-nowrap`}>{won(o.amounts.totalKrw)}</td>
                    <td className={tdClass}>
                      <span className="flex flex-wrap gap-1">
                        <Badge tone={orderTones[o.state]} dot={orderTones[o.state] !== "neutral"}>
                          {c(...orderLabels[o.state])}
                        </Badge>
                        {o.refund && (
                          <Badge tone={refundTones[o.refund.state]} dot={refundTones[o.refund.state] !== "neutral"}>
                            {c(...refundLabels[o.refund.state])}
                          </Badge>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsSection>
      )}

      {running && automatic && ends && (
        <section aria-label={c("구독 해지", "Cancel subscription")} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{c("구독 해지", "Cancel subscription")}</h2>
            <p className="mt-0.5 text-[13px] text-muted">
              {c(`${kstDay(ends, lang)}까지 쓰고, 그 뒤로는 결제되지 않아요.`, `Keep using it until ${kstDay(ends, lang)}; nothing is charged after.`)}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="text-danger-ink" disabled={!!busy} onClick={cancelDialog.open}>
            {c("구독 해지", "Cancel subscription")}
          </Button>
        </section>
      )}

      <Dialog state={cancelDialog} title={c("구독을 해지할까요?", "Cancel the subscription?")}>
        <div className="space-y-4">
          <p className="text-sm leading-6">
            {ends &&
              c(
                `${kstDay(ends, lang)}까지는 지금처럼 쓸 수 있고, 다음 결제부터 멈춰요. 그 전에 언제든 다시 시작할 수 있어요.`,
                `Everything works until ${kstDay(ends, lang)} and the next payment does not happen. You can resume before then.`,
              )}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cancelDialog.close}>
              {c("돌아가기", "Keep subscription")}
            </Button>
            <Button
              variant="danger"
              aria-busy={busy === "renewal.stop"}
              disabled={!!busy}
              onClick={async () => {
                if (await run("renewal.stop", "stop", { requestKey: crypto.randomUUID() })) cancelDialog.close();
              }}
            >
              {c("구독 해지", "Cancel subscription")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog state={resumeDialog} title={c("구독 다시 시작", "Resume subscription")}>
        <div className="space-y-4">
          <p className="text-sm leading-6">
            {card && c(`${card.cardNumberMasked ?? "등록 카드"}로 다음 결제부터 이어서 결제돼요.`, `The next payment is charged to ${card.cardNumberMasked ?? "your card"}.`)}
          </p>
          {consentBox(subscriptionConsent)}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={resumeDialog.close}>
              {c("취소", "Cancel")}
            </Button>
            <Button disabled={!consent || !!busy} aria-busy={busy === "renewal"} onClick={() => void resume()}>
              {c("다시 시작", "Resume")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog state={seatsDialog} title={c("멤버 추가 자동결제", "Automatic seats")}>
        <div className="space-y-4">
          {consentBox(
            c(
              "멤버가 합류하거나 역할이 바뀌어 좌석이 모자라면, 이번 이용기간의 남은 기간만큼 좌석 요금(일할, 부가세 별도)을 등록 카드로 바로 결제하는 데 동의합니다. 언제든 끌 수 있습니다.",
              "When members join or change roles and seats run short, I agree to an immediate charge to the card for the rest of this period (prorated, VAT extra). It can be turned off at any time.",
            ),
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={seatsDialog.close}>
              {c("취소", "Cancel")}
            </Button>
            <Button disabled={!consent || !!busy} onClick={() => void autoSeats(true)}>
              {c("켜기", "Turn on")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog state={cardDialog} title={card ? c("카드 변경", "Change card") : c("카드 등록", "Add card")}>
        <div className="space-y-4">
          {consentBox(
            c(
              "이 팀의 월 자동결제에 이 카드를 사용하는 데 동의합니다. 등록만으로 결제되지 않습니다.",
              "I agree to use this card for the team's monthly automatic payment. Registering charges nothing.",
            ),
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={cardDialog.close}>
              {c("취소", "Cancel")}
            </Button>
            <Button disabled={!consent || !!busy} aria-busy={busy === "method.start"} onClick={() => void startCard()}>
              {c("카드 입력", "Enter card")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog state={profileDialog} title={c("세금계산서 정보", "Invoice details")}>
        {draft && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const done = await run("profile", "profile", {
                requestKey: crypto.randomUUID(),
                revision: profile?.revision ?? null,
                ...draft,
                schemaVersion: r.profileSchemaVersion ?? "",
              });
              if (done) profileDialog.close();
            }}
          >
            {fields.map(([key, ko, en, auto, type]) => (
              <label key={key} className="block space-y-1.5 text-[13px]">
                <span className="font-medium">{c(ko, en)}</span>
                <input
                  className={inputClass}
                  type={type}
                  autoComplete={auto}
                  required
                  inputMode={type === "tel" ? "tel" : undefined}
                  placeholder={key === "contactPhone" ? "010-1234-5678" : undefined}
                  value={draft[key] ?? ""}
                  disabled={!!busy}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </label>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={profileDialog.close}>
                {c("취소", "Cancel")}
              </Button>
              <Button type="submit" disabled={!!busy} aria-busy={busy === "profile"}>
                {c("저장", "Save")}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </TeamShell>
  );
}
