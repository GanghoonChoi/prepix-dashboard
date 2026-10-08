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
  Block,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

/**
 * Inviting, the Figma way (2026-10-08): an email and a role, nothing else.
 *
 * - Team: 편집자 (edits in the app, takes a seat), 뷰어 (watches and
 *   comments, free) or, for the owner, 관리자. The seat follows the role.
 * - Project: someone outside the team joins this one project as 편집자 or
 *   뷰어; an editor may download, a viewer may not.
 */
export type TeamInviteRole = "editor" | "reviewer" | "admin";

export function InviteForm({
  projectId,
  onSent,
}: {
  projectId?: string;
  onSent: () => void | Promise<void>;
}) {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const id = data.workspace.id;
  const canBill = !!b2b?.enrolled && b2b.allowedActions.billing;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamInviteRole>("editor");
  // A project invite reaches someone outside the team (a guest) or a
  // teammate who is not in this private project yet.
  const [kind, setKind] = useState<ParticipationKind>("external");
  const seats = useSeats(id, !projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ hash: string; key: string } | null>(null);
  const viewer = role === "reviewer";
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const input = {
          email: email.trim(),
          kind: projectId ? kind : ("internal" as const),
          teamRole: projectId && role === "admin" ? ("editor" as const) : role,
          projectId,
          projectRole: projectId ? (viewer ? ("reviewer" as const) : ("producer" as const)) : undefined,
          canDownload: !!projectId && !viewer,
          assignSeat: projectId ? undefined : !viewer,
        };
        const hash = JSON.stringify(input);
        // A retry after a lost response sends the same intent again.
        if (pending.current?.hash !== hash) pending.current = { hash, key: crypto.randomUUID() };
        setBusy(true);
        setError("");
        try {
          await b2bService.issueInvitation(id, { ...input, requestKey: pending.current.key });
          pending.current = null;
          setEmail("");
          await onSent();
        } catch (e) {
          setError(errorCode(e));
          if (freeIntent(pending.current, e)) pending.current = null;
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="block min-w-0 flex-1 basis-56 space-y-1.5 text-[13px]">
          <span>{c("초대 이메일", "Invitation email")}</span>
          <input
            className={inputClass}
            type="email"
            required
            maxLength={254}
            placeholder="name@company.com"
            disabled={busy}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {projectId && (
          <label className="block w-36 space-y-1.5 text-[13px]">
            <span>{c("참여 구분", "Affiliation")}</span>
            <select
              aria-label={c("참여 구분", "Affiliation")}
              className={inputClass}
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value as ParticipationKind)}
            >
              <option value="external">{c("외부 게스트", "Guest")}</option>
              <option value="internal">{c("팀 멤버", "Teammate")}</option>
            </select>
          </label>
        )}
        <label className="block w-32 space-y-1.5 text-[13px]">
          <span>{c("초대 역할", "Invitation role")}</span>
          <select
            aria-label={c("초대 역할", "Invitation role")}
            className={inputClass}
            disabled={busy}
            value={role}
            onChange={(e) => setRole(e.target.value as TeamInviteRole)}
          >
            <option value="editor">{c("편집자", "Editor")}</option>
            <option value="reviewer">{c("뷰어", "Viewer")}</option>
            {!projectId && data.role === "owner" && <option value="admin">{c("관리자", "Admin")}</option>}
          </select>
        </label>
        <button className={primaryClass} disabled={busy || !email.trim()}>
          {busy ? c("보내는 중…", "Sending…") : c("초대 보내기", "Send invitation")}
        </button>
      </div>
      <p className="text-xs leading-5 text-muted" data-testid="invite-seat-info">
        {viewer
          ? c("뷰어는 보고 코멘트만 합니다. 좌석이 필요 없어 무료입니다.", "Viewers watch and comment. They take no seat, so they are free.")
          : projectId
            ? c("이 프로젝트에 참여합니다. 편집자는 자료를 올리고 받을 수 있습니다.", "They join this project. Editors can upload and download.")
            : seats && seats.free > 0
              ? c(`편집 좌석을 씁니다 · 남은 좌석 ${seats.free}/${seats.capacity}석`, `Takes an editing seat · ${seats.free} of ${seats.capacity} free`)
              : c("편집 좌석을 씁니다 · 남은 좌석이 없으면 자리가 날 때까지 대기합니다.", "Takes an editing seat · waits if none is free.")}
        {!viewer && !projectId && seats?.free === 0 && canBill && (
          <>
            {" "}
            <Link className="underline" href={`/dashboard/workspaces/${id}/plan`}>
              {c("좌석 추가", "Add a seat")}
            </Link>
          </>
        )}
      </p>
      {error && <B2bError code={error} />}
    </form>
  );
}

/** Where an invitation stands, in a few words. */
export function useInvitationStatus() {
  const c = useCopy();
  // Held comes first: a held invitation's week starts at payment, so its
  // stored expiry says nothing yet.
  return (row: Invitation) =>
    row.deliveryState === "held"
      ? c("결제 후 발송", "Sent after payment")
      : new Date(row.expiresAt).getTime() <= Date.now()
        ? c("초대 만료", "Expired")
        : row.deliveryState === "failed"
          ? c("메일 발송 실패", "Email failed")
          : c("수락 대기", "Awaiting acceptance");
}

/** Resend or cancel, one click each: the audit trail names the action. */
export async function changeInvitation(
  workspaceId: string,
  row: Pick<Invitation, "id" | "revision">,
  action: "resend" | "revoke",
) {
  await b2bService.changeInvitation(workspaceId, row.id, action, {
    requestKey: crypto.randomUUID(),
    revision: row.revision,
    reason: action === "resend" ? "초대 다시 보내기" : "초대 취소",
  });
}

/** A project's invitations, inline on its people page. */
export function InvitationPanel({
  projectId,
  editable,
}: {
  projectId: string;
  editable: boolean;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const status = useInvitationStatus();
  const id = data.workspace.id;
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const act = async (row: Invitation, action: "resend" | "revoke") => {
    setBusy(true);
    setError("");
    try {
      await changeInvitation(id, row, action);
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
      await load();
    }
  };
  return (
    <Block title={c("프로젝트 초대", "Project invitations")}>
      {editable && <InviteForm projectId={projectId} onSent={load} />}
      {error && <B2bError code={error} />}
      {live.length > 0 && (
        <ul className="divide-y divide-border">
          {live.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">{row.email}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {row.projectRole === "reviewer" ? c("뷰어", "Viewer") : c("편집자", "Editor")} · {status(row)}
                </p>
              </div>
              {editable && (
                <div className="flex gap-2">
                  {row.deliveryState !== "held" && (
                    <button className={secondaryClass} disabled={busy} onClick={() => void act(row, "resend")}>
                      {c("다시 보내기", "Resend")}
                    </button>
                  )}
                  <button className={secondaryClass} disabled={busy} onClick={() => void act(row, "revoke")}>
                    {c("초대 취소", "Cancel invitation")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

/** Free seats in the current paid period, for the team invite form. Null
 * when unknown (no purchase yet, or not readable). */
function useSeats(id: string, enabled: boolean) {
  const [seats, setSeats] = useState<{ free: number; capacity: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void b2bService
      .licences(id)
      .then((overview) => {
        const now = Date.parse(overview.serverTime);
        const period = overview.periods.find(
          (p) => p.state === "active" && Date.parse(p.startsAt) <= now && Date.parse(p.endsAt) > now,
        );
        if (!alive || !period) return;
        const taken = overview.assignments.filter(
          (a) => a.periodId === period.id && ["active", "scheduled", "revoking"].includes(a.state),
        ).length;
        setSeats({ free: Math.max(0, period.capacity - taken), capacity: period.capacity });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, enabled]);
  return seats;
}
