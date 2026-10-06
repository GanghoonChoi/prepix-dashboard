"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { statementService } from "@/lib/api/services/b2b-statements.service";
import type {
  StatementReason,
  TeamStatementMonthState,
  TeamStatementRefund,
  TeamStatementRevision,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { useI18n } from "@/lib/i18n/context";
import {
  clearPending,
  kst,
  loadPending,
  monthLabel,
  savePending,
  scopeKey,
  units,
  verifiedPdf,
  won,
  type StatementScope,
} from "@/lib/b2b-statements/statements";
import { B2bError, definitivelyRejected, errorCode, useCopy } from "./shared";

// SOT: backend/docs/b2b-monthly-statements.md (S25 / W17)
const messages: Record<string, [string, string]> = {
  B2B_STATEMENT_CALENDAR_MISSING: [
    "승인된 발행 달력 설정이 없어 새 명세와 정정본을 발행할 수 없습니다. 이미 발행된 명세는 받을 수 있습니다.",
    "No approved issue calendar is configured, so new statements and corrections cannot be issued. Issued statements remain available.",
  ],
  B2B_STATEMENT_NOT_DUE: [
    "아직 발행일이 아닙니다. 달이 끝나고 발행 기준일이 지나면 발행됩니다.",
    "Not due yet. A statement is issued after the month closes and its issue day passes.",
  ],
  B2B_STATEMENT_NOT_FOUND: [
    "이 팀에서 해당 명세를 찾을 수 없습니다.",
    "This statement is unavailable in this team.",
  ],
  B2B_STATEMENT_MONTH_INVALID: [
    "대상 월 형식이 올바르지 않습니다.",
    "The statement month is invalid.",
  ],
  B2B_STATEMENT_INTEGRITY: [
    "받은 PDF의 크기나 해시가 발행본과 다릅니다. 검증하지 못한 파일은 저장하지 않습니다.",
    "The received PDF differs from the issued size or hash. Unverified files are not saved.",
  ],
  B2B_STATEMENT_STORAGE_UNAVAILABLE: [
    "이 브라우저에 요청 기록을 저장할 수 없어 발행 요청을 보내지 않았습니다.",
    "The request could not be recorded in this browser, so it was not sent.",
  ],
};
function StatementError({ code, retry }: { code: string; retry?: () => void }) {
  const c = useCopy();
  if (!messages[code]) return <B2bError code={code} retry={retry} />;
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
    >
      <p>{c(...messages[code])}</p>
      {retry && (
        <button type="button" className={`${secondaryClass} mt-3`} onClick={retry}>
          {c("다시 확인", "Check again")}
        </button>
      )}
    </div>
  );
}

const reasonLabels: Record<StatementReason, [string, string]> = {
  initial: ["최초 발행", "First issue"],
  late_receipt: ["늦게 확인된 수납 반영", "Late payment receipt"],
  application_recorded: ["이용권·제공량 반영 결과 확정", "Application recorded"],
  status_changed: ["수납 처리 상태 변경", "Payment status changed"],
  correction_recorded: ["과납·환불 기록 변경", "Overpayment or refund changed"],
  usage_recorded: ["AI 원장 기록 변경", "AI ledger changed"],
  content_changed: ["집계 내용 정정", "Content corrected"],
};
const refundStates: Record<TeamStatementRefund["state"], [string, string]> = {
  reserved: ["환불 확인 중", "Refund being confirmed"],
  cancelling: ["환불 확인 중", "Refund being confirmed"],
  provider_unknown: ["환불 확인 중", "Refund being confirmed"],
  refunded: ["환불 완료", "Refunded"],
  rejected: ["환불 거절", "Refund rejected"],
  failed: ["환불 실패", "Refund failed"],
  review_required: ["운영 확인 중", "Under review"],
};
const kinds = {
  base: ["기본 팀 상품", "Base team product"],
  extra_seat: ["추가 편집 이용권", "Extra editing licence"],
  ai_pack: ["추가 AI", "AI pack"],
  storage_pack: ["저장 추가", "Storage pack"],
} as const;
const targets = {
  initial: ["첫 구매", "First purchase"],
  current: ["현재 기간 추가", "Current-period add-on"],
  next: ["다음 기간 선구매", "Next-period prepurchase"],
  restore: ["종료 후 복구", "Restoration"],
} as const;
const purchaseStates = {
  applied: ["반영 완료", "Applied"],
  awaiting_application: ["수납 완료 · 반영 대기", "Paid · awaiting application"],
  review_required: ["운영 확인 중", "Under review"],
} as const;

function useScope() {
  const { data, b2b } = useWorkspace()!;
  const userId = data.currentUserId ?? "",
    workspaceId = data.workspace.id;
  const scope = useMemo<StatementScope>(
    () => ({
      origin: new URL(apiClient.defaults.baseURL!).origin,
      userId,
      workspaceId,
    }),
    [userId, workspaceId],
  );
  const allowed = !!b2b?.enrolled && b2b.allowedActions.billing;
  return { data, b2b, scope, key: scopeKey(scope), allowed };
}
/** A response is shown only for the scope it was requested in. A failure
 * clears billing data rather than leaving it or reading as an empty list. */
function usePinned<T>(key: string, enabled: boolean, fetcher: () => Promise<T>) {
  const [loaded, setLoaded] = useState<{ key: string; value: T } | null>(null);
  const [failure, setFailure] = useState<{ key: string; code: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
    const call = ++sequence.current;
    setBusy(true);
    try {
      const value = await fetcher();
      if (call !== sequence.current) return;
      setLoaded({ key, value });
      setFailure(null);
    } catch (error) {
      if (call !== sequence.current) return;
      setLoaded(null);
      setFailure({ key, code: errorCode(error) });
    } finally {
      if (call === sequence.current) setBusy(false);
    }
  }, [key, enabled, fetcher]);
  useEffect(() => {
    const calls = sequence;
    const initial = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("focus", refresh);
      calls.current++;
    };
  }, [load]);
  return {
    view: loaded?.key === key ? loaded.value : null,
    error: failure?.key === key ? failure.code : "",
    busy,
    load,
  };
}
function stateText(
  c: (ko: string, en: string) => string,
  state: TeamStatementMonthState,
  issueOn: string | null,
  revisions: number,
) {
  if (state === "issued")
    return revisions > 1
      ? c(`확정 · 정정본 ${revisions - 1}건`, `Issued · ${revisions - 1} correction(s)`)
      : c("확정", "Issued");
  if (state === "scheduled")
    return c(`발행 예정 · ${issueOn}`, `Scheduled · ${issueOn}`);
  if (state === "due") return c("발행 대기", "Awaiting issue");
  if (state === "blocked") return c("발행 설정 누락", "Issue setting missing");
  return c("집계 중", "Collecting");
}
const notTaxInvoice: [string, string] = [
  "월 이용명세서는 세금계산서가 아닙니다. 법정 세금계산서 발행은 승인된 별도 설정 전까지 제공하지 않습니다. 선결제한 AI 사용량은 청구 금액에 다시 더하지 않습니다.",
  "A monthly statement is not a tax invoice; legal tax invoices are not issued until a separate approved setting exists. Prepaid AI usage is never charged again.",
];

export function TeamStatements() {
  const c = useCopy();
  const { lang } = useI18n();
  const { data, b2b, scope, key, allowed } = useScope();
  const fetcher = useCallback(
    () => statementService.list(scope.workspaceId, scope.userId),
    [scope.workspaceId, scope.userId],
  );
  const { view, error, busy, load } = usePinned(key, allowed, fetcher);
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  if (!allowed) return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <TeamShell
      title={c("월 이용명세서", "Monthly statements")}
      description={c(
        "한국 시간 달력 월마다 구매 금액과 AI 제공량 기록을 정리합니다. 확정본과 정정본은 바뀌지 않으며 PDF로 받을 수 있습니다.",
        "Purchases and AI records per Korean calendar month. Issued and corrected versions never change and can be downloaded as PDF.",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpaceBadge workspace={data.workspace} />
        <button className={secondaryClass} disabled={busy} onClick={() => void load()}>
          {c("최신 상태 확인", "Refresh")}
        </button>
      </div>
      {error && <StatementError code={error} retry={() => void load()} />}
      {!view ? (
        !error && <TeamLoading />
      ) : (
        <>
          {!view.calendar.configured && (
            <StatementError code="B2B_STATEMENT_CALENDAR_MISSING" />
          )}
          <p className="max-w-2xl text-sm leading-6 text-muted">{c(...notTaxInvoice)}</p>
          {view.months.length === 0 ? (
            <p className="text-sm text-muted">
              {c(
                "아직 명세 대상 기록이 없습니다. 수납이나 AI 제공량 기록이 생긴 달부터 표시합니다.",
                "No statement records yet. Months appear once a payment or AI record exists.",
              )}
            </p>
          ) : (
            <ul className="divide-y divide-border border-y border-border" aria-label={c("명세 월 목록", "Statement months")}>
              {view.months.map((m) => (
                <li key={m.month}>
                  <Link
                    href={`/dashboard/workspaces/${scope.workspaceId}/statements/${m.month}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-4 hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground sm:grid-cols-[10rem_1fr_auto]"
                  >
                    <span className="font-medium">{monthLabel(m.month, lang === "ko" ? "ko" : "en")}</span>
                    <span className="text-sm text-muted sm:order-none">
                      {stateText(c, m.state, m.issueOn, m.revisions)}
                    </span>
                    <span className="col-span-2 text-sm tabular-nums text-muted sm:col-span-1 sm:text-right">
                      {m.latest
                        ? c(
                            `revision ${m.latest.revision} · ${kst(m.latest.issuedAt)} 발행`,
                            `revision ${m.latest.revision} · issued ${kst(m.latest.issuedAt)}`,
                          )
                        : m.issueOn
                          ? c(`발행 기준일 ${m.issueOn}`, `Issue day ${m.issueOn}`)
                          : "-"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </TeamShell>
  );
}

function Figures({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted">{label}</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function Snapshot({ revision }: { revision: TeamStatementRevision }) {
  const c = useCopy();
  const s = revision.snapshot;
  const pick = (pair: readonly [string, string]) => c(pair[0], pair[1]);
  return (
    <>
      <Block
        title={c("결제 금액 요약", "Payment summary")}
        description={c(
          "이 달에 수납이 승인된 원주문의 금액입니다. 환불 완료는 이 달에 결제사 취소가 확인된 금액만 셉니다.",
          "Original orders paid this month. Refunded counts only provider-confirmed cancellations this month.",
        )}
      >
        <Figures
          rows={[
            [c("공급가액", "Supply"), won(s.totals.supplyKrw)],
            [c("부가세", "VAT"), won(s.totals.vatKrw)],
            [c("합계", "Total"), won(s.totals.totalKrw)],
            [c("수납 확인", "Received"), won(s.totals.receivedKrw)],
            [c("환불 완료", "Refunded"), won(s.totals.refundedKrw)],
            [c("수납 − 환불", "Received − refunded"), won(s.totals.receivedKrw - s.totals.refundedKrw)],
          ]}
        />
        {s.byKind.length > 0 && (
          <ul className="space-y-1 text-sm tabular-nums">
            {s.byKind.map((k) => (
              <li key={k.kind} className="flex justify-between gap-4">
                <span>
                  {pick(kinds[k.kind])} × {k.quantity}
                </span>
                <span className="text-muted">
                  {c("비례 전 정가", "List")} {won(k.listSupplyKrw)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block title={c("주문별 내역", "Orders")}>
        {s.purchases.length === 0 ? (
          <p className="text-sm text-muted">{c("이 달에 수납된 주문이 없습니다.", "No orders were paid this month.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {s.purchases.map((p) => (
              <li key={p.orderId} className="space-y-1 py-3 text-sm">
                <p className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {pick(targets[p.target])} · {pick(purchaseStates[p.status])}
                  </span>
                  <span className="tabular-nums">{won(p.amounts.totalKrw)}</span>
                </p>
                <p className="text-muted tabular-nums">
                  {kst(p.paidAt)} {c("결제", "paid")} · {c("공급가액", "supply")} {won(p.amounts.supplyKrw)} · {c("부가세", "VAT")} {won(p.amounts.vatKrw)}
                </p>
                <p className="text-muted">
                  {p.lines.map((l) => `${pick(kinds[l.kind])} × ${l.quantity}`).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block
        title={c("정산과 환불", "Settlement and refunds")}
        description={c(
          "확인 중인 환불은 금액에 넣지 않습니다. 다른 달에 확인된 환불은 확인된 달의 명세에 표시합니다.",
          "Refunds being confirmed are not counted. A refund appears as money in the month its cancellation is confirmed.",
        )}
      >
        {s.adjustments.length === 0 && s.refunds.length === 0 ? (
          <p className="text-sm text-muted">{c("기록이 없습니다.", "No records.")}</p>
        ) : (
          <ul className="divide-y divide-border text-sm tabular-nums">
            {s.adjustments.map((a) => (
              <li key={`a-${a.orderId}`} className="flex flex-wrap justify-between gap-2 py-3">
                <span>{c("반영 지연 과납 차액", "Delayed-application overpayment")} · {a.state === "refunded" ? c("반환 완료", "Returned") : c("반환 대기·확인 중", "Pending")}</span>
                <span>{won(a.amountKrw)}</span>
              </li>
            ))}
            {s.refunds.map((r) => (
              <li key={r.refundId} className="flex flex-wrap justify-between gap-2 py-3">
                <span>
                  {r.kind === "overpayment" ? c("과납 반환", "Overpayment return") : c("미사용분 환불", "Unused refund")} · {pick(refundStates[r.state])}
                </span>
                <span>
                  {c("요청", "Requested")} {won(r.amounts.totalKrw)} · {c("이 달 환불 완료", "Refunded this month")} {won(r.returnedInMonthKrw)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      <Block
        title={c("AI 제공량 기록", "AI records")}
        description={c(
          "선결제한 지급 건 안의 기록이며 금액이 아닙니다. 프로젝트와 작업 내용은 포함하지 않습니다.",
          "Records within prepaid grants, not charges. Projects and job content are not included.",
        )}
      >
        {s.ai.length === 0 ? (
          <p className="text-sm text-muted">{c("이 달의 AI 원장 기록이 없습니다.", "No AI records this month.")}</p>
        ) : (
          s.ai.map((u) => (
            <div key={`${u.unitLabel}:${u.unitDescription}`} className="space-y-3">
              <p className="text-sm text-muted">
                {c("단위", "Unit")}: {u.unitLabel}
              </p>
              <Figures
                rows={[
                  [c("지급(기본)", "Granted (base)"), units(u.grantedBasic)],
                  [c("지급(추가)", "Granted (extra)"), units(u.grantedExtra)],
                  [c("예약", "Reserved"), units(u.reserved)],
                  [c("사용 확정", "Confirmed"), units(u.confirmed)],
                  [c("예약 반환", "Returned"), units(u.returned)],
                  [c("만료", "Expired"), units(u.expired)],
                  [c("환불 보류", "Withheld for refund"), units(u.revoked)],
                  [c("보류 해제", "Withholding released"), units(u.reinstated)],
                ]}
              />
            </div>
          ))
        )}
      </Block>
    </>
  );
}

export function TeamStatementMonth({ month }: { month: string }) {
  const c = useCopy();
  const { lang } = useI18n();
  const { b2b, scope, key, allowed } = useScope();
  const scopeRef = useRef(key);
  scopeRef.current = key;
  const fetcher = useCallback(
    () => statementService.detail(scope.workspaceId, month, scope.userId),
    [scope.workspaceId, scope.userId, month],
  );
  const { view, error, busy, load } = usePinned(key, allowed, fetcher);
  const [notice, setNotice] = useState<{ key: string; code: string; pending: boolean } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [downloads, setDownloads] = useState<{ key: string; id: string; state: "busy" | "verified" | string }[]>([]);

  const send = useCallback(
    async (requestKey: string) => {
      const started = key;
      setIssuing(true);
      try {
        await statementService.issue(scope.workspaceId, month, requestKey, scope.userId);
        clearPending(window.localStorage, scope, month);
        if (scopeRef.current === started) setNotice(null);
      } catch (e) {
        // A definitive refusal ends the request; anything else keeps the
        // original key so the next attempt asks the server about the same one.
        const definitive = definitivelyRejected(e);
        if (definitive) clearPending(window.localStorage, scope, month);
        if (scopeRef.current === started)
          setNotice({ key: started, code: errorCode(e), pending: !definitive });
      } finally {
        setIssuing(false);
        if (scopeRef.current === started) void load();
      }
    },
    [scope, key, month, load],
  );
  // A request stored before a reload or a lost response is re-sent with its
  // original key; the server answers with the one revision it produced.
  useEffect(() => {
    if (!allowed) return;
    let pending = null;
    try {
      pending = loadPending(window.localStorage, scope, month);
    } catch {
      return;
    }
    if (pending) void send(pending.requestKey);
  }, [scope, month, allowed, send]);
  const requestIssue = () => {
    const requestKey = crypto.randomUUID();
    try {
      savePending(window.localStorage, scope, month, requestKey);
    } catch {
      setNotice({ key, code: "B2B_STATEMENT_STORAGE_UNAVAILABLE", pending: false });
      return;
    }
    void send(requestKey);
  };
  const download = async (revision: TeamStatementRevision) => {
    const started = key;
    const mark = (state: string) =>
      setDownloads((rows) => [
        ...rows.filter((r) => r.id !== revision.id),
        { key: started, id: revision.id, state },
      ]);
    mark("busy");
    try {
      const bytes = await statementService.pdf(scope.workspaceId, revision.id, scope.userId);
      if (scopeRef.current !== started) return;
      if (!verifiedPdf(bytes, revision.pdf)) return mark("B2B_STATEMENT_INTEGRITY");
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `prepix-statement-${month}-r${revision.revision}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      mark("verified");
    } catch (e) {
      mark(errorCode(e));
    }
  };
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  if (!allowed) return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  const shownNotice = notice?.key === key ? notice : null;
  const latest = view?.revisions[0];
  return (
    <TeamShell title={c(`${monthLabel(month)} 이용명세서`, `${monthLabel(month, "en")} statement`)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/dashboard/workspaces/${scope.workspaceId}/statements`} className={secondaryClass}>
          {c("명세 목록", "All statements")}
        </Link>
        <button className={secondaryClass} disabled={busy} onClick={() => void load()}>
          {c("최신 상태 확인", "Refresh")}
        </button>
      </div>
      {error && <StatementError code={error} retry={() => void load()} />}
      {shownNotice && (
        <div className="space-y-3">
          <StatementError code={shownNotice.code} />
          {shownNotice.pending && (
            <button
              className={secondaryClass}
              disabled={issuing}
              onClick={() => {
                const pending = loadPending(window.localStorage, scope, month);
                if (pending) void send(pending.requestKey);
              }}
            >
              {c("같은 발행 요청 결과 다시 확인", "Check the same issue request again")}
            </button>
          )}
        </div>
      )}
      {!view ? (
        !error && <TeamLoading />
      ) : (
        <>
          <p className="text-sm leading-6 text-muted">
            {stateText(c, view.state, view.issueOn, view.revisions.length)}
            {view.issueOn && ` · ${c("발행 기준일", "issue day")} ${view.issueOn}`}
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted">{c(...notTaxInvoice)}</p>
          {(view.state === "due" || (view.state === "issued" && view.issueOn)) && (
            <button className={view.state === "due" ? primaryClass : secondaryClass} disabled={issuing} onClick={requestIssue}>
              {view.state === "due"
                ? c("명세 발행 요청", "Request issue")
                : c("정정 필요 여부 확인", "Check for corrections")}
            </button>
          )}
          {issuing && (
            <p role="status" className="text-sm text-muted">
              {c("발행 요청을 처리하고 있습니다.", "Processing the issue request.")}
            </p>
          )}
          {view.revisions.length > 0 && (
            <Block
              title={c("확정본과 정정본", "Issued versions")}
              description={c(
                "발행된 PDF는 바뀌지 않습니다. 받은 파일의 크기와 SHA-256을 발행본과 대조한 뒤에만 저장합니다.",
                "Issued PDFs never change. A download is saved only after its size and SHA-256 match the issued version.",
              )}
            >
              <ul className="divide-y divide-border">
                {view.revisions.map((r) => {
                  const state = downloads.find((d) => d.id === r.id && d.key === key)?.state;
                  return (
                    <li key={r.id} className="space-y-2 py-4 text-sm">
                      <p className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          revision {r.revision}
                          {r.revision > 1 && ` · ${c("정정본", "correction")}`} · {kst(r.issuedAt)} {c("발행", "issued")}
                        </span>
                        <button className={secondaryClass} disabled={state === "busy"} onClick={() => void download(r)}>
                          {c("PDF 받기", "Download PDF")}
                        </button>
                      </p>
                      <p className="text-muted">
                        {r.reasons.map((reason) => c(...reasonLabels[reason])).join(", ")}
                      </p>
                      <p className="break-all font-mono text-xs text-muted">
                        SHA-256 {r.pdf.sha256} · {new Intl.NumberFormat(lang === "ko" ? "ko-KR" : "en-US").format(r.pdf.bytes)} bytes
                      </p>
                      {state === "busy" && (
                        <p role="status" className="text-muted">{c("받는 중 · 해시 확인 전", "Receiving · not yet verified")}</p>
                      )}
                      {state === "verified" && (
                        <p role="status">{c("SHA-256 일치 확인 · 저장을 시작했습니다", "SHA-256 verified · saving started")}</p>
                      )}
                      {state && state !== "busy" && state !== "verified" && <StatementError code={state} />}
                    </li>
                  );
                })}
              </ul>
            </Block>
          )}
          {latest && <Snapshot revision={latest} />}
          {!latest && view.state !== "due" && (
            <p className="text-sm text-muted">
              {c("아직 확정된 명세가 없습니다.", "No statement has been issued yet.")}
            </p>
          )}
        </>
      )}
    </TeamShell>
  );
}
