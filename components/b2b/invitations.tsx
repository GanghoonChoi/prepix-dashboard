"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  b2bService,
  type Invitation,
  type ParticipationKind,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { inputClass } from "@/components/workspaces/shared";
import { Button, Field, Select } from "@/components/ui";
import { parseEmails } from "@/lib/onboarding";
import { roleSummary } from "./team-roles";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

/**
 * Inviting, the Figma way (2026-10-08): emails and a role, nothing else.
 * Several addresses go in one field — typed with commas, or pasted from a
 * sheet or a mail client — and each gets its own invitation.
 *
 * - Team: 편집자 (edits in the app, takes a seat), 뷰어 (watches and
 *   comments, free) or, for the owner, 관리자. The seat follows the role.
 * - Project: someone outside the team joins this one project as 편집자 or
 *   뷰어; an editor may download, a viewer may not.
 */
export type TeamInviteRole = "editor" | "reviewer" | "admin";

export function InviteForm({
  projectId,
  autoSeats = false,
  onSent,
}: {
  projectId?: string;
  /** The team buys missing seats by itself (billing auto-seats). */
  autoSeats?: boolean;
  onSent: () => void | Promise<void>;
}) {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const id = data.workspace.id;
  const canBill = !!b2b?.enrolled && b2b.allowedActions.billing;
  const [text, setText] = useState("");
  const [role, setRole] = useState<TeamInviteRole>("editor");
  // A project invite reaches someone outside the team (a guest) or a
  // teammate who is not in this private project yet.
  const [kind, setKind] = useState<ParticipationKind>("external");
  const seats = useSeats(id, !projectId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(0);
  // One per address and intent: a retry after a lost response sends the same
  // request key again, so nobody is invited twice.
  const pending = useRef(new Map<string, { key: string }>());
  const viewer = role === "reviewer";
  const field = useId();
  const { emails, invalid } = parseEmails(text, "", []);
  const count = emails.length;
  // Seats beyond the free ones are the ones this batch adds.
  const extra = Math.max(0, count - (seats?.free ?? 0));
  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !count || invalid.length) return;
        setBusy(true);
        setError("");
        setSent(0);
        const refused: string[] = [];
        let firstError = "";
        for (const email of emails) {
          const input = {
            email,
            kind: projectId ? kind : ("internal" as const),
            teamRole: projectId && role === "admin" ? ("editor" as const) : role,
            projectId,
            projectRole: projectId ? (viewer ? ("reviewer" as const) : ("producer" as const)) : undefined,
            canDownload: !!projectId && !viewer,
            assignSeat: projectId ? undefined : !viewer,
          };
          const hash = JSON.stringify(input);
          const intent = pending.current.get(hash) ?? { key: crypto.randomUUID() };
          pending.current.set(hash, intent);
          try {
            await b2bService.issueInvitation(id, { ...input, requestKey: intent.key });
            pending.current.delete(hash);
          } catch (e) {
            refused.push(email);
            firstError ||= errorCode(e);
            if (freeIntent(intent, e)) pending.current.delete(hash);
          }
        }
        // What was refused stays in the field to fix and send again.
        setText(refused.join(", "));
        setError(firstError);
        setSent(count - refused.length);
        setBusy(false);
        if (refused.length < count) await onSent();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <Field
          label={c("초대 이메일", "Invitation email")}
          htmlFor={`${field}-email`}
          className="min-w-0 flex-1 basis-56"
          error={
            invalid.length > 0 &&
            c(`이메일 형식이 아닙니다: ${invalid.join(", ")}`, `Not an email: ${invalid.join(", ")}`)
          }
        >
          <input
            id={`${field}-email`}
            className={inputClass}
            type="text"
            inputMode="email"
            autoComplete="off"
            required
            placeholder={c("여러 명은 쉼표로 구분", "Separate several with commas")}
            aria-invalid={invalid.length > 0}
            disabled={busy}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSent(0);
            }}
          />
        </Field>
        {projectId && (
          <Field label={c("참여 구분", "Affiliation")} htmlFor={`${field}-kind`} className="w-36">
            <Select
              id={`${field}-kind`}
              aria-label={c("참여 구분", "Affiliation")}
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value as ParticipationKind)}
            >
              <option value="external">{c("외부 게스트", "Guest")}</option>
              <option value="internal">{c("팀 멤버", "Teammate")}</option>
            </Select>
          </Field>
        )}
        <Field label={c("초대 역할", "Invitation role")} htmlFor={`${field}-role`} className="w-32">
          <Select
            id={`${field}-role`}
            aria-label={c("초대 역할", "Invitation role")}
            disabled={busy}
            value={role}
            onChange={(e) => setRole(e.target.value as TeamInviteRole)}
          >
            <option value="editor">{c("편집자", "Editor")}</option>
            <option value="reviewer">{c("뷰어", "Viewer")}</option>
            {!projectId && data.role === "owner" && <option value="admin">{c("관리자", "Admin")}</option>}
          </Select>
        </Field>
        <Button type="submit" aria-busy={busy} disabled={busy || !count || invalid.length > 0}>
          {busy
            ? c("보내는 중…", "Sending…")
            : count > 1
              ? c(`${count}명 초대 보내기`, `Invite ${count} people`)
              : c("초대 보내기", "Send invitation")}
        </Button>
      </div>
      {count > 1 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={c("초대할 사람", "People to invite")}>
          {emails.map((email) => (
            <li key={email} className="rounded-md border border-border px-2 py-0.5 text-[13px] break-all">
              {email}
            </li>
          ))}
        </ul>
      )}
      {/* What the chosen role means, before the seat it costs. */}
      {!projectId && <p className="text-[13px] leading-5">{c(...roleSummary[role])}</p>}
      <p className="text-xs leading-5 text-muted" data-testid="invite-seat-info">
        {viewer
          ? c("뷰어는 보고 코멘트만 합니다. 좌석이 필요 없어 무료입니다.", "Viewers watch and comment. They take no seat, so they are free.")
          : projectId
            ? c("이 프로젝트에 참여합니다. 편집자는 자료를 올리고 받을 수 있습니다.", "They join this project. Editors can upload and download.")
            : seats && seats.free > 0 && extra === 0
              ? c(`좌석 ${Math.max(count, 1)}개를 씁니다 · 남은 좌석 ${seats.free}/${seats.capacity}석`, `Takes ${Math.max(count, 1)} seat${count > 1 ? "s" : ""} · ${seats.free} of ${seats.capacity} free`)
              : autoSeats
                ? c("멤버 추가 수에 맞춰 좌석이 추가됩니다 · 수락하면 이번 달 남은 기간만큼 자동결제 카드로 결제되고 바로 쓸 수 있습니다.", "Seats are added to match the people you add · once they accept, the rest of this month is charged to the renewal card and they start at once.")
                : canBill
                ? c("멤버 추가 수에 맞춰 좌석을 추가해야 합니다 · 수락하면 멤버 화면에서 이번 달 남은 기간만큼 결제하고 바로 쓸 수 있습니다.", "Add seats to match the people you add · once they accept, pay for the rest of this month on People and they start at once.")
                : c("멤버 추가 수에 맞춰 좌석이 필요합니다 · 남은 좌석이 없으면 결제 권한자가 좌석을 추가할 때까지 대기합니다.", "Each person you add needs a seat · without a free one they wait until someone with billing permission adds it.")}
      </p>
      {sent > 0 && (
        <p role="status" className="text-[13px]">
          {c(`${sent}명에게 초대를 보냈습니다.`, `Invited ${sent === 1 ? "1 person" : `${sent} people`}.`)}
        </p>
      )}
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
/**
 * A project's open invitations, polled, with resend and cancel — shown as
 * rows of the project's people table (like 멤버), the form in a dialog.
 */
export function useProjectInvitations(projectId: string, enabled: boolean) {
  const { data } = useWorkspace()!;
  const id = data.workspace.id;
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!enabled) return;
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
  }, [id, projectId, enabled]);
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
  return { live: rows.filter((row) => !row.acceptedAt && !row.revokedAt), error, busy, load, act };
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
