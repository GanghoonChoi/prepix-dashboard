"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard } from "lucide-react";
import {
  b2bService,
  type TeamBuyer,
  type TeamCommerce,
  type TeamOrder,
} from "@/lib/api/services/b2b.service";
import { inputClass, primaryClass, TeamLoading } from "@/components/workspaces/shared";
import { billingCode, BillingError, openBillingAuth, won, type useTeamBilling } from "./billing-shared";
import { useCopy } from "./shared";

type Product = Extract<TeamCommerce, { configured: true }>["product"];
type Intent = { userId: string; extraSeats: number; returnTo: string | null };
const intentKey = (methodId: string) => `prepix:team-checkout:${methodId}`;
const settled: TeamOrder["state"][] = ["applied", "canceled", "expired", "review_required"];
const fields: [keyof Omit<TeamBuyer, "schemaVersion">, string, string, string][] = [
  ["businessName", "상호", "Business name", "organization"],
  ["businessRegistrationNumber", "사업자등록번호", "Registration number", "off"],
  ["representative", "대표자", "Representative", "name"],
  ["address", "사업장 주소", "Business address", "street-address"],
  ["receiptEmail", "증빙 수신 이메일", "Receipt email", "email"],
];
/** Only back into onboarding; anything else stays on the plan page. */
const safeReturn = (value: string | null) => (value && /^\/start(\?|$)/.test(value) ? value : null);

/**
 * Business, the way a subscription is bought (2026-10-08): business details,
 * one card in Toss's window, and the first month is charged to it at once.
 * Every month after renews automatically for the members (all but viewers).
 * The live Toss keys are a billing MID, so there is no one-off payment window.
 */
export function BusinessCheckout({
  workspaceId,
  target,
  billing,
}: {
  workspaceId: string;
  target: "initial" | "restore";
  billing: ReturnType<typeof useTeamBilling>;
}) {
  const c = useCopy();
  const params = useSearchParams();
  const { api, scope, billing: view, reload } = billing;
  const [product, setProduct] = useState<Product | null>(null);
  const [wanted, setWanted] = useState<number | null>(null);
  const [draft, setDraft] = useState<Omit<TeamBuyer, "schemaVersion">>({
    businessName: "",
    businessRegistrationNumber: "",
    representative: "",
    address: "",
    receiptEmail: "",
  });
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"" | "card" | "charging" | "applying">("");
  const [error, setError] = useState("");
  // A lost reply is retried with the same quote and key: never a second order.
  const charge = useRef<{ quoteId: string; requestKey: string } | null>(null);
  const resumed = useRef(false);
  const returnTo = useRef(safeReturn(params.get("return")));

  useEffect(() => {
    if (!api) return;
    let live = true;
    void Promise.all([
      api.commerce(),
      b2bService.members(workspaceId).catch(() => null),
      b2bService.invitations(workspaceId).catch(() => null),
    ])
      .then(([commerce, roster, invitations]) => {
        if (!live) return;
        setProduct(commerce.configured ? commerce.product : null);
        // Everyone but viewers holds a seat, invitations waiting for payment included.
        const members = roster ? roster.people.filter((p) => p.role !== "reviewer" && !p.suspendedAt).length : 1;
        const invited = (invitations?.invitations ?? []).filter(
          (i) => !i.acceptedAt && !i.revokedAt && !i.projectId && i.assignSeat,
        ).length;
        setWanted(Math.max(1, members) + invited);
      })
      .catch((e) => live && setError(billingCode(e)));
    return () => {
      live = false;
    };
  }, [api, workspaceId]);

  const seats = product && wanted !== null ? Math.max(product.base.seats, wanted) : 0;
  const extraSeats = product ? seats - product.base.seats : 0;

  const finish = async (methodId: string, extra: number) => {
    if (!api || !product) return;
    setStep("charging");
    setError("");
    try {
      if (!charge.current) {
        const current = await api.overview();
        const consentVersion = current.readiness.autoPayConsentVersion ?? "";
        await api.changeRenewal({
          requestKey: crypto.randomUUID(),
          revision: current.renewal.revision,
          mode: "automatic",
          methodId,
          extraSeats: extra,
          aiPacks: 0,
          storagePacks: 0,
          retainedUserIds: [],
          consentVersion,
          productVersion: product.version,
        });
        await reload();
        const { quote } = await b2bService.purchaseQuote(workspaceId, {
          requestKey: crypto.randomUUID(),
          productVersion: product.version,
          target,
          renewal: "automatic",
          extraSeats: extra,
          aiPacks: 0,
          storagePacks: 0,
        });
        charge.current = { quoteId: quote.id, requestKey: crypto.randomUUID() };
      }
      let { order } = await api.charge(charge.current);
      setStep("applying");
      // The server applies a paid month within seconds.
      for (let i = 0; i < 40 && !settled.includes(order.state); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        order = (await api.order(order.id)).order;
      }
      if (order.state !== "applied") {
        charge.current = null;
        setStep("");
        setError(order.state === "canceled" ? "B2B_SEAT_CHARGE_DECLINED" : "B2B_SEAT_CHARGE_PENDING");
        return;
      }
      window.dispatchEvent(new Event("workspaces:changed"));
      if (returnTo.current) window.location.assign(returnTo.current);
      else void reload();
    } catch (e) {
      setStep("");
      setError(billingCode(e));
    }
  };

  // Back from Toss's card window: the server issues the key, then the month
  // that was asked for before leaving is charged without another click.
  const registration = params.get("registration");
  useEffect(() => {
    const authKey = params.get("authKey"),
      customerKey = params.get("customerKey");
    if (!api || !scope || !product || !registration || !authKey || !customerKey || resumed.current) return;
    resumed.current = true;
    let intent: Intent | null = null;
    try {
      intent = JSON.parse(sessionStorage.getItem(intentKey(registration)) ?? "null");
    } catch {}
    void (async () => {
      setStep("card");
      try {
        const done = await api.completeMethod(registration, { requestKey: `complete-${registration}`, customerKey, authKey });
        window.history.replaceState(null, "", window.location.pathname);
        if (done.method.state !== "active") {
          setStep("");
          setError("B2B_CARD_NOT_REGISTERED");
          return;
        }
        try {
          sessionStorage.removeItem(intentKey(registration));
        } catch {}
        await reload();
        if (intent?.userId !== scope.userId) return setStep("");
        returnTo.current = safeReturn(intent.returnTo);
        await finish(done.method.id, intent.extraSeats);
      } catch (e) {
        setStep("");
        setError(billingCode(e));
      }
    })();
    // finish() is rebuilt each render from the same values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, scope, product, registration, params]);

  if (!view || (!product && !error)) return <TeamLoading />;
  if (!product) return <BillingError code={error} />;
  const readiness = view.readiness;
  const card = view.methods.find((m) => m.state === "active");
  const saved = view.profile;
  // Back from Toss with the key still in the address: the return is completing.
  const busy = !!step || !!params.get("authKey");
  // Consent is on record once the renewal was saved (e.g. a retry after Toss).
  const consented = consent || view.renewal.mode === "automatic";
  const supply = product.base.supplyKrw + product.extraSeat.supplyKrw * extraSeats;
  const vat = Math.round((supply * product.settlement.vatBasisPoints) / 10000);
  const total = supply + vat;

  const pay = async () => {
    if (!api || !scope || busy) return;
    setError("");
    try {
      if (!saved) {
        setStep("card");
        await api.changeProfile({
          requestKey: crypto.randomUUID(),
          revision: null,
          schemaVersion: readiness.profileSchemaVersion ?? "",
          ...draft,
        });
        await reload();
      }
      if (card) return await finish(card.id, extraSeats);
      setStep("card");
      const start = await api.startMethod({
        requestKey: crypto.randomUUID(),
        consentVersion: readiness.autoPayConsentVersion ?? "",
      });
      const intent: Intent = { userId: scope.userId, extraSeats, returnTo: returnTo.current };
      try {
        sessionStorage.setItem(intentKey(start.methodId), JSON.stringify(intent));
      } catch {}
      const back = `${window.location.origin}/dashboard/workspaces/${workspaceId}/plan`;
      await openBillingAuth({
        client: start.checkout,
        customerKey: start.customerKey,
        successUrl: `${back}?registration=${start.methodId}`,
        failUrl: `${back}?registration_failed=${start.methodId}`,
      });
    } catch (e) {
      setStep("");
      setError(billingCode(e));
    }
  };

  const progress = {
    card: c("카드를 확인하는 중…", "Checking the card…"),
    charging: c("결제하는 중…", "Paying…"),
    applying: c("팀을 여는 중…", "Opening the team…"),
  };
  return (
    <div className="space-y-4" data-testid="business-checkout">
      <dl className="divide-y divide-border rounded-xl border border-border text-sm tabular-nums">
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="font-medium">{product.name}</dt>
          <dd className="text-[13px] text-muted">
            {c(
              `1석 월 ${won(product.extraSeat.supplyKrw)} · VAT 별도 · ${product.base.seats}석부터`,
              `${won(product.extraSeat.supplyKrw)}/seat/mo · excl. VAT · from ${product.base.seats} seats`,
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">{c("좌석", "Seats")}</dt>
          <dd>
            {c(`${seats}석`, `${seats} seats`)}
            <span className="ml-2 text-[13px] text-muted">
              {c(`멤버 ${wanted ?? 1}명 · 뷰어 무료`, `${wanted ?? 1} members · viewers free`)}
            </span>
          </dd>
        </div>
        <div className="flex justify-between gap-4 px-4 py-3">
          <dt className="text-muted">{c("공급가 · 부가세", "Supply · VAT")}</dt>
          <dd>
            {won(supply)} · {won(vat)}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="font-medium">{c("월 결제액", "Per month")}</dt>
          <dd className="text-lg font-semibold">{won(total)}</dd>
        </div>
      </dl>

      {saved ? (
        <p className="text-[13px] leading-5 text-muted">
          {c("증빙", "Receipts")} · {saved.businessName} ·{" "}
          {saved.businessRegistrationNumber.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")} · {saved.receiptEmail}
        </p>
      ) : (
        <fieldset className="grid gap-3 sm:grid-cols-2" disabled={busy}>
          <legend className="mb-2 text-sm font-medium">{c("사업자 정보", "Business details")}</legend>
          {fields.map(([key, ko, en, auto]) => (
            <label key={key} className={`block space-y-1.5 text-[13px] ${key === "address" ? "sm:col-span-2" : ""}`}>
              <span>{c(ko, en)}</span>
              <input
                className={inputClass}
                autoComplete={auto}
                required
                inputMode={key === "businessRegistrationNumber" ? "numeric" : undefined}
                placeholder={key === "businessRegistrationNumber" ? "000-00-00000" : undefined}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </label>
          ))}
        </fieldset>
      )}

      <label className="flex items-start gap-2 text-[13px] leading-5">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={consented}
          disabled={busy || view.renewal.mode === "automatic"}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {c(
            `매월 결제일에 등록한 카드로, 뷰어를 뺀 멤버 수만큼 자동결제하는 데 동의합니다. 플랜에서 언제든 해지할 수 있습니다. (동의 ${readiness.autoPayConsentVersion ?? "-"})`,
            `I agree to monthly automatic charges to this card for every member but viewers. Cancel any time on the plan page. (consent ${readiness.autoPayConsentVersion ?? "-"})`,
          )}
        </span>
      </label>

      {error && <BillingError code={error} />}
      {params.get("registration_failed") && !error && (
        <p role="status" className="text-[13px] text-muted">
          {c("카드 등록을 마치지 않았습니다. 결제되지 않았습니다.", "Card registration was not finished. Nothing was charged.")}
        </p>
      )}
      {!readiness.autoPay && (
        <p role="status" className="text-[13px] text-muted">
          {c("팀 결제가 아직 열리지 않았습니다.", "Team payments are not open yet.")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={primaryClass}
          disabled={busy || !consented || !readiness.autoPay || (!saved && Object.values(draft).some((v) => !v.trim()))}
          onClick={() => void pay()}
        >
          {busy ? (
            progress[step as keyof typeof progress]
          ) : (
            <>
              <CreditCard size={16} strokeWidth={1.75} aria-hidden="true" />
              {card
                ? c(`${won(total)} 결제`, `Pay ${won(total)}`)
                : c(`카드 등록하고 ${won(total)} 결제`, `Add card and pay ${won(total)}`)}
            </>
          )}
        </button>
        {card && !busy && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
            <Check size={14} strokeWidth={2} aria-hidden="true" />
            {card.cardNumberMasked}
          </span>
        )}
      </div>
    </div>
  );
}
