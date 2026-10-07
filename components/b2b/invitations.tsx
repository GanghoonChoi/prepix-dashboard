"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  b2bService,
  type Invitation,
  type ParticipationKind,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

export function InvitationPanel({
  projectId,
  editable,
}: {
  projectId?: string;
  editable: boolean;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const id = data.workspace.id;
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
  const waiting = rows.filter((row) => row.acceptedAt && row.seat === "waiting");
  async function change(
    row: Pick<Invitation, "id" | "revision">,
    action: "resend" | "revoke",
  ) {
    if (busy || !reason.trim()) return;
    if (
      pendingChange.current &&
      (pendingChange.current.invitationId !== row.id ||
        pendingChange.current.action !== action)
    )
      return;
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
    } catch (e) {
      setError(errorCode(e));
      if (freeIntent(pendingChange.current, e)) pendingChange.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 border-t border-border pt-8">
      <h2 className="font-medium">
        {projectId
          ? c("폴더 초대", "Folder invitations")
          : c("내부 팀 참여자 초대", "Invite internal team participants")}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {projectId
          ? c(
              "수락한 뒤 참여 권한이 생깁니다. 초대는 편집 이용권이나 AI를 지급하지 않습니다.",
              "Participation starts after acceptance. Invitations grant no editing licence or AI allowance.",
            )
          : c(
              "수락한 뒤 참여 권한이 생깁니다. 좌석 배정을 켜면 수락할 때 이미 구매한 좌석 하나를 배정합니다. 초대로 결제되지는 않습니다.",
              "Participation starts after acceptance. With a seat on, acceptance takes one seat you already bought. Inviting never charges.",
            )}
      </p>
      {editable && (
        <form
          className="max-w-2xl space-y-4"
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
          <label className="block space-y-2 text-sm">
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
              <label className="block space-y-2 text-sm">
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
              <label className="block space-y-2 text-sm">
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
              <label className="flex min-h-11 items-center gap-3 text-sm">
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
            <label className="flex min-h-11 items-center gap-3 text-sm">
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
              <label className="flex min-h-11 items-center gap-3 text-sm">
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
                        `남은 좌석 ${seats.free}/${seats.capacity}석 · 수락하면 하나를 배정합니다.`,
                        `${seats.free} of ${seats.capacity} seats free · one is assigned on acceptance.`,
                      )
                    : c(
                        "남은 좌석이 없습니다. 수락하면 좌석 대기로 들어가고, 좌석을 추가하면 이용권 화면에서 배정합니다.",
                        "No seat is free. They join waiting for a seat; add one, then assign it on the licences page.",
                      )}
                  {seats.extraKrw !== null &&
                    c(
                      ` 추가 좌석은 월 ${seats.extraKrw.toLocaleString("ko-KR")}원(부가세 별도), 남은 기간은 일할 계산됩니다.`,
                      ` An extra seat is ₩${seats.extraKrw.toLocaleString("en-US")}/month before VAT, prorated for the rest of the period.`,
                    )}{" "}
                  {seats.free === 0 && (
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
          <button
            className={primaryClass}
            disabled={busy || !!pendingChange.current || !email.trim()}
          >
            {busy
              ? c("기록 중…", "Saving…")
              : c("초대 보내기", "Send invitation")}
          </button>
        </form>
      )}
      {error && (
        <B2bError
          code={error}
          retry={
            pendingChange.current
              ? () => {
                  const intent = pendingChange.current;
                  if (intent)
                    void change(
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
      )}
      {live.length > 0 && (
        <>
          <label className="block max-w-2xl space-y-2 text-sm">
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
          <ul className="divide-y divide-border">
            {live.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm">{row.email}</p>
                  <p className="mt-1 text-xs text-muted">
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
                    <button
                      className={secondaryClass}
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!!pendingChange.current &&
                          (pendingChange.current.invitationId !== row.id ||
                            pendingChange.current.action !== "resend"))
                      }
                      onClick={() => void change(row, "resend")}
                    >
                      {c("재전송", "Resend")}
                    </button>
                    <button
                      className={secondaryClass}
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!!pendingChange.current &&
                          (pendingChange.current.invitationId !== row.id ||
                            pendingChange.current.action !== "revoke"))
                      }
                      onClick={() => void change(row, "revoke")}
                    >
                      {c("초대 취소", "Cancel invitation")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {waiting.length > 0 && (
        <div className="space-y-2" data-testid="invite-seat-waiting">
          <h3 className="text-sm font-medium">{c("좌석 대기", "Waiting for a seat")}</h3>
          <p className="text-xs text-muted">
            {c(
              "수락했지만 남은 좌석이 없어 배정되지 않았습니다. 좌석을 추가한 뒤 이용권 화면에서 배정하세요.",
              "Accepted, but no seat was free. Add a seat, then assign it on the licences page.",
            )}{" "}
            <Link className="underline" href={`/dashboard/workspaces/${id}/licences`}>
              {c("이용권 화면", "Licences")}
            </Link>
          </p>
          <ul className="divide-y divide-border">
            {waiting.map((row) => (
              <li key={row.id} className="break-all py-3 text-sm">
                {row.email}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
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
