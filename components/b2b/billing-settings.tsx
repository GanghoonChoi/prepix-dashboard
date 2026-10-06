"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import type {
  TeamBuyer,
  TeamCommerce,
  TeamRenewalPlan,
} from "@/lib/api/services/b2b.service";
import {
  runRecord,
  checkRecord,
  discardRecord,
  type BillingAction,
  type BillingRecord,
} from "@/lib/b2b-billing/operations";
import {
  BillingError,
  billingCode,
  kst,
  openBillingAuth,
  useTeamBilling,
} from "./billing-shared";
import { definitivelyRejected, useCopy } from "./shared";

const fields: [keyof TeamBuyer, string, string, string][] = [
  ["businessName", "상호", "Business name", "organization"],
  ["businessRegistrationNumber", "사업자등록번호", "Registration number", "off"],
  ["representative", "대표자", "Representative", "name"],
  ["address", "사업장 주소", "Business address", "street-address"],
  ["receiptEmail", "증빙 수신 이메일", "Receipt email", "email"],
];
const methodLabels: Record<string, [string, string]> = {
  pending: ["등록 대기", "Pending"],
  issuing: ["등록 확인 중", "Registering"],
  active: ["사용 중", "Active"],
  replaced: ["교체됨", "Replaced"],
  deleted: ["삭제됨", "Removed"],
  failed: ["등록 실패", "Failed"],
  unknown: ["등록 결과 불명 · 결제에 쓰지 않음", "Unknown · never charged"],
};
const reasons: Record<string, [string, string]> = {
  stopped_by_user: ["사용자가 중지", "Stopped by a billing user"],
  method_removed: ["결제 카드 삭제", "Card removed"],
  method_owner_lost_authority: ["카드 등록자의 결제 권한 해제", "Card registrant lost billing authority"],
  product_changed: ["상품 조건 변경 · 다시 동의 필요", "Product changed · consent again"],
  next_plan_unspecified: ["다음 기간 정원 미지정", "Next-period capacity not specified"],
  profile_missing: ["사업자 정보 없음", "Business details missing"],
  declined: ["카드 결제 거절", "Card declined"],
  retry_window_closed: ["기간 종료 전 결제 실패", "Not paid before the period ended"],
  next_period_purchased: ["다음 기간 선구매됨", "Next period prepaid"],
  review_required: ["운영 확인", "Operations review"],
  settings_missing: ["자동결제 설정 없음", "Automatic-payment settings missing"],
  not_eligible: ["결제 직전에 조건이 맞지 않아 보내지 않음", "Not sent: a condition no longer held at charge time"],
  order_review_required: ["다른 주문이 운영 확인 중이라 멈춤", "Stopped: another order is under operations review"],
  consent_owner_lost_authority: ["동의한 사용자의 결제 권한 해제", "The consenting user lost billing authority"],
  consent_inside_lead_window: ["결제 직전에 동의해 이번 기간은 건너뜀", "Consent came too close to the charge: this period is skipped"],
  team_not_active: ["팀이 삭제 중이라 종료", "Closed: the team is being deleted"],
  product_not_configured: ["상품 설정 없음", "Product not configured"],
  payment_not_configured: ["결제 설정 없음", "Payment not configured"],
  method_unavailable: ["결제 카드를 쓸 수 없음", "Card unavailable"],
  method_environment_changed: ["결제 환경이 바뀜 · 카드를 다시 등록", "Payment environment changed · register the card again"],
  renewal_stopped: ["갱신 방식이 자동이 아님", "Renewal is no longer automatic"],
};
const runLabels: Record<string, [string, string]> = {
  scheduled: ["자동결제 예정", "Scheduled"],
  charging: ["자동결제 확인 중", "Charging"],
  paid: ["다음 기간 결제 완료", "Next period paid"],
  failed: ["자동결제 실패 · 단건 구매 필요", "Failed · buy manually"],
  skipped: ["선구매로 자동결제 생략", "Skipped (prepaid)"],
  stopped: ["자동결제 중지", "Stopped"],
};

const registrationOwnerKey = (methodId: string) => `prepix:card-registration:${methodId}`;
/** S24: business details for future orders, team payment methods and the
 * renewal plan. Owner or current billing delegate only. */
export function BillingSettings({ workspaceId }: { workspaceId: string }) {
  const c = useCopy();
  const params = useSearchParams();
  const { billing, scope, api, store, error, reload } = useTeamBilling(workspaceId);
  const [commerce, setCommerce] = useState<TeamCommerce | null>(null);
  const [pending, setPending] = useState<BillingRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [profile, setProfile] = useState<TeamBuyer | null>(null);
  const [consent, setConsent] = useState(false);
  const [plan, setPlan] = useState<TeamRenewalPlan | null>(null);
  const [planConsent, setPlanConsent] = useState(false);
  const [removal, setRemoval] = useState("");
  const completing = useRef(false), viewGeneration = useRef(0);
  useEffect(() => {
    const generation = ++viewGeneration.current;
    completing.current = false;
    return () => { viewGeneration.current = generation + 1; };
  }, [api]);
  const refreshPending = useCallback(async () => {
    if (!scope) return setPending([]);
    try {
      setPending(await store.list(scope));
    } catch (e) {
      setFailure(billingCode(e));
    }
  }, [scope, store]);
  useEffect(() => {
    setProfile(null);
    setPlan(null);
    setCommerce(null);
    setFailure("");
    setBusy("");
    setNotice("");
    const t = setTimeout(() => void refreshPending(), 0);
    if (api) void api.commerce().then(setCommerce).catch((e) => setFailure(billingCode(e)));
    return () => clearTimeout(t);
  }, [api, refreshPending]);
  // Drafts follow the server: a new revision (ours or another person's)
  // replaces the draft instead of overwriting it silently.
  const [profileRevision, setProfileRevision] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!billing) return;
    const revision = billing.profile?.revision ?? null;
    if (revision !== profileRevision) setProfile(null);
    setProfileRevision(revision);
    setProfile((p) =>
      p ??
      (billing.profile
        ? {
            schemaVersion: billing.profile.schemaVersion,
            businessName: billing.profile.businessName,
            businessRegistrationNumber: billing.profile.businessRegistrationNumber,
            representative: billing.profile.representative,
            address: billing.profile.address,
            receiptEmail: billing.profile.receiptEmail,
          }
        : {
            schemaVersion: billing.readiness.profileSchemaVersion ?? "",
            businessName: "",
            businessRegistrationNumber: "",
            representative: "",
            address: "",
            receiptEmail: "",
          }),
    );
    setPlan((p) => (p && p.revision === billing.renewal.revision && p.updatedAt === billing.renewal.updatedAt ? p : billing.renewal));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing]);
  // Return from the card-registration window: the server issues and checks the
  // key; the one-time authKey leaves the address bar once the server answered.
  const registration = params.get("registration");
  useEffect(() => {
    const authKey = params.get("authKey"),
      customerKey = params.get("customerKey");
    if (!api || !registration || !authKey || !customerKey || completing.current) return;
    let owner: string | null = null;
    try { owner = sessionStorage.getItem(registrationOwnerKey(registration)); } catch { /* unknown owner */ }
    if (owner && scope?.userId && owner !== scope.userId) {
      // Another account came back: nothing is sent for it, and the one-time key leaves the address bar.
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    const generation = viewGeneration.current;
    const path = window.location.pathname;
    const current = () => {
      if (viewGeneration.current !== generation || window.location.pathname !== path) return false;
      try { api.assertScope(); return true; } catch { return false; }
    };
    completing.current = true;
    setBusy("method.complete");
    void api
      // One request key per registration: a lost reply is answered from the server's receipt.
      .completeMethod(registration, { requestKey: `complete-${registration}`, customerKey, authKey })
      .then((r) => {
        if (!current()) return;
        setNotice(
          r.method.state === "issuing"
            ? c("카드 등록을 확인하는 중입니다. 잠시 뒤 다시 확인해 주세요.", "The card registration is being checked. Check again in a moment.")
            : r.method.state === "active"
            ? c("결제 수단을 등록했습니다.", "The payment method is registered.")
            : r.method.state === "unknown"
              ? c("등록 결과를 확인하지 못했습니다. 이 수단은 결제에 쓰지 않습니다. 새로 등록해 주세요.", "The result is unknown. This method is never charged; register again.")
              : c("등록하지 못했습니다. 처음부터 다시 진행해 주세요.", "Registration failed. Start again."),
        );
        if (r.method.state !== "issuing") window.history.replaceState(null, "", window.location.pathname);
      })
      .catch((e) => {
        if (!current()) return;
        setFailure(billingCode(e));
        // A local session fence is not the server's answer: keep the return.
        if (definitivelyRejected(e)) window.history.replaceState(null, "", window.location.pathname);
      })
      .finally(() => {
        if (viewGeneration.current === generation) completing.current = false;
        if (!current()) return;
        setBusy("");
        void reload();
      });
  }, [api, scope, registration, params, reload, c]);
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
  const confirm = async (r: BillingRecord) => {
    if (!api) return;
    setBusy("check");
    try {
      const found = await checkRecord(r, api, store);
      if (found) await reload();
      else await runRecord(r, api, store);
      await reload();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy("");
      await refreshPending();
    }
  };
  const discard = async (r: BillingRecord) => {
    if (!api) return;
    setBusy("check");
    try {
      if (await discardRecord(r, api, store)) setNotice(c("이 변경을 버렸습니다. 서버에는 적용되지 않았습니다.", "The change was discarded. The server never applied it."));
      else await reload();
    } catch (e) {
      setFailure(billingCode(e));
    } finally {
      setBusy("");
      await refreshPending();
    }
  };
  if (!billing || !profile || !plan)
    return error ? <BillingError code={error} retry={() => void reload()} /> : <TeamLoading />;
  const r = billing.readiness;
  const active = billing.methods.filter((m) => m.state === "active");
  const lockedProfile = pending.find((p) => p.action === "profile");
  const lockedPlan = pending.find((p) => p.action === "renewal");
  const shownProfile = (lockedProfile?.input as TeamBuyer | undefined) ?? profile;
  const product = commerce?.configured ? commerce.product : null;
  return (
    <TeamShell title={c("결제 정보", "Billing details")}>
      <Link className={secondaryClass} href={`/dashboard/workspaces/${workspaceId}/plan`}>
        {c("플랜과 결제로 돌아가기", "Back to plan and billing")}
      </Link>
      {r.missing.length > 0 && (
        <section role="status" className="space-y-2 rounded-lg border border-border p-4 text-sm leading-6">
          <p>
            {c(
              "승인되지 않은 설정이 있어 일부 결제 동작을 막았습니다. 미정 값은 무료·무제한으로 처리하지 않습니다.",
              "Some billing actions are blocked by unapproved settings. Missing values are never treated as free or unlimited.",
            )}
          </p>
          <details>
            <summary>{c("필요한 설정", "Required settings")}</summary>
            <ul className="mt-2 list-disc pl-5 text-xs text-muted">
              {r.missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {failure && <BillingError code={failure} />}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {pending.length > 0 && (
        <section aria-label={c("확인이 필요한 요청", "Requests to confirm")} className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm leading-6">
            {c(
              "처리 결과를 확인하지 못한 요청이 있습니다. 같은 요청으로 결과를 확인하며 새 변경을 보내지 않습니다.",
              "Some requests have no confirmed result. The original request is checked; nothing new is sent.",
            )}
          </p>
          {pending.map((p) => (
            <div key={p.topic + p.action} className="flex flex-wrap gap-2">
              <button type="button" className={secondaryClass} disabled={!!busy} onClick={() => void confirm(p)}>
                {c("결과 확인", "Confirm result")} · {p.action}
              </button>
              <button type="button" className={secondaryClass} disabled={!!busy} onClick={() => void discard(p)}>
                {c("이 변경 버리기", "Discard this change")}
              </button>
            </div>
          ))}
        </section>
      )}
      <section aria-labelledby="business" className="space-y-4 border-b border-border pb-8">
        <h2 id="business" className="font-medium">
          {c("사업자 정보", "Business details")}
        </h2>
        <p className="text-sm leading-6 text-muted">
          {c(
            "변경은 앞으로 만드는 주문에만 쓰입니다. 이미 만든 주문과 증빙은 당시 정보를 유지합니다. 형식 확인은 법정 증빙 효력을 판정하지 않습니다.",
            "Changes apply to future orders only. Past orders keep their copy. Format checks do not decide legal validity.",
          )}
        </p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await run("profile", "profile", {
              requestKey: crypto.randomUUID(),
              revision: billing.profile?.revision ?? null,
              ...profile,
              schemaVersion: r.profileSchemaVersion ?? "",
            });
          }}
        >
          {fields.map(([key, ko, en, auto]) => (
            <label key={key} className="block space-y-2 text-sm">
              <span>{c(ko, en)}</span>
              <input
                className={inputClass}
                autoComplete={auto}
                required
                value={shownProfile[key]}
                disabled={!!lockedProfile || !!busy || !r.profileSchemaVersion}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button className={primaryClass} disabled={!!lockedProfile || !!busy || !r.profileSchemaVersion}>
              {busy === "profile" ? c("저장 중…", "Saving…") : c("사업자 정보 저장", "Save business details")}
            </button>
          </div>
        </form>
      </section>
      <section aria-labelledby="methods" className="space-y-4 border-b border-border pb-8">
        <h2 id="methods" className="font-medium">
          {c("자동결제 카드", "Automatic-payment card")}
        </h2>
        <p className="text-sm leading-6 text-muted">
          {c(
            "결제사가 발급한 수단 식별자와 마스킹 번호만 보관합니다. 카드 번호 전체와 보안 코드는 저장하지 않습니다.",
            "Only the provider's method identifier and masked number are kept. Full card numbers and security codes are never stored.",
          )}
        </p>
        <ul className="space-y-2 text-sm">
          {billing.methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <span className="font-mono">{m.cardNumberMasked ?? c("카드 정보 없음", "No card")}</span>
              <span className="text-muted">{c(...(methodLabels[m.state] ?? [m.state, m.state]))}</span>
              {m.endReason && <span className="text-xs text-muted">{m.endReason}</span>}
              {m.state === "active" && (
                <>
                  <label className="flex min-w-48 flex-1 flex-col text-xs">
                    <span className="sr-only">{c("삭제 사유", "Removal reason")}</span>
                    <input
                      className={inputClass}
                      placeholder={c("삭제 사유", "Removal reason")}
                      value={removal}
                      onChange={(e) => setRemoval(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={!!busy || !removal.trim()}
                    onClick={() =>
                      void run("method.remove", m.id, {
                        requestKey: crypto.randomUUID(),
                        methodId: m.id,
                        revision: m.revision,
                        reason: removal.trim(),
                      })
                    }
                  >
                    {c("카드 삭제", "Remove card")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {r.billing && r.autoPayConsentVersion ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2 text-sm leading-6">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                {c(
                  `이 팀의 월 자동결제에 이 카드를 사용하는 데 동의합니다 (동의 문구 ${r.autoPayConsentVersion}). 등록만으로 결제되지 않습니다.`,
                  `I agree to use this card for the team's monthly automatic payment (consent ${r.autoPayConsentVersion}). Registering charges nothing.`,
                )}
              </span>
            </label>
            <button
              type="button"
              className={primaryClass}
              disabled={!consent || !!busy}
              onClick={async () => {
                const result = (await run("method.start", "method", {
                  requestKey: crypto.randomUUID(),
                  consentVersion: r.autoPayConsentVersion!,
                })) as { methodId: string; customerKey: string; checkout?: Parameters<typeof openBillingAuth>[0]["client"] | null } | null;
                if (!result) return;
                // A recovered start result without the client checkout cannot open the window.
                if (!result.checkout) {
                  setFailure("B2B_BILLING_PAYMENT_NOT_CONFIGURED");
                  await reload();
                  return;
                }
                const back = `${window.location.origin}/dashboard/workspaces/${workspaceId}/plan/settings`;
                // The provider's return carries no account: remember who started it.
                try { sessionStorage.setItem(registrationOwnerKey(result.methodId), scope?.userId ?? ""); } catch { /* the return then completes as before */ }
                await openBillingAuth({
                  client: result.checkout,
                  customerKey: result.customerKey,
                  successUrl: `${back}?registration=${result.methodId}`,
                  failUrl: `${back}?registration_failed=${result.methodId}`,
                }).catch((e) => setFailure(billingCode(e)));
              }}
            >
              {active.length ? c("카드 교체", "Replace card") : c("카드 등록", "Register card")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {c("자동결제 설정이 승인되지 않아 카드를 등록할 수 없습니다.", "Card registration is unavailable until automatic payment is approved.")}
          </p>
        )}
        {params.get("registration_failed") && (
          <p role="status" className="text-sm">
            {c("카드 등록을 마치지 않았습니다. 결제나 등록은 일어나지 않았습니다.", "Card registration was not completed. Nothing was charged or registered.")}
          </p>
        )}
      </section>
      <section aria-labelledby="renewal" className="space-y-4">
        <h2 id="renewal" className="font-medium">
          {c("갱신 방식과 다음 기간", "Renewal and next period")}
        </h2>
        <p className="text-sm leading-6 text-muted">
          {c(
            "방식을 바꾸는 것만으로 결제하거나 제공량을 다시 지급하지 않습니다. 이미 선구매한 다음 기간은 구매 조건을 유지하고 자동결제를 건너뜁니다. 미지정 부족분은 자동 구매하지 않습니다.",
            "Changing the mode never charges or re-grants. A prepaid next period keeps its terms and is skipped. Unspecified shortfalls are never bought automatically.",
          )}
        </p>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const automatic = plan.mode === "automatic";
            await run("renewal", "renewal", {
              requestKey: crypto.randomUUID(),
              revision: billing.renewal.revision,
              mode: plan.mode,
              methodId: automatic ? (plan.methodId ?? active[0]?.id ?? null) : null,
              extraSeats: plan.extraSeats,
              aiPacks: plan.aiPacks,
              storagePacks: plan.storagePacks,
              retainedUserIds: plan.retainedUserIds,
              ...(automatic ? { consentVersion: r.autoPayConsentVersion ?? undefined, productVersion: product?.version } : {}),
            });
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>{c("갱신 방식", "Renewal")}</span>
            <select
              className={inputClass}
              value={plan.mode}
              disabled={!!lockedPlan || !!busy}
              onChange={(e) => setPlan({ ...plan, mode: e.target.value as TeamRenewalPlan["mode"] })}
            >
              <option value="one_off">{c("한 달 단건", "One month at a time")}</option>
              <option value="automatic" disabled={!r.autoPay || !active.length}>
                {c("매월 자동결제", "Monthly automatic payment")}
              </option>
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span>{c("다음 기간 추가 이용권", "Next-period extra licences")}</span>
            <input
              className={inputClass}
              type="number"
              min={0}
              max={10000}
              placeholder={c("미지정", "Not specified")}
              value={plan.extraSeats ?? ""}
              disabled={!!lockedPlan || !!busy}
              onChange={(e) => setPlan({ ...plan, extraSeats: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
          {(["aiPacks", "storagePacks"] as const).map((key) => (
            <label key={key} className="block space-y-2 text-sm">
              <span>{key === "aiPacks" ? c("다음 기간 AI 팩", "Next-period AI packs") : c("다음 기간 저장 팩", "Next-period storage packs")}</span>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={10000}
                value={plan[key]}
                disabled={!!lockedPlan || !!busy}
                onChange={(e) => setPlan({ ...plan, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          {billing.retainedCandidates && (
            <fieldset className="space-y-2 text-sm sm:col-span-2">
              <legend>{c("다음 기간 유지 대상", "Members to keep next period")}</legend>
              <p className="text-xs text-muted">
                {c(
                  `정원 ${product ? product.base.seats + (plan.extraSeats ?? 0) : "?"}명 이하로 지정합니다. 배정은 이용권 화면에서 진행합니다.`,
                  `Up to ${product ? product.base.seats + (plan.extraSeats ?? 0) : "?"} people. Assign licences on the licences page.`,
                )}
              </p>
              {billing.retainedCandidates.map((m) => (
                <label key={m.userId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!!lockedPlan || !!busy}
                    checked={plan.retainedUserIds.includes(m.userId)}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        retainedUserIds: e.target.checked
                          ? [...plan.retainedUserIds, m.userId]
                          : plan.retainedUserIds.filter((id) => id !== m.userId),
                      })
                    }
                  />
                  <span>{m.name ?? m.email}</span>
                </label>
              ))}
            </fieldset>
          )}
          {plan.mode === "automatic" && (
            <label className="flex items-start gap-2 text-sm leading-6 sm:col-span-2">
              <input type="checkbox" checked={planConsent} onChange={(e) => setPlanConsent(e.target.checked)} />
              <span>
                {c(
                  `현재 상품 조건(${product?.version ?? "확인 불가"})으로 매월 기간 종료 전에 등록 카드로 결제하는 데 동의합니다. 상품 조건이 바뀌면 자동결제를 멈추고 다시 동의를 받습니다.`,
                  `I agree to monthly charges before each period ends under the current product (${product?.version ?? "unknown"}). A product change stops automatic payment until consent is given again.`,
                )}
              </span>
            </label>
          )}
          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button className={primaryClass} disabled={!!lockedPlan || !!busy || (plan.mode === "automatic" && (!planConsent || plan.extraSeats === null))}>
              {c("갱신 설정 저장", "Save renewal")}
            </button>
            {billing.renewal.mode === "automatic" && (
              <button
                type="button"
                className={secondaryClass}
                disabled={!!busy}
                onClick={() => void run("renewal.stop", "stop", { requestKey: crypto.randomUUID() })}
              >
                {c("자동결제 중지", "Stop automatic payment")}
              </button>
            )}
          </div>
        </form>
        {billing.renewal.mode === "automatic" && billing.renewal.firstChargeAt && (
          <p role="status" className="text-sm leading-6">
            {billing.renewal.upcomingSkipped
              ? c(
                  `결제 직전에 동의해 이번 기간은 자동결제하지 않습니다. 이번 기간을 이어 쓰려면 한 번 직접 구매해 주세요. 자동결제는 그다음 기간(${kst(billing.renewal.firstChargeAt)} 이후)부터 시작합니다.`,
                  `You consented too close to the charge, so this period is not charged automatically. Buy it once yourself to continue; automatic payment starts with the following period (after ${kst(billing.renewal.firstChargeAt)}).`,
                )
              : c(`첫 자동결제는 ${kst(billing.renewal.firstChargeAt)} 이후에 진행됩니다.`, `The first automatic charge happens after ${kst(billing.renewal.firstChargeAt)}.`)}
          </p>
        )}
        {billing.renewal.pausedReason && (
          <p role="status" className="text-sm">
            {c("자동결제가 멈춘 이유", "Automatic payment paused")}: {c(...(reasons[billing.renewal.pausedReason] ?? [billing.renewal.pausedReason, billing.renewal.pausedReason]))}
          </p>
        )}
        {billing.runs.length > 0 && (
          <ul className="space-y-2 text-sm">
            {billing.runs.map((run) => (
              <li key={run.id} className="rounded-md border border-border p-3">
                {c(...(runLabels[run.state] ?? [run.state, run.state]))} · {c("시도", "Attempts")} {run.attempts}
                {run.nextAttemptAt && ` · ${c("다음 시도", "Next")} ${kst(run.nextAttemptAt)}`}
                {run.stopReason && ` · ${c(...(reasons[run.stopReason] ?? [run.stopReason, run.stopReason]))}`}
              </li>
            ))}
          </ul>
        )}
      </section>
    </TeamShell>
  );
}
