"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Mail, PenLine, Plus } from "lucide-react";
import {
  b2bService,
  type ChangeTeamMember,
  type Invitation,
  type TeamPeople,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  ConfirmDialog,
  Details,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { Dialog } from "@/components/dialog";
import {
  ago,
  Avatar,
  SearchField,
  tableClass,
  Tag,
  tdClass,
  thClass,
} from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { AddSeats } from "./add-seats";
import { RecoverLead } from "./recover-lead";
import { changeInvitation, InviteForm, useInvitationStatus } from "./invitations";
import { B2bError, errorCode, useCopy } from "./shared";

/**
 * 멤버, the way Figma's people list works (2026-10-08): one table of who is
 * on the team and who is invited. A role is changed where it is shown; the
 * row's menu holds the rest. No tabs, no filters beyond a search, and no
 * reason to type — the audit trail names the action itself.
 *
 * 멤버 = 좌석 = 결제 (2026-10-08): every member but a viewer holds a paid
 * seat, like Figma. There is no seat column; a member short of one says so,
 * and whoever can pay buys the rest of the month right here.
 */
export function TeamMembers() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const status = useInvitationStatus();
  const [roster, setRoster] = useState<TeamPeople | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  // Two errors: the list failing to load, and an action failing. A reread
  // after a failed action must not wipe what went wrong.
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<TeamPerson | null>(null);
  const invite = useOverlayState();
  const buy = useOverlayState();
  const sequence = useRef(0);
  const id = data.workspace.id;
  const manager = !!b2b?.enrolled && b2b.allowedActions.manage;
  const load = useCallback(async () => {
    // A refused page sends nothing: no roster read, no 30s poll of 403s.
    if (!manager) return null;
    const request = ++sequence.current;
    try {
      const [people, invitations] = await Promise.all([
        b2bService.members(id),
        b2bService.invitations(id),
      ]);
      if (request !== sequence.current) return null;
      setRoster(people);
      setInvites(invitations.invitations.filter((i) => !i.acceptedAt && !i.revokedAt && !i.projectId));
      setLoadError("");
      return people;
    } catch (e) {
      if (request !== sequence.current) return null;
      setRoster(null);
      setLoadError(errorCode(e));
      return null;
    }
  }, [id, manager]);
  useEffect(() => {
    const requests = sequence;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      requests.current++;
    };
  }, [load]);

  if (!b2b?.enrolled || !b2b.allowedActions.manage)
    return <B2bError code="B2B_TEAM_MANAGER_REQUIRED" />;
  if (b2b.team.currentState === "preparing")
    return <B2bError code="B2B_TEAM_PREPARING" />;
  const editable = b2b.team.currentState === "active";
  const owner = data.role === "owner";
  const canBill = b2b.allowedActions.billing;
  const people = roster?.people ?? [];
  const seats = roster?.seats;
  const q = query.trim().toLowerCase();
  const match = (text: string) => !q || text.toLowerCase().includes(q);
  const rank = { owner: 0, admin: 1, editor: 2, reviewer: 3 } as const;
  const shown = people
    .filter((p) => match(`${p.name ?? ""} ${p.email}`))
    .sort((a, b) => rank[a.role] - rank[b.role] || (a.name || a.email).localeCompare(b.name || b.email, lang));
  const pending = invites.filter((i) => match(i.email));

  const run = async (work: () => Promise<unknown>) => {
    if (busy) return null;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
    }
    return load();
  };
  const change = (p: TeamPerson, action: ChangeTeamMember["action"], reason: string) =>
    b2bService.changeTeamMember(id, p.userId, {
      requestKey: crypto.randomUUID(),
      revision: p.revision,
      action,
      reason,
    });
  const turnOnSeat = (p: TeamPerson) =>
    b2bService.setSeat(id, p.userId, { requestKey: crypto.randomUUID(), editing: true });
  const setRole = async (p: TeamPerson, next: "admin" | "editor" | "reviewer") => {
    const after = await run(async () => {
      await change(p, next, "역할 변경");
      // The seat follows the role: someone who now edits wants one.
      if (next !== "reviewer" && (p.seat ?? "none") === "none") await turnOnSeat(p);
    });
    // Short of a seat now: offer to pay for it at once.
    if (next !== "reviewer" && canBill && after?.seats?.waiting) buy.open();
  };
  // The owner cannot be changed here, nor can you change yourself, and only
  // the owner manages admins (the server enforces all three).
  const manageable = (p: TeamPerson) =>
    editable &&
    p.role !== "owner" &&
    p.userId !== data.currentUserId &&
    (owner || p.role !== "admin");

  return (
    <TeamShell
      title={c("멤버", "People")}
      actions={
        roster && (
          <div className="flex items-center gap-4">
            {seats && (
              <span className="hidden items-center gap-3 text-[13px] sm:flex">
                <span className="inline-flex items-center gap-1.5" title={c("좌석 · 사용/구매 (뷰어는 무료)", "Seats · used/bought (viewers are free)")}>
                  <PenLine size={15} strokeWidth={1.75} className="text-muted" aria-hidden="true" />
                  <span className="tabular-nums">
                    {seats.assigned}
                    <span className="text-muted">/{seats.capacity}</span>
                  </span>
                </span>
              </span>
            )}
            {editable && (
              <button className={primaryClass} onClick={invite.open}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("초대", "Invite")}
              </button>
            )}
          </div>
        )
      }
    >
      {loadError && <B2bError code={loadError} retry={() => void load()} />}
      {error && <B2bError code={error} />}
      {!roster ? (
        !loadError && <TeamLoading />
      ) : (
        <div className="space-y-3">
          {!!seats?.waiting && (
            <div
              role="status"
              data-testid="seat-shortage"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-secondary px-4 py-3 text-[13px] leading-5"
            >
              <p>
                {canBill
                  ? c(
                      `${seats.waiting}명이 좌석을 기다리고 있어요. 좌석을 추가하면 바로 편집할 수 있습니다.`,
                      `${seats.waiting} waiting for a seat. Add seats and they can edit right away.`,
                    )
                  : c(
                      `${seats.waiting}명이 좌석을 기다리고 있어요. 결제 권한이 있는 멤버에게 좌석 추가를 요청하세요.`,
                      `${seats.waiting} waiting for a seat. Ask someone with billing permission to add seats.`,
                    )}
              </p>
              {canBill && editable && (
                <button type="button" className={primaryClass} onClick={buy.open}>
                  {c(`좌석 ${seats.waiting}개 추가`, `Add ${seats.waiting} seat${seats.waiting > 1 ? "s" : ""}`)}
                </button>
              )}
            </div>
          )}
          <SearchField
            value={query}
            onChange={setQuery}
            label={c("멤버 검색", "Search people")}
            placeholder={c("이름·이메일 검색…", "Search people…")}
          />
          <table className={`${tableClass} table-fixed`}>
            <thead>
              <tr>
                <th className={thClass}>{c("이름", "Name")}</th>
                <th className={`${thClass} w-32`}>{c("역할", "Role")}</th>
                <th className={`${thClass} hidden w-28 md:table-cell`}>{c("최근 활동", "Last active")}</th>
                <th className={`${thClass} w-10`}>
                  <span className="sr-only">{c("작업", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.userId} data-person={p.email}>
                  <td className={tdClass}>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar id={p.userId} name={p.name || p.email} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{p.name || p.email}</span>
                          {p.userId === data.currentUserId && <span className="text-muted">{c("(나)", "(You)")}</span>}
                          {p.kind === "external" && <Tag>{c("외부", "Guest")}</Tag>}
                          {p.billingAllowed && p.role !== "owner" && <Tag>{c("결제 권한", "Billing")}</Tag>}
                          {p.seat === "waiting" && <Tag>{c("좌석 대기", "Waiting for seat")}</Tag>}
                          {p.suspendedAt && <Tag tone="danger">{c("정지됨", "Suspended")}</Tag>}
                          {p.accountUnavailable && <Tag tone="danger">{c("계정 사용 불가", "Account unavailable")}</Tag>}
                        </div>
                        <p className="truncate text-xs text-muted">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className={tdClass}>
                    {manageable(p) && !p.suspendedAt ? (
                      <select
                        aria-label={c(`${p.name || p.email} 역할`, `Role of ${p.name || p.email}`)}
                        className="w-full rounded-md border border-transparent bg-transparent py-1 pr-6 text-[13px] hover:border-border focus-visible:border-foreground/40 disabled:opacity-60"
                        value={p.role}
                        disabled={busy}
                        onChange={(e) => void setRole(p, e.target.value as "admin" | "editor" | "reviewer")}
                      >
                        {owner && p.kind === "internal" && <option value="admin">{c("관리자", "Admin")}</option>}
                        <option value="editor">{c("편집자", "Editor")}</option>
                        <option value="reviewer">{c("뷰어", "Viewer")}</option>
                      </select>
                    ) : (
                      <span className="text-muted">{c(...roleCopy[p.role])}</span>
                    )}
                  </td>
                  <td className={`${tdClass} hidden whitespace-nowrap text-muted md:table-cell`}>{ago(p.lastActiveAt, lang)}</td>
                  <td className={`${tdClass} text-right`}>
                    <RowMenu label={c(`${p.name || p.email} 작업`, `Actions for ${p.name || p.email}`)}>
                      {owner && roster.canDelegateBilling && p.role !== "owner" && !p.suspendedAt && (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() =>
                            void run(() =>
                              b2bService.changeAffiliation(id, p.userId, {
                                requestKey: crypto.randomUUID(),
                                revision: p.revision,
                                kind: p.kind,
                                billingAllowed: !p.billingAllowed,
                                reason: p.billingAllowed ? "결제 권한 회수" : "결제 권한 주기",
                              }),
                            )
                          }
                        >
                          {p.billingAllowed ? c("결제 권한 회수", "Remove billing permission") : c("결제 권한 주기", "Give billing permission")}
                        </RowMenuItem>
                      )}
                      {/* Someone whose seat was turned off before seats followed roles. */}
                      {manageable(p) && p.role !== "reviewer" && !p.suspendedAt && (p.seat ?? "none") === "none" && (
                        <RowMenuItem disabled={busy} onClick={() => void run(() => turnOnSeat(p))}>
                          {c("좌석 켜기", "Turn on seat")}
                        </RowMenuItem>
                      )}
                      {manageable(p) && p.suspendedAt && (
                        <RowMenuItem disabled={busy} onClick={() => void run(() => change(p, "reactivate", "다시 활성화"))}>
                          {c("다시 활성화", "Reactivate")}
                        </RowMenuItem>
                      )}
                      {manageable(p) && (
                        <RowMenuItem tone="danger" disabled={busy} onClick={() => setRemoving(p)}>
                          {c("팀에서 제거", "Remove from team")}
                        </RowMenuItem>
                      )}
                    </RowMenu>
                  </td>
                </tr>
              ))}
              {pending.map((row) => (
                <tr key={row.id} data-invitation={row.email}>
                  <td className={tdClass}>
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted">
                        <Mail size={14} strokeWidth={1.75} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{row.email}</span>
                          <Tag>{c("초대됨", "Invited")}</Tag>
                        </div>
                        <p className="truncate text-xs text-muted">
                          {status(row)} · {c("만료", "Expires")} {new Date(row.expiresAt).toLocaleDateString(lang)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className={`${tdClass} text-muted`}>
                    {c(...roleCopy[row.teamRole])}
                  </td>
                  <td className={`${tdClass} hidden md:table-cell`} />
                  <td className={`${tdClass} text-right`}>
                    {editable && (
                      <RowMenu label={c(`${row.email} 초대 작업`, `Invitation actions for ${row.email}`)}>
                        {row.deliveryState !== "held" && (
                          <RowMenuItem disabled={busy} onClick={() => void run(() => changeInvitation(id, row, "resend"))}>
                            {c("다시 보내기", "Resend")}
                          </RowMenuItem>
                        )}
                        <RowMenuItem tone="danger" disabled={busy} onClick={() => void run(() => changeInvitation(id, row, "revoke"))}>
                          {c("초대 취소", "Cancel invitation")}
                        </RowMenuItem>
                      </RowMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length + pending.length === 0 && (
            <p className="py-10 text-center text-[13px] text-muted">
              {c("검색과 맞는 사람이 없습니다.", "No one matches your search.")}
            </p>
          )}
          {/* A rare repair, out of the way: a project whose lead left. */}
          {owner && (
            <div className="pt-6">
              <Details summary={c("담당자 복구", "Restore a lead")}>
                <div className="text-foreground">
                  <RecoverLead people={people} />
                </div>
              </Details>
            </div>
          )}
        </div>
      )}
      <Dialog state={invite} title={c("멤버 초대", "Invite people")}>
        <InviteForm onSent={async () => void (await load())} />
      </Dialog>
      {canBill && !!seats?.waiting && (
        <AddSeats
          state={buy}
          workspaceId={id}
          userId={data.currentUserId ?? null}
          count={seats.waiting}
          onDone={() => void load()}
        />
      )}
      {removing && (
        <ConfirmDialog
          label={c("팀에서 제거", "Remove from team")}
          onClose={() => {
            if (!busy) setRemoving(null);
          }}
        >
          <p className="text-sm">
            {c(
              `${removing.name || removing.email}님이 팀과 모든 프로젝트에 접근할 수 없게 됩니다. 올린 자료와 코멘트는 남습니다.`,
              `${removing.name || removing.email} loses access to the team and every project. What they uploaded and wrote stays.`,
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() =>
                void run(() => change(removing, "remove", "팀에서 제거")).then(() => setRemoving(null))
              }
            >
              {c("제거", "Remove")}
            </button>
            <button type="button" className={secondaryClass} disabled={busy} onClick={() => setRemoving(null)}>
              {c("취소", "Cancel")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </TeamShell>
  );
}

const roleCopy: Record<TeamPerson["role"], [string, string]> = {
  owner: ["소유자", "Owner"],
  admin: ["관리자", "Admin"],
  editor: ["편집자", "Editor"],
  reviewer: ["뷰어", "Viewer"],
};
