"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UseOverlayStateReturn } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import {
  b2bService,
  type Invitation,
  type ParticipationKind,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

export function InvitationPanel({
  projectId,
  editable,
  dialog,
  onCount,
}: {
  projectId?: string;
  editable: boolean;
  /** Team members page: the 초대 tab shows how many are pending. */
  onCount?: (pending: number) => void;
  /** Team invitations: the form opens in this dialog (the page header owns
   *  the trigger). Without it the form sits inline, as on a folder's page. */
  dialog?: UseOverlayStateReturn;
}) {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const id = data.workspace.id;
  const canBill = !!b2b?.enrolled && b2b.allowedActions.billing;
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<ParticipationKind>(
    projectId ? "external" : "internal",
  );
  const [role, setRole] = useState<"producer" | "reviewer">("producer");
  const [admin, setAdmin] = useState(false);
  const [download, setDownload] = useState(false);
  // Team invitations: take a paid seat when accepted (never buys one).
  const [seat, setSeat] = useState(true);
  const seats = useSeats(id, !projectId && editable);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  // The row action being confirmed: a reason is asked for only then.
  const [asking, setAsking] = useState<{
    row: Pick<Invitation, "id" | "revision" | "email">;
    action: "resend" | "revoke";
  } | null>(null);
  const pending = useRef<{ hash: string; key: string } | null>(null);
  const pendingChange = useRef<{
    invitationId: string;
    action: "resend" | "revoke";
    input: { requestKey: string; revision: number; reason: string };
  } | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await b2bService.invitations(id, projectId);
      if (request === sequence.current) setRows(result.invitations);
    } catch (e) {
      if (request === sequence.current) {
        setRows([]);
        setError(errorCode(e));
      }
    }
  }, [id, projectId]);
  useEffect(() => {
    const requests = sequence;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      requests.current++;
    };
  }, [load]);
  const live = rows.filter((row) => !row.acceptedAt && !row.revokedAt);
  useEffect(() => {
    onCount?.(live.length);
  }, [live.length, onCount]);
  async function change(
    row: Pick<Invitation, "id" | "revision">,
    action: "resend" | "revoke",
  ) {
    if (busy || !reason.trim()) return false;
    if (
      pendingChange.current &&
      (pendingChange.current.invitationId !== row.id ||
        pendingChange.current.action !== action)
    )
      return false;
    pendingChange.current ??= {
      invitationId: row.id,
      action,
      input: {
        requestKey: crypto.randomUUID(),
        revision: row.revision,
        reason: reason.trim(),
      },
    };
    setBusy(true);
    setError("");
    try {
      await b2bService.changeInvitation(
        id,
        row.id,
        action,
        pendingChange.current.input,
      );
      pendingChange.current = null;
      await load();
      return true;
    } catch (e) {
      setError(errorCode(e));
      if (freeIntent(pendingChange.current, e)) pendingChange.current = null;
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function confirmChange(
    row: Pick<Invitation, "id" | "revision">,
    action: "resend" | "revoke",
  ) {
    if (await change(row, action)) {
      setAsking(null);
      setReason("");
    }
  }
  const locked = (row: { id: string }, action: "resend" | "revoke") =>
    busy ||
    (!!pendingChange.current &&
      (pendingChange.current.invitationId !== row.id ||
        pendingChange.current.action !== action));
  const actionLabel = (action: "resend" | "revoke") =>
    action === "resend"
      ? c("재전송", "Resend")
      : c("초대 취소", "Cancel invitation");
  const errorView = error && (
    <B2bError
      code={error}
      retry={
        pendingChange.current
          ? () => {
              const intent = pendingChange.current;
              if (intent)
                void confirmChange(
                  {
                    id: intent.invitationId,
                    revision: intent.input.revision,
                  },
                  intent.action,
                );
            }
          : undefined
      }
    />
  );
  const form = editable && (
    <form
      className="max-w-xl space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const input = {
          email: email.trim(),
          kind,
          teamRole:
            !projectId && admin
              ? ("admin" as const)
              : role === "reviewer"
                ? ("reviewer" as const)
                : ("editor" as const),
          projectId,
          projectRole: projectId ? role : undefined,
          canDownload: projectId ? download : false,
          assignSeat: projectId ? undefined : seat,
        };
        const hash = JSON.stringify(input);
        if (pending.current && pending.current.hash !== hash) {
          setError("B2B_REQUEST_KEY_CONFLICT");
          return;
        }
        pending.current ??= { hash, key: crypto.randomUUID() };
        setBusy(true);
        setError("");
        try {
          await b2bService.issueInvitation(id, {
            ...input,
            requestKey: pending.current.key,
          });
          pending.current = null;
          setEmail("");
          await load();
        } catch (e) {
          setError(errorCode(e));
          if (freeIntent(pending.current, e)) pending.current = null;
        } finally {
          setBusy(false);
        }
      }}
    >
      <SpaceBadge workspace={data.workspace} />
      <label className="block space-y-1.5 text-[13px]">
        <span>{c("초대 이메일", "Invitation email")}</span>
        <input
          className={inputClass}
          type="email"
          required
          maxLength={254}
          disabled={busy || !!pending.current || !!pendingChange.current}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {projectId && (
        <>
          <label className="block space-y-1.5 text-[13px]">
            <span>{c("참여 구분", "Affiliation")}</span>
            <select
              aria-label={c("참여 구분", "Affiliation")}
              className={inputClass}
              disabled={
                busy || !!pending.current || !!pendingChange.current
              }
              value={kind}
              onChange={(e) => setKind(e.target.value as ParticipationKind)}
            >
              <option value="external">
                {c("외부 참여자", "External collaborator")}
              </option>
              <option value="internal">
                {c("내부 참여자", "Internal participant")}
              </option>
            </select>
          </label>
          <label className="block space-y-1.5 text-[13px]">
            <span>{c("초대 역할", "Invitation role")}</span>
            <select
              aria-label={c("초대 역할", "Invitation role")}
              className={inputClass}
              disabled={
                busy || !!pending.current || !!pendingChange.current
              }
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "producer" | "reviewer")
              }
            >
              <option value="producer">{c("제작자", "Producer")}</option>
              <option value="reviewer">{c("검토자", "Reviewer")}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-[13px] sm:min-h-9">
            <input
              type="checkbox"
              checked={download}
              disabled={
                busy || !!pending.current || !!pendingChange.current
              }
              onChange={(e) => setDownload(e.target.checked)}
            />
            {c(
              "초대받은 사람의 다운로드 허용",
              "Allow downloads for this invitee",
            )}
          </label>
        </>
      )}
      {!projectId && data.role === "owner" && (
        <label className="flex min-h-11 items-center gap-3 text-[13px] sm:min-h-9">
          <input
            type="checkbox"
            checked={admin}
            disabled={busy || !!pending.current || !!pendingChange.current}
            onChange={(e) => setAdmin(e.target.checked)}
          />
          {c("팀 관리자로 초대", "Invite as team administrator")}
        </label>
      )}
      {!projectId && (
        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-3 text-[13px] sm:min-h-9">
            <input
              type="checkbox"
              checked={seat}
              disabled={busy || !!pending.current || !!pendingChange.current}
              onChange={(e) => setSeat(e.target.checked)}
            />
            {c("수락하면 편집 좌석 배정", "Assign an editing seat on acceptance")}
          </label>
          {seat && seats && (
            <p className="text-xs leading-5 text-muted" data-testid="invite-seat-info">
              {seats.free > 0
                ? c(
                    `남은 좌석 ${seats.free}/${seats.capacity}석`,
                    `${seats.free} of ${seats.capacity} seats free`,
                  )
                : c(
                    "남은 좌석이 없습니다. 수락하면 좌석 대기로 들어갑니다.",
                    "No seat is free. They join waiting for a seat.",
                  )}
              {seats.free === 0 && seats.extraKrw !== null &&
                c(
                  ` 추가 좌석은 월 ${seats.extraKrw.toLocaleString("ko-KR")}원(부가세 별도)입니다.`,
                  ` An extra seat is ₩${seats.extraKrw.toLocaleString("en-US")}/month before VAT.`,
                )}{" "}
              {seats.free === 0 && canBill && (
                <Link
                  className="underline"
                  href={`/dashboard/workspaces/${id}/plan`}
                >
                  {c("좌석 추가", "Add a seat")}
                </Link>
              )}
            </p>
          )}
        </div>
      )}
      {dialog && errorView}
      <button
        className={primaryClass}
        disabled={busy || !!pendingChange.current || !email.trim()}
      >
        {busy
          ? c("기록 중…", "Saving…")
          : c("초대 보내기", "Send invitation")}
      </button>
    </form>
  );
  const confirm = asking && (
            <ConfirmDialog
              label={actionLabel(asking.action)}
              onClose={() => {
                if (!busy) setAsking(null);
              }}
            >
              <p className="break-all text-sm font-medium">
                {asking.row.email}
              </p>
              <label className="block space-y-1.5 text-[13px]">
                <span>
                  {c("초대 재전송·취소 사유", "Reason for resending or cancelling")}
                </span>
                <textarea
                  aria-label={c(
                    "초대 재전송·취소 사유",
                    "Reason for resending or cancelling",
                  )}
                  className={inputClass}
                  disabled={busy || !!pendingChange.current}
                  value={reason}
                  maxLength={1000}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  className={primaryClass}
                  disabled={
                    !reason.trim() || locked(asking.row, asking.action)
                  }
                  onClick={() => void confirmChange(asking.row, asking.action)}
                >
                  {actionLabel(asking.action)}
                </button>
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => setAsking(null)}
                >
                  {c("닫기", "Close")}
                </button>
              </div>
            </ConfirmDialog>
  );
  const status = (row: Invitation) =>
    new Date(row.expiresAt).getTime() <= Date.now()
      ? c("초대 만료", "Expired")
      : row.deliveryState === "sent"
        ? c("메일 발송 완료 · 수락 대기", "Email sent · Awaiting acceptance")
        : row.deliveryState === "failed"
          ? c("메일 발송 실패 · 재전송 가능", "Email failed · Can resend")
          : c("메일 발송 대기", "Email queued");
  if (dialog)
    // Team members page, 초대 tab: the tab is the section, rows are a table.
    return (
      <>
        <Dialog state={dialog} title={c("참여자 초대", "Invite participants")}>
          {form}
        </Dialog>
        <div className="space-y-4">
          {!dialog.isOpen && errorView}
          {live.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">
              {c("대기 중인 초대가 없습니다.", "No pending invitations.")}
            </p>
          ) : (
            (
              <table className="w-full border-collapse text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted">
                    <th className="h-11 pr-3 font-medium">{c("이메일", "Email")}</th>
                    <th className="hidden h-11 px-3 font-medium sm:table-cell">{c("상태", "Status")}</th>
                    <th className="hidden h-11 px-3 font-medium md:table-cell">{c("만료", "Expires")}</th>
                    <th className="h-11 pl-3"><span className="sr-only">{c("작업", "Actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((row) => (
                    <tr key={row.id} className="border-b border-border">
                      <td className="break-all py-3 pr-3 font-medium">
                        {row.email}
                        <span className="block text-xs font-normal text-muted sm:hidden">{status(row)}</span>
                      </td>
                      <td className="hidden px-3 py-3 text-muted sm:table-cell">
                        {status(row)}
                        {row.assignSeat && c(" · 수락하면 좌석 배정", " · Seat on acceptance")}
                      </td>
                      <td className="hidden px-3 py-3 text-muted md:table-cell">
                        {new Date(row.expiresAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {editable && (
                          <span className="inline-flex gap-3">
                            {(["resend", "revoke"] as const).map((action) => (
                              <button
                                key={action}
                                className="text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
                                disabled={locked(row, action)}
                                onClick={() => setAsking({ row, action })}
                              >
                                {actionLabel(action)}
                              </button>
                            ))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
          {asking && confirm}
        </div>
      </>
    );
  // A folder's page: the form sits inline, the rows under it.
  return (
    <>
      {(
        <Block
          title={
            projectId
              ? c("프로젝트 초대", "Project invitations")
              : c("대기 중인 초대", "Pending invitations")
          }
        >
          {form}
          {errorView}
          {live.length > 0 && (
            <ul className="divide-y divide-border">
              {live.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{row.email}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {new Date(row.expiresAt).getTime() <= Date.now()
                        ? c("초대 만료", "Expired")
                        : row.deliveryState === "sent"
                          ? c(
                              "메일 발송 완료 · 수락 대기",
                              "Email sent · Awaiting acceptance",
                            )
                          : row.deliveryState === "failed"
                            ? c(
                                "메일 발송 실패 · 재전송 가능",
                                "Email failed · Can resend",
                              )
                            : c("메일 발송 대기", "Email queued")}
                      {row.assignSeat &&
                        c(" · 수락하면 좌석 배정", " · Seat on acceptance")}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex gap-2">
                      {(["resend", "revoke"] as const).map((action) => (
                        <button
                          key={action}
                          className={secondaryClass}
                          disabled={locked(row, action)}
                          onClick={() => setAsking({ row, action })}
                        >
                          {actionLabel(action)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {asking && confirm}
        </Block>
      )}
    </>
  );
}

/** Free seats in the current paid period and the extra-seat price, for the
 * team invite form. Null when unknown (no purchase yet, or not readable). */
function useSeats(id: string, enabled: boolean) {
  const [seats, setSeats] = useState<{
    free: number;
    capacity: number;
    extraKrw: number | null;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void Promise.all([
      b2bService.licences(id),
      b2bService.commerce(id).catch(() => null),
    ])
      .then(([overview, commerce]) => {
        const now = Date.parse(overview.serverTime);
        const period = overview.periods.find(
          (p) =>
            p.state === "active" &&
            Date.parse(p.startsAt) <= now &&
            Date.parse(p.endsAt) > now,
        );
        if (!alive || !period) return;
        const taken = overview.assignments.filter(
          (a) =>
            a.periodId === period.id &&
            ["active", "scheduled", "revoking"].includes(a.state),
        ).length;
        setSeats({
          free: Math.max(0, period.capacity - taken),
          capacity: period.capacity,
          extraKrw: commerce?.configured
            ? commerce.product.extraSeat.supplyKrw
            : null,
        });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return seats;
}
