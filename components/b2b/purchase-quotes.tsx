"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  b2bService,
  type B2bStatus,
  type CreateTeamQuote,
  type QuoteTarget,
  type TeamCommerce,
  type TeamQuote,
} from "@/lib/api/services/b2b.service";
import {
  Details,
  inputClass,
  KeyValues,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";
import { runRecord, type BillingRecord } from "@/lib/b2b-billing/operations";
import {
  BillingError,
  billingCode,
  openPaymentWindow,
  type useTeamBilling,
} from "./billing-shared";
const number = (value: number) => new Intl.NumberFormat("ko-KR").format(value);
const instant = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export function PurchaseQuotes({
  workspaceId,
  status,
  billing,
}: {
  workspaceId: string;
  status: Extract<B2bStatus, { enrolled: true }>;
  billing?: ReturnType<typeof useTeamBilling>;
}) {
  const c = useCopy();
  const [catalogue, setCatalogue] = useState<TeamCommerce | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<TeamQuote | null>(null);
  const [target, setTarget] = useState<QuoteTarget>(
    status.team.currentState === "active"
      ? "current"
      : status.team.periodEndsAt
        ? "restore"
        : "initial",
  );
  const [renewal, setRenewal] = useState<"one_off" | "automatic">("one_off");
  // A seat carries the person's app editing and AI limits, like a personal
  // plan: nothing to buy but seats and storage (no AI packs).
  const [quantities, setQuantities] = useState(() => {
    // /start hands over the seat count it showed; the quote is still the price.
    const asked =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("extraSeats");
    return {
      extraSeats: asked && /^\d{1,4}$/.test(asked) ? asked : "0",
      storagePacks: "0",
    };
  });
  const pending = useRef<CreateTeamQuote | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const call = ++sequence.current;
    try {
      const next = await b2bService.commerce(workspaceId);
      if (call === sequence.current) {
        setCatalogue(next);
        setError("");
      }
    } catch (e) {
      if (call === sequence.current) {
        setCatalogue(null);
        setError(errorCode(e));
      }
    }
  }, [workspaceId]);
  useEffect(() => {
    const serial = sequence;
    const first = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(first);
      serial.current++;
    };
  }, [load]);
  if (!catalogue)
    return error ? (
      <B2bError code={error} retry={() => void load()} />
    ) : (
      <TeamLoading />
    );
  if (!catalogue.configured)
    return (
      <p className="text-[13px] text-muted">
        {c("팀 상품 판매가 아직 열리지 않았습니다.", "Team sales are not open yet.")}
      </p>
    );
  // A period bought under older terms has no product on sale:
  // nothing more can be added to it (the next month uses the current product).
  const pooled =
    target === "current" &&
    !!catalogue.currentPeriod &&
    !catalogue.currentPeriod.product;
  const product =
    (target === "current" && catalogue.currentPeriod?.product) ||
    catalogue.product;
  const active = status.team.currentState === "active";
  const validScope =
    target === "current" || target === "next"
      ? active &&
        !!catalogue.currentPeriod &&
        !pooled &&
        !(target === "next" && catalogue.nextPurchased)
      : target === "initial"
        ? !status.team.periodEndsAt
        : ["read_only", "recovery", "deletion_due"].includes(
            status.team.currentState,
          );
  const frozen = busy || !!pending.current;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">{product.name}</p>
        <KeyValues
          items={[
            [
              c("기본 편집 정원", "Included editing capacity"),
              `${number(product.base.seats)}${c("명", " people")}`,
            ],
            [
              c("좌석 하나", "Each seat"),
              c(
                "개인 요금제와 같은 앱 편집·AI 한도 포함",
                "includes app editing and AI limits like a personal plan",
              ),
            ],
            [
              c("기본 저장 용량", "Included storage"),
              `${number(product.base.storageBytes / 1e9)} GB`,
            ],
            [
              c("기본 전송 제공량", "Included transfer"),
              `${number(product.base.transferBytes / 1e9)} GB`,
            ],
          ]}
        />
      </div>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          pending.current ??= {
            requestKey: crypto.randomUUID(),
            productVersion: product.version,
            target,
            renewal,
            extraSeats: Number(quantities.extraSeats),
            aiPacks: 0,
            storagePacks: Number(quantities.storagePacks),
            ...(target === "current" || target === "next"
              ? { sourcePeriodId: catalogue.currentPeriod?.id }
              : {}),
          };
          try {
            const result = await b2bService.purchaseQuote(
              workspaceId,
              pending.current,
            );
            setQuote(result.quote);
            pending.current = null;
          } catch (e) {
            if (freeIntent(pending.current, e)) pending.current = null;
            setError(errorCode(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-2 text-sm">
            <span>{c("구매 대상", "Purchase period")}</span>
            <select
              className={inputClass}
              value={target}
              disabled={frozen}
              onChange={(e) => {
                setTarget(e.target.value as QuoteTarget);
                setQuote(null);
              }}
            >
              {!status.team.periodEndsAt ? (
                <option value="initial">{c("첫 한 달", "First month")}</option>
              ) : active ? (
                <>
                  <option value="current">
                    {c("현재 기간에 추가", "Add to current period")}
                  </option>
                  <option value="next" disabled={catalogue.nextPurchased}>
                    {c("다음 한 달 선구매", "Prepurchase next month")}
                  </option>
                </>
              ) : (
                <option value="restore">
                  {c("복구 후 새 한 달", "New month after restoration")}
                </option>
              )}
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span>{c("갱신 방식", "Renewal")}</span>
            <select
              className={inputClass}
              value={renewal}
              disabled={frozen}
              onChange={(e) => {
                setRenewal(e.target.value as "one_off" | "automatic");
                setQuote(null);
              }}
            >
              <option value="one_off">{c("한 달 단건", "One month at a time")}</option>
              <option value="automatic">
                {c("매월 자동결제", "Monthly automatic payment")}
              </option>
            </select>
          </label>
          {(["extraSeats", "storagePacks"] as const).map((key) => (
            <label key={key} className="block space-y-2 text-sm">
              <span>
                {key === "extraSeats"
                  ? c("추가 편집 이용권", "Extra editing licences")
                  : c("저장 추가 팩", "Extra storage packs")}
              </span>
              <input
                className={inputClass}
                type="number"
                min={0}
                max={10000}
                step={1}
                required
                value={quantities[key]}
                disabled={frozen}
                onChange={(e) => {
                  setQuantities({ ...quantities, [key]: e.target.value });
                  setQuote(null);
                }}
              />
            </label>
          ))}
        </div>
        {pooled && (
          <p role="status" className="text-sm text-muted">
            {c(
              "이 기간은 예전 조건으로 구매해 더 추가할 수 없습니다. 다음 한 달은 현재 상품으로 구매합니다.",
              "This period was bought under older terms, so nothing more can be added. The next month uses the current product.",
            )}
          </p>
        )}
        {!validScope && !pooled && (
          <p role="status" className="text-sm text-muted">
            {c(
              "이 기간은 지금 구매할 수 없습니다. 이미 선구매한 기간은 다시 구매하지 않습니다.",
              "This period cannot be bought now. An already prepurchased period is not bought again.",
            )}
          </p>
        )}
        {error && (
          <B2bError
            code={error}
            retry={!pending.current ? () => void load() : undefined}
          />
        )}
        {!!pending.current && !busy && (
          <p role="status" className="text-sm text-muted">
            {c(
              "처리 결과를 확인하지 못했습니다. 같은 입력과 요청으로 견적을 다시 확인합니다.",
              "The outcome is unknown. Retry the same quote request.",
            )}
          </p>
        )}
        <button
          className={primaryClass}
          disabled={busy || (!pending.current && !validScope)}
        >
          {c(
            busy
              ? "견적 확인 중…"
              : pending.current
                ? "같은 견적 다시 확인"
                : "견적 확인",
            busy
              ? "Checking quote…"
              : pending.current
                ? "Check the same quote"
                : "Check quote",
          )}
        </button>
        <Details>
          {c(
            "견적 확인만으로는 결제되거나 제공량이 지급되지 않습니다. 현재 기간에 더하는 이용권은 남은 기간만큼만 계산합니다.",
            "Checking a quote charges nothing and grants nothing. Licences added to the current period are priced for the time left.",
          )}
        </Details>
      </form>
      {quote && (
        <section
          aria-label={c("확인한 견적", "Quoted purchase")}
          className="space-y-4 border-t border-border pt-6"
        >
          <KeyValues
            items={[
              [
                c("기간", "Period"),
                quote.period.startsAt && quote.period.endsAt
                  ? `${instant(quote.period.startsAt)} — ${instant(quote.period.endsAt)}`
                  : c(
                      "이용이 가능해지는 시점부터 한 달",
                      "One month from when service becomes available",
                    ),
              ],
              [
                c(
                  quote.target === "current" ? "추가 편집 정원" : "편집 정원",
                  quote.target === "current"
                    ? "Added editing capacity"
                    : "Editing capacity",
                ),
                `${number(quote.allowances.seats)}${c("명", " people")} · ${c(
                  "좌석마다 개인 요금제와 같은 앱 편집·AI 한도 포함",
                  "each seat includes app editing and AI limits like a personal plan",
                )}`,
              ],
              ...(["supplyKrw", "vatKrw", "totalKrw"] as const).map(
                (key): [string, string] => [
                  key === "supplyKrw"
                    ? c("공급가액", "Supply")
                    : key === "vatKrw"
                      ? c("부가세", "VAT")
                      : c("결제 합계", "Total"),
                  `${number(quote.amounts[key])}${c("원", " KRW")}`,
                ],
              ),
              [c("견적 유효 시각", "Quote expires"), instant(quote.expiresAt)],
            ]}
          />
          {catalogue.checkoutReady && billing && quote.renewal === "one_off" ? (
            <Checkout workspaceId={workspaceId} quoteId={quote.id} total={quote.amounts.totalKrw} billing={billing} />
          ) : (
            <p role="status" className="text-[13px] leading-5 text-muted">
              {quote.renewal === "automatic" ? (
                // Renewal is set up in one place; the quote only points there.
                <>
                  {c(
                    "매월 자동결제는 결제 정보에서 설정합니다. 이 견적은 결제하지 않습니다.",
                    "Monthly automatic payment is set up in billing details. This quote is not charged.",
                  )}{" "}
                  <Link
                    className="text-foreground underline underline-offset-4"
                    href={`/dashboard/workspaces/${workspaceId}/plan/settings`}
                  >
                    {c("결제 정보로 이동", "Open billing details")}
                  </Link>
                </>
              ) : (
                c(
                  "견적을 확인했습니다. 결제가 준비되면 이 조건으로 구매할 수 있습니다.",
                  "Your quote is saved. You can buy it once checkout is ready.",
                )
              )}
            </p>
          )}
          <button
            type="button"
            className={secondaryClass}
            onClick={() => setQuote(null)}
          >
            {c("조건 다시 확인", "Review selections")}
          </button>
        </section>
      )}
    </div>
  );
}

/** Order from the saved quote with the confirmed business copy, then open the
 * provider's window. The order request is stored before it is sent. */
function Checkout({
  workspaceId,
  quoteId,
  total,
  billing,
}: {
  workspaceId: string;
  quoteId: string;
  total: number;
  billing: ReturnType<typeof useTeamBilling>;
}) {
  const c = useCopy();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [pending, setPending] = useState<BillingRecord | null>(null);
  const [method, setMethod] = useState<"카드" | "계좌이체">("카드");
  const { scope, api, store } = billing;
  const profile = billing.billing?.profile;
  useEffect(() => {
    if (!scope) return;
    let live = true;
    void store
      .get({ scope, action: "order", topic: quoteId })
      .then((r) => live && setPending(r))
      .catch((e) => live && setFailure(billingCode(e)));
    return () => {
      live = false;
    };
  }, [scope, store, quoteId]);
  if (!profile)
    return (
      <p role="status" className="text-[13px] leading-5">
        {c("결제 전에 사업자 정보를 저장해 주세요.", "Save business details before paying.")}{" "}
        <Link className="underline underline-offset-4" href={`/dashboard/workspaces/${workspaceId}/plan/settings`}>
          {c("결제 정보로 이동", "Open billing details")}
        </Link>
      </p>
    );
  const buyer = {
    schemaVersion: profile.schemaVersion,
    businessName: profile.businessName,
    businessRegistrationNumber: profile.businessRegistrationNumber,
    representative: profile.representative,
    address: profile.address,
    receiptEmail: profile.receiptEmail,
  };
  const pay = async () => {
    if (!api || !scope || busy) return;
    setBusy(true);
    setFailure("");
    try {
      const record: BillingRecord<"order"> = (pending as BillingRecord<"order"> | null) ?? {
        schema: 1,
        scope,
        action: "order",
        topic: quoteId,
        attempts: 0,
        input: { requestKey: crypto.randomUUID(), quoteId, buyer },
      };
      const created = (await runRecord(record, api, store)) as { orderId: string };
      setPending(null);
      const checkout = await api.checkout(created.orderId);
      const back = `${window.location.origin}/dashboard/workspaces/${workspaceId}/plan/orders/${created.orderId}`;
      if (!checkout.methods.includes(method)) throw new Error("B2B_PAYMENT_NOT_CONFIGURED");
      await openPaymentWindow({
        client: checkout.client,
        orderId: checkout.providerOrderId,
        orderName: checkout.orderName,
        amount: checkout.amount,
        method,
        successUrl: `${back}?pg=success`,
        failUrl: `${back}?pg=fail`,
        intent: { scope, orderId: created.orderId, providerOrderId: checkout.providerOrderId, amount: checkout.amount },
      });
    } catch (e) {
      setFailure(billingCode(e));
      setPending(await store.get({ scope, action: "order", topic: quoteId }).catch(() => null));
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-muted">
        {c("구매자", "Buyer")} {buyer.businessName} ·{" "}
        {buyer.businessRegistrationNumber.replace(/^(\d{3})(\d{2})(\d{5})$/, "$1-$2-$3")} ·{" "}
        {c("증빙", "Receipt")} {buyer.receiptEmail}
      </p>
      {failure && <BillingError code={failure} />}
      {pending && !busy && (
        <p role="status" className="text-[13px] leading-5">
          {c("주문 생성 결과를 확인하지 못했습니다. 같은 주문 요청으로 결과를 확인합니다.", "The order result is unknown. The same order request is checked.")}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block space-y-2 text-sm">
          <span>{c("결제 수단", "Method")}</span>
          <select className={inputClass} value={method} disabled={busy} onChange={(e) => setMethod(e.target.value as "카드" | "계좌이체")}>
            <option value="카드">{c("카드", "Card")}</option>
            <option value="계좌이체">{c("계좌이체", "Bank transfer")}</option>
          </select>
        </label>
        <button type="button" className={primaryClass} disabled={busy} onClick={() => void pay()}>
          {busy ? c("결제 준비 중…", "Preparing payment…") : pending ? c("같은 주문 결과 확인", "Confirm the same order") : `${c("결제하기", "Pay")} · ${new Intl.NumberFormat("ko-KR").format(total)}${c("원", " KRW")}`}
        </button>
      </div>
    </div>
  );
}
