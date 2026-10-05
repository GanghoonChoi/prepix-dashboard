"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  b2bService,
  type B2bStatus,
  type CreateTeamQuote,
  type QuoteTarget,
  type TeamCommerce,
  type TeamQuote,
} from "@/lib/api/services/b2b.service";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, definitivelyRejected, errorCode, useCopy } from "./shared";
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
}: {
  workspaceId: string;
  status: Extract<B2bStatus, { enrolled: true }>;
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
  const [quantities, setQuantities] = useState({
    extraSeats: "0",
    aiPacks: "0",
    storagePacks: "0",
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
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {c(
          "현재 팀 상품 판매가 열리지 않았습니다. 상품과 제공량 설정이 확인된 뒤 구매할 수 있습니다.",
          "Team sales are not open yet. Purchasing becomes available after the product and allowance settings are verified.",
        )}
      </p>
    );
  const product =
    target === "current" && catalogue.currentPeriod
      ? catalogue.currentPeriod.product
      : catalogue.product;
  const active = status.team.currentState === "active";
  const validScope =
    target === "current" || target === "next"
      ? active &&
        !!catalogue.currentPeriod &&
        !(target === "next" && catalogue.nextPurchased)
      : target === "initial"
        ? !status.team.periodEndsAt
        : ["read_only", "recovery", "deletion_due"].includes(
            status.team.currentState,
          );
  const frozen = busy || !!pending.current;
  return (
    <div className="space-y-6">
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted">{product.name}</dt>
          <dd className="mt-1">
            {c("기본 편집 정원", "Included editing capacity")}{" "}
            {number(product.base.seats)}
            {c("명", " people")}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("공동 AI 기본량", "Included shared AI")}
          </dt>
          <dd className="mt-1">
            {number(product.base.aiUnits)} {product.aiUnitLabel}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("기본 저장 용량", "Included storage")}
          </dt>
          <dd className="mt-1">{number(product.base.storageBytes / 1e9)} GB</dd>
        </div>
        <div>
          <dt className="text-muted">
            {c("기본 전송 제공량", "Included transfer")}
          </dt>
          <dd className="mt-1">
            {number(product.base.transferBytes / 1e9)} GB
          </dd>
        </div>
      </dl>
      <p className="text-xs leading-5 text-muted">
        {product.aiUnitDescription}
      </p>
      <form
        className="space-y-5"
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
            aiPacks: Number(quantities.aiPacks),
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
            if (definitivelyRejected(e)) pending.current = null;
            setError(errorCode(e));
          } finally {
            setBusy(false);
          }
        }}
      >
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
        <div className="grid gap-4 sm:grid-cols-3">
          {(["extraSeats", "aiPacks", "storagePacks"] as const).map((key) => (
            <label key={key} className="block space-y-2 text-sm">
              <span>
                {key === "extraSeats"
                  ? c("추가 편집 이용권", "Extra editing licences")
                  : key === "aiPacks"
                    ? c("추가 AI 팩", "Extra AI packs")
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
            <option value="one_off">{c("한 달 단건", "One month")}</option>
            <option value="automatic">
              {c("매월 자동갱신", "Monthly renewal")}
            </option>
          </select>
        </label>
        <p className="text-xs leading-5 text-muted">
          {c(
            "방식 변경과 견적 확인만으로 결제되거나 제공량이 지급되지 않습니다. 추가 이용권 요금과 해당 AI 제공량은 현재 기간의 남은 시간으로 함께 계산합니다.",
            "Changing the mode or checking a quote does not charge you or grant allowances. Extra licence fees and their AI use the same remaining-period fraction.",
          )}
        </p>
        {!validScope && (
          <p role="status" className="text-sm text-muted">
            {c(
              "현재 구매 기간을 다시 확인해야 합니다. 다음 기간을 이미 선구매했다면 같은 기간을 다시 구매하지 않습니다.",
              "The purchased period must be checked again. An already prepurchased period cannot be purchased again.",
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
      </form>
      {quote && (
        <section
          aria-label={c("확인한 견적", "Quoted purchase")}
          className="space-y-4 border-t border-border pt-6"
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            {(["supplyKrw", "vatKrw", "totalKrw"] as const).map((key) => (
              <div key={key}>
                <dt className="text-muted">
                  {key === "supplyKrw"
                    ? c("공급가액", "Supply")
                    : key === "vatKrw"
                      ? c("부가세", "VAT")
                      : c("결제 합계", "Total")}
                </dt>
                <dd className="mt-1 tabular-nums">
                  {number(quote.amounts[key])}
                  {c("원", " KRW")}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-6">
            {quote.period.startsAt && quote.period.endsAt
              ? `${instant(quote.period.startsAt)} — ${instant(quote.period.endsAt)}`
              : c(
                  "실제 서비스 이용이 가능해지는 시점부터 새 한 달을 시작합니다.",
                  "A new month starts when service actually becomes available.",
                )}
          </p>
          <p className="text-sm leading-6">
            {c(
              quote.target === "current" ? "추가 편집 정원" : "편집 정원",
              quote.target === "current"
                ? "Added editing capacity"
                : "Editing capacity",
            )}{" "}
            {number(quote.allowances.seats)}
            {c("명", " people")} ·{" "}
            {c("기본 및 이용권 AI", "Base and licence AI")}{" "}
            {number(quote.allowances.periodAiUnits)}{" "}
            {quote.conditions.aiUnitLabel} · {c("별도 AI 팩", "Extra AI packs")}{" "}
            {number(quote.allowances.extraAiUnits)}{" "}
            {quote.conditions.aiUnitLabel}
          </p>
          <p className="text-xs text-muted">
            {c("견적 유효 시각", "Quote expires")} {instant(quote.expiresAt)} ·{" "}
            {c("상품 조건", "Product conditions")} {quote.productVersion}
          </p>
          <p role="status" className="text-sm leading-6 text-muted">
            {c(
              "견적을 확인했습니다. 결제와 수납 확인 연결이 준비되면 이 조건으로 구매할 수 있습니다.",
              "Your quote is saved. Purchasing becomes available when checkout and payment verification are ready.",
            )}
          </p>
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
