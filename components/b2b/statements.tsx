"use client";
import { billingTabs } from "./billing-shared";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { statementApi } from "@/lib/api/services/b2b-statements.service";
import type {
  TeamStatementMonthState,
  TeamStatementRevision,
} from "@/lib/api/services/b2b.service";
import { statementLabels } from "@/lib/api/generated/b2b";
import { useWorkspace } from "@/components/workspaces/workspace-context";
// Only what e2e/b2b-statements-races.spec.ts stubs for this module may be
// imported here (no BackLink/Details/KeyValues until that stub grows them).
import {
  Block,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { useI18n } from "@/lib/i18n/context";
import {
  StatementLifetime,
  BrowserStatementStore,
  freshIssue,
  runIssue,
  type PendingIssue,
  kst,
  monthLabel,
  scopeKey,
  verifiedPdf,
  won,
  type StatementScope,
} from "@/lib/b2b-statements/statements";
import { B2bError, errorCode as commonErrorCode, useCopy } from "./shared";

function errorCode(error: unknown) {
  const code = commonErrorCode(error), message = (error as Error)?.message;
  return code === "REQUEST_FAILED" && typeof message === "string" && /^B2B_[A-Z0-9_]+$/.test(message) ? message : code;
}
// SOT: backend/docs/b2b-monthly-statements.md (S25 / W17)
const messages: Record<string, [string, string]> = {
  B2B_STATEMENT_RECOVERY_BLOCKED: ["이 브라우저의 발급 요청 기록을 확인하지 못했습니다. 원 요청 번호를 보존했고 새 요청을 보내지 않았습니다.", "The saved issue record could not be verified. Its original request is preserved and no new request was sent."],
  B2B_STATEMENT_RECEIPT_MISMATCH: ["발급 결과의 계정·팀·월 또는 원 요청 번호가 일치하지 않습니다. 원 요청 기록을 보존했습니다.", "The receipt does not match the account, team, month or original request. The saved request is preserved."],
  B2B_STATEMENT_ACCOUNT_CHANGED: ["로그인 계정이 바뀌어 명세 요청과 저장을 중단했습니다.", "The signed-in account changed. Statement requests and saving stopped."],
  B2B_STATEMENT_SCOPE_CHANGED: ["명세 화면이나 팀이 바뀌어 이전 요청과 저장을 중단했습니다.", "The statement view or team changed. Previous requests and saving stopped."],
  B2B_STATEMENT_SERVICE_CHANGED: ["연결한 서비스가 바뀌어 이전 명세 요청과 저장을 중단했습니다.", "The connected service changed. Previous requests and saving stopped."],

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
  B2B_ACCOUNT_REQUIRED: [
    "로그인 계정을 확인할 수 없어 명세를 요청하지 않았습니다. 다시 로그인한 뒤 열어 주세요.",
    "The signed-in account could not be determined, so nothing was requested. Sign in again and reopen this page.",
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

// Labels live in the server contract so the PDF and this screen cannot drift.
const L = statementLabels;
const bytesText = (bytes: number) =>
  bytes >= 1_073_741_824
    ? `${(bytes / 1_073_741_824).toFixed(2)} GB`
    : bytes >= 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MB`
      : `${new Intl.NumberFormat("en-US").format(bytes)} B`;

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
/** A mounted scope owns transport and every later browser side effect. */
function useStatementApi(scope: StatementScope, key: string, allowed: boolean) {
  const owner = useMemo(() => new StatementLifetime(allowed, key), [key, allowed]);
  useLayoutEffect(() => { owner.start(); return () => owner.stop(); }, [owner]);
  return useMemo(() => statementApi(scope, () => owner.signal(), () => owner.assertCurrent()), [scope, owner]);
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
    const accountChanged = (event: StorageEvent) => {
      if (!event.key || ["userInfo", "accessToken", "refreshToken"].includes(event.key)) {
        calls.current++; setLoaded(null); setFailure(null); void load();
      }
    };
    window.addEventListener("storage", accountChanged);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(initial);
      window.removeEventListener("storage", accountChanged);
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
const monthGrid =
  "grid grid-cols-[1fr_auto] items-center gap-x-4 sm:grid-cols-[9rem_minmax(0,1fr)_12rem_1.5rem]";
export function TeamStatements() {
  const c = useCopy();
  const { lang } = useI18n();
  const { b2b, scope, key, allowed } = useScope();
  const api = useStatementApi(scope, key, allowed);
  const fetcher = useCallback(() => api.list(), [api]);
  const { view, error, busy, load } = usePinned(key, allowed, fetcher);
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  if (!allowed) return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <TeamShell title={c("플랜과 결제", "Plan and billing")} tabs={billingTabs(scope.workspaceId, c)}>
      {/* Said once, here: the month pages no longer repeat it. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {c(
            "월별 구매 명세입니다. 세금계산서가 아닙니다.",
            "Purchases by month. A statement is not a tax invoice.",
          )}
        </p>
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
          {view.months.length === 0 ? (
            <p className="text-[13px] text-muted">
              {c(
                "아직 명세가 없습니다. 결제한 달부터 표시합니다.",
                "No statements yet. Months appear once a payment exists.",
              )}
            </p>
          ) : (
            <div>
              <div aria-hidden="true" className={`${monthGrid} hidden h-11 border-b border-border text-xs font-medium text-muted sm:grid`}>
                <span>{c("월", "Month")}</span>
                <span>{c("상태", "State")}</span>
                <span>{c("발행", "Issued")}</span>
              </div>
              <ul aria-label={c("명세 월 목록", "Statement months")}>
                {view.months.map((m) => (
                  <li key={m.month} className="border-b border-border">
                    <Link
                      href={`/dashboard/workspaces/${scope.workspaceId}/statements/${m.month}`}
                      className={`${monthGrid} py-3 text-[13px] transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground`}
                    >
                      <span className="font-medium">{monthLabel(m.month, lang === "ko" ? "ko" : "en")}</span>
                      <span className="text-muted">
                        {stateText(c, m.state, m.issueOn, m.revisions)}
                      </span>
                      {/* The state already names the issue day; only the issue time is new. */}
                      <span className="hidden truncate tabular-nums text-muted sm:block">
                        {m.latest ? kst(m.latest.issuedAt) : "—"}
                      </span>
                      <ChevronRight size={15} strokeWidth={1.75} aria-hidden="true" className="hidden justify-self-end text-muted sm:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
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
  const pick = (label: { ko: string; en: string }) => c(label.ko, label.en);
  return (
    <>
      <Block
        title={c("결제 금액 요약", "Payment summary")}
        description={c(
          "이 달에 확인된 수납과 환불입니다. 환불은 이전 달 주문의 것일 수 있습니다.",
          "Payments and refunds confirmed this month. A refund may belong to an earlier month's order.",
        )}
      >
        <Figures
          rows={[
            [c("공급가액", "Supply"), won(s.totals.supplyKrw)],
            [c("부가세", "VAT"), won(s.totals.vatKrw)],
            [c("합계", "Total"), won(s.totals.totalKrw)],
            [c("수납 확인", "Received"), won(s.totals.receivedKrw)],
            [c("환불 완료", "Refunded"), won(s.totals.refundedKrw)],
            [c("이 달 순수납", "Net received this month"), won(s.totals.receivedKrw - s.totals.refundedKrw)],
          ]}
        />
        {s.byKind.length > 0 && (
          <ul className="space-y-1 text-sm tabular-nums">
            {s.byKind.map((k) => (
              <li key={k.kind} className="flex justify-between gap-4">
                <span>
                  {pick(L.kinds[k.kind])} × {k.quantity}
                </span>
                <span className="text-muted">
                  {c("비례 전 정가", "List")} {won(k.listSupplyKrw)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Block>
      {(s.recipients.length > 0 || s.recipient) && (
        <Block
          title={c("수신 사업자 정보", "Recipient")}
          description={
            s.recipients.length > 1
              ? c("이 달에 제출된 사업자 정보가 둘 이상입니다.", "More than one business copy was submitted this month.")
              : undefined
          }
        >
          {(s.recipients.length > 0
            ? s.recipients
            : [{ buyer: s.recipient!, sourceOrderIds: [s.recipient!.sourceOrderId] }]
          ).map((r) => (
            <div key={r.sourceOrderIds.join()} className="space-y-0.5 text-sm">
              <p className="font-medium">{r.buyer.businessName}</p>
              <p className="text-[13px] text-muted tabular-nums">
                {r.buyer.businessRegistrationNumber} · {r.buyer.representative} · {r.buyer.receiptEmail}
              </p>
              <p className="text-[13px] text-muted">
                {r.buyer.address} · {c("주문", "Orders")} {r.sourceOrderIds.map((id) => id.slice(0, 8)).join(", ")}
              </p>
            </div>
          ))}
        </Block>
      )}
      <Block title={c("주문별 내역", "Orders")}>
        {s.purchases.length === 0 ? (
          <p className="text-sm text-muted">{c("이 달에 수납된 주문이 없습니다.", "No orders were paid this month.")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {s.purchases.map((p) => (
              <li key={p.orderId} className="space-y-0.5 py-3 text-sm">
                <p className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">
                    {pick(L.targets[p.target])} · {pick(L.purchaseStates[p.status])}
                  </span>
                  <span className="tabular-nums">{won(p.amounts.totalKrw)}</span>
                </p>
                <p className="text-[13px] text-muted tabular-nums">
                  {kst(p.paidAt)} {c("결제", "paid")} · {c("공급가액", "supply")} {won(p.amounts.supplyKrw)} · {c("부가세", "VAT")} {won(p.amounts.vatKrw)}
                </p>
                <p className="text-[13px] text-muted">
                  {p.lines.map((l) => `${pick(L.kinds[l.kind])} × ${l.quantity}`).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Block>
      {(s.adjustments.length > 0 || s.refunds.length > 0) && (
        <Block
          title={c("정산과 환불", "Settlement and refunds")}
          description={c(
            "확인 중인 환불은 금액에 넣지 않습니다.",
            "Refunds being confirmed are not counted.",
          )}
        >
          <ul className="divide-y divide-border text-sm tabular-nums">
            {s.adjustments.map((a) => (
              <li key={`a-${a.orderId}`} className="flex flex-wrap justify-between gap-2 py-3">
                <span>{c("반영 지연 과납 차액", "Delayed-application overpayment")} · {pick(L.adjustmentStates[a.state])}</span>
                <span>{won(a.amountKrw)}</span>
              </li>
            ))}
            {s.refunds.map((r) => (
              <li key={r.refundId} className="space-y-1 py-3">
                <p className="flex flex-wrap justify-between gap-2">
                  <span>
                    {r.kind === "overpayment" ? c("과납 반환", "Overpayment return") : c("미사용분 환불", "Unused refund")} · {pick(L.refundStates[r.state])}
                  </span>
                  <span>
                    {c("요청", "Requested")} {won(r.amounts.totalKrw)} · {c("이 달 환불 완료", "Refunded this month")} {won(r.returnedInMonthKrw)}
                  </span>
                </p>
                <p className="text-[13px] text-muted">
                  {c("회수한 제공량", "Allowances reclaimed")}: {c("편집 이용권", "editing licences")} {r.allowances.seats} · {c("저장", "storage")} {bytesText(r.allowances.storageBytes)}
                </p>
              </li>
            ))}
          </ul>
        </Block>
      )}
    </>
  );
}

export function TeamStatementMonth({ month }: { month: string }) {
  const c = useCopy();
  const { lang } = useI18n();
  const { b2b, scope, key, allowed } = useScope();
  const viewKey = `${key}:${month}`;
  const api = useStatementApi(scope, viewKey, allowed);
  const fetcher = useCallback(() => api.detail(month), [api, month]);
  const { view, error, busy, load } = usePinned(viewKey, allowed, fetcher);
  const store = useMemo(() => new BrowserStatementStore(), []);
  const [notice, setNotice] = useState<{ key: string; code: string; pending: boolean } | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [downloads, setDownloads] = useState<{ key: string; id: string; state: "busy" | "verified" | string }[]>([]);
  const current = useCallback(() => { try { api.assertScope(); return true; } catch { return false; } }, [api]);
  const send = useCallback(async (record: PendingIssue) => {
    if (!current()) return;
    setIssuing(true);
    try {
      await runIssue(record, api, store);
      if (current()) setNotice(null);
    } catch (error) {
      if (!current()) return;
      let pending = true;
      try { pending = !!(await store.get(scope, month, () => api.assertScope())); } catch { /* preserve a blocked recovery */ }
      if (current()) setNotice({ key: viewKey, code: errorCode(error), pending });
    } finally {
      if (current()) { setIssuing(false); void load(); }
    }
  }, [api, store, scope, month, viewKey, current, load]);
  // Read recovery is scoped and asks for the old receipt before any retry POST.
  useEffect(() => {
    if (!allowed) return;
    let stopped = false;
    const timer = window.setTimeout(() => {
      void store.get(scope, month, () => api.assertScope()).then(record => {
        if (!stopped && current()) { setIssuing(false); if (record) void send(record); }
      }).catch(error => {
        if (!stopped && current()) setNotice({ key: viewKey, code: errorCode(error), pending: false });
      });
    }, 0);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [allowed, store, scope, month, api, current, send, viewKey]);
  const requestIssue = () => void send(freshIssue(scope, month));
  const retryIssue = async () => {
    try {
      const record = await store.get(scope, month, () => api.assertScope());
      if (record && current()) await send(record);
    } catch (error) { if (current()) setNotice({ key: viewKey, code: errorCode(error), pending: false }); }
  };
  const download = async (revision: TeamStatementRevision) => {
    if (!current()) return;
    const mark = (state: string) => {
      if (current()) setDownloads(rows => [...rows.filter(r => r.id !== revision.id), { key: viewKey, id: revision.id, state }]);
    };
    mark("busy");
    let url: string | undefined;
    try {
      const bytes = await api.pdf(revision.id);
      api.assertScope();
      // A buffered response might have been authorized before delegation ended.
      // Recheck current server authority immediately before saving its bytes.
      const latest = await api.detail(month);
      api.assertScope();
      const issued = latest.revisions.find(r => r.id === revision.id);
      if (!issued || !verifiedPdf(bytes, issued.pdf) || !verifiedPdf(bytes, revision.pdf)) throw new Error("B2B_STATEMENT_INTEGRITY");
      api.assertScope();
      url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `prepix-statement-${month}-r${revision.revision}.pdf`;
      api.assertScope();
      link.click();
      const savedUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(savedUrl), 60_000);
      url = undefined;
      mark("verified");
    } catch (error) {
      mark(errorCode(error));
      if (current()) void load();
    } finally { if (url) URL.revokeObjectURL(url); }
  };
  if (!b2b?.enrolled) return <B2bError code="B2B_TEAM_NOT_FOUND" />;
  if (!allowed) return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  const shownNotice = notice?.key === viewKey ? notice : null;
  const latest = view?.revisions[0];
  return (
    <TeamShell
      title={c(`${monthLabel(month)} 이용명세서`, `${monthLabel(month, "en")} statement`)}
      actions={
        <button className={secondaryClass} disabled={busy} onClick={() => void load()}>
          {c("최신 상태 확인", "Refresh")}
        </button>
      }
    >
      {/* BackLink's markup: the races spec's stub of the shared module lacks it. */}
      <Link
        href={`/dashboard/workspaces/${scope.workspaceId}/statements`}
        className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
        {c("명세 목록", "All statements")}
      </Link>
      {error && <StatementError code={error} retry={() => void load()} />}
      {shownNotice && (
        <div className="space-y-3">
          <StatementError code={shownNotice.code} />
          {shownNotice.pending && (
            <button
              className={secondaryClass}
              disabled={issuing}
              onClick={() => void retryIssue()}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">
              {stateText(c, view.state, view.issueOn, view.revisions.length)}
              {view.state !== "scheduled" && view.issueOn && ` · ${c("발행 기준일", "issue day")} ${view.issueOn}`}
            </p>
            {(view.state === "due" || (view.state === "issued" && view.issueOn)) && (
              <button className={view.state === "due" ? primaryClass : secondaryClass} disabled={issuing} onClick={requestIssue}>
                {view.state === "due"
                  ? c("명세 발행 요청", "Request issue")
                  : c("정정 필요 여부 확인", "Check for corrections")}
              </button>
            )}
          </div>
          {issuing && (
            <p role="status" className="text-[13px] text-muted">
              {c("발행 요청을 처리하고 있습니다.", "Processing the issue request.")}
            </p>
          )}
          {view.revisions.length > 0 && (
            <Block
              title={c("확정본과 정정본", "Issued versions")}
              description={c(
                "발행된 PDF는 바뀌지 않으며, 받은 파일은 발행본과 대조한 뒤 저장합니다.",
                "Issued PDFs never change; a download is saved only after it matches the issued file.",
              )}
            >
              <ul className="divide-y divide-border">
                {view.revisions.map((r) => {
                  const state = downloads.find((d) => d.id === r.id && d.key === viewKey)?.state;
                  return (
                    <li key={r.id} className="space-y-1 py-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">
                          revision {r.revision}
                          {r.revision > 1 && ` · ${c("정정본", "correction")}`} · {kst(r.issuedAt)} {c("발행", "issued")}
                        </span>
                        <button className={secondaryClass} disabled={state === "busy"} onClick={() => void download(r)}>
                          {c("PDF 받기", "Download PDF")}
                        </button>
                      </div>
                      <p className="text-[13px] text-muted">
                        {r.reasons.map((reason) => c(L.reasons[reason].ko, L.reasons[reason].en)).join(", ")}
                      </p>
                      <p className="break-all font-mono text-xs text-muted">
                        SHA-256 {r.pdf.sha256} · {new Intl.NumberFormat(lang === "ko" ? "ko-KR" : "en-US").format(r.pdf.bytes)} bytes
                      </p>
                      {state === "busy" && (
                        <p role="status" className="text-[13px] text-muted">{c("받는 중 · 해시 확인 전", "Receiving · not yet verified")}</p>
                      )}
                      {state === "verified" && (
                        <p role="status" className="text-[13px]">{c("SHA-256 일치 확인 · 저장을 시작했습니다", "SHA-256 verified · saving started")}</p>
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
            <p className="text-[13px] text-muted">
              {c("아직 확정된 명세가 없습니다.", "No statement has been issued yet.")}
            </p>
          )}
        </>
      )}
    </TeamShell>
  );
}
