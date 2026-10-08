"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOverlayState } from "@heroui/react";
import { ArrowDown, ArrowUp, ChevronRight, Eye, PenLine, Plus } from "lucide-react";
import {
  b2bService,
  type ChangeAffiliation,
  type ChangeTeamMember,
  type LicenceOverview,
  type TeamPeople,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  KeyValues,
  primaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import {
  ago,
  Avatar,
  FilterSelect,
  rowClass,
  SearchField,
  SegmentTabs,
  Sheet,
  tableClass,
  Tag,
  tdClass,
  thClass,
} from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { RecoverLead } from "./recover-lead";
import { RecoverSteward } from "./file-stewards";
import { InvitationPanel } from "./invitations";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

/**
 * Team members, laid out like Figma's People admin (2026-10-08): who is on
 * the team, what seat they hold and when they were last around, in one table.
 * Everything you can change about a person opens from their row.
 */
type Tab = "people" | "invites" | "recovery";
type RoleFilter = "all" | "owner" | "admin" | "editor" | "reviewer" | "external";
type SeatFilter = "all" | "edit" | "view";
type ActiveFilter = "all" | "7" | "30" | "stale";

export function TeamMembers() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const [roster, setRoster] = useState<TeamPeople | null>(null);
  const [licences, setLicences] = useState<LicenceOverview | null>(null);
  // "Last active" filters compare against when the roster was read.
  const [readAt, setReadAt] = useState(0);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("people");
  const [invites, setInvites] = useState(0);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("all");
  const [seat, setSeat] = useState<SeatFilter>("all");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [desc, setDesc] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const inviteDialog = useOverlayState();
  const sequence = useRef(0);
  const id = data.workspace.id;
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [result, seats] = await Promise.all([
        b2bService.members(id),
        // Seat column only; the table still renders when it is unreadable.
        b2bService.licences(id).catch(() => null),
      ]);
      if (request !== sequence.current) return;
      setRoster(result);
      setLicences(seats);
      setReadAt(Date.now());
      setError("");
    } catch (e) {
      if (request !== sequence.current) return;
      setRoster(null);
      setError(errorCode(e));
    }
  }, [id]);
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

  // Who holds an editing seat in the period running now.
  const current = licences?.periods.find((p) => p.state === "active");
  const editors = useMemo(() => {
    const period = licences?.periods.find((p) => p.state === "active");
    return new Set(
      (licences?.assignments ?? [])
        .filter(
          (a) =>
            a.periodId === period?.id &&
            !a.closedAt &&
            (a.state === "active" || a.state === "revoking"),
        )
        .map((a) => a.userId),
    );
  }, [licences]);

  if (!b2b?.enrolled || !b2b.allowedActions.manage)
    return <B2bError code="B2B_TEAM_MANAGER_REQUIRED" />;
  if (b2b.team.currentState === "preparing")
    return <B2bError code="B2B_TEAM_PREPARING" />;
  const editable = b2b.team.currentState === "active";
  const people = roster?.people ?? [];
  const day = 86_400_000;
  const shown = people
    .filter((p) => {
      const q = query.trim().toLowerCase();
      if (q && !`${p.name ?? ""} ${p.email}`.toLowerCase().includes(q)) return false;
      if (role === "external" ? p.kind !== "external" : role !== "all" && p.role !== role) return false;
      if (seat !== "all" && (seat === "edit") !== editors.has(p.userId)) return false;
      if (active !== "all") {
        const at = p.lastActiveAt ? Date.parse(p.lastActiveAt) : 0;
        const within = readAt - at <= Number(active === "stale" ? 30 : active) * day;
        if (active === "stale" ? within : !within) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const order = (a.name || a.email).localeCompare(b.name || b.email, lang);
      return desc ? -order : order;
    });
  const selected = people.find((p) => p.userId === open) ?? null;
  const owner = data.role === "owner";

  return (
    <TeamShell
      title={c("멤버", "People")}
      actions={
        roster && (
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-3 text-[13px] sm:flex">
              <span className="inline-flex items-center gap-1.5" title={c("편집 좌석 · 사용/구매", "Editing seats · used/bought")}>
                <span className="tabular-nums">
                  {editors.size}
                  {current && <span className="text-muted">/{current.capacity}</span>}
                </span>
                <PenLine size={15} strokeWidth={1.75} className="text-muted" aria-label={c("편집", "Edit")} />
              </span>
              <span className="inline-flex items-center gap-1.5" title={c("보기·검토만", "View and review only")}>
                <span className="tabular-nums">{people.length - editors.size}</span>
                <Eye size={15} strokeWidth={1.75} className="text-muted" aria-label={c("보기", "View")} />
              </span>
            </span>
            {editable && (
              <button className={primaryClass} onClick={inviteDialog.open}>
                <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
                {c("초대", "Invite")}
              </button>
            )}
          </div>
        )
      }
    >
      {error && <B2bError code={error} retry={() => void load()} />}
      {!roster ? (
        !error && <TeamLoading />
      ) : (
        <div className="space-y-6">
          <SegmentTabs
            label={c("멤버 보기", "People views")}
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "people", label: c("멤버", "People") },
              {
                value: "invites",
                label: (
                  <>
                    {c("초대", "Invitations")}
                    {invites > 0 && <span className="ml-1.5 tabular-nums text-muted">{invites}</span>}
                  </>
                ),
              },
              ...(owner ? [{ value: "recovery" as const, label: c("복구", "Recovery") }] : []),
            ]}
          />

          {/* Panels stay mounted, so a half-typed recovery survives a trip
              to the table and back. */}
          <div hidden={tab !== "people"} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SearchField
                value={query}
                onChange={setQuery}
                label={c("멤버 검색", "Search people")}
                placeholder={c("이름·이메일 검색…", "Search people…")}
              />
              <div className="flex flex-wrap gap-2">
                <FilterSelect
                  label={c("역할", "Role")}
                  value={role}
                  onChange={setRole}
                  options={[
                    { value: "all", label: c("전체", "All") },
                    { value: "owner", label: c("소유자", "Owner") },
                    { value: "admin", label: c("관리자", "Admin") },
                    { value: "editor", label: c("제작", "Editor") },
                    { value: "reviewer", label: c("검토", "Reviewer") },
                    { value: "external", label: c("외부", "External") },
                  ]}
                />
                <FilterSelect
                  label={c("좌석", "Seat")}
                  value={seat}
                  onChange={setSeat}
                  options={[
                    { value: "all", label: c("전체", "All") },
                    { value: "edit", label: c("편집", "Edit") },
                    { value: "view", label: c("보기", "View") },
                  ]}
                />
                <FilterSelect
                  label={c("최근 활동", "Last active")}
                  value={active}
                  onChange={setActive}
                  options={[
                    { value: "all", label: c("전체", "All time") },
                    { value: "7", label: c("7일 이내", "Last 7 days") },
                    { value: "30", label: c("30일 이내", "Last 30 days") },
                    { value: "stale", label: c("30일 넘음", "Over 30 days") },
                  ]}
                />
              </div>
            </div>
            <div>
              <table className={`${tableClass} table-fixed`}>
                <thead>
                  <tr>
                    <th className={thClass}>
                      <button
                        type="button"
                        onClick={() => setDesc((v) => !v)}
                        className="inline-flex items-center gap-1 font-medium text-foreground"
                        aria-label={c("이름 정렬", "Sort by name")}
                      >
                        {c("이름", "Name")}
                        {desc ? <ArrowDown size={13} aria-hidden="true" /> : <ArrowUp size={13} aria-hidden="true" />}
                      </button>
                    </th>
                    <th className={`${thClass} hidden w-[28%] whitespace-nowrap sm:table-cell`}>{c("좌석", "Seat")}</th>
                    <th className={`${thClass} hidden w-[24%] whitespace-nowrap md:table-cell`}>{c("최근 활동", "Last active")}</th>
                    <th className={`${thClass} w-10`}>
                      <span className="sr-only">{c("열기", "Open")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const edit = editors.has(p.userId);
                    return (
                      <tr key={p.userId} className={rowClass} onClick={() => setOpen(p.userId)}>
                        <td className={tdClass}>
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar id={p.userId} name={p.name || p.email} />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  className="truncate text-left font-medium outline-none focus-visible:underline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpen(p.userId);
                                  }}
                                >
                                  {p.name || p.email}
                                </button>
                                {p.userId === data.currentUserId && <span className="text-muted">{c("(나)", "(You)")}</span>}
                                <PersonTags person={p} />
                              </div>
                              <p className="truncate text-xs text-muted">{p.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className={`${tdClass} hidden whitespace-nowrap sm:table-cell`}>
                          <span className="inline-flex items-center gap-2">
                            <span className="grid size-7 place-items-center rounded-md bg-surface-secondary">
                              {edit ? (
                                <PenLine size={14} strokeWidth={1.75} aria-hidden="true" />
                              ) : (
                                <Eye size={14} strokeWidth={1.75} aria-hidden="true" />
                              )}
                            </span>
                            {edit ? c("편집", "Edit") : c("보기", "View")}
                          </span>
                        </td>
                        <td className={`${tdClass} hidden whitespace-nowrap text-muted md:table-cell`}>{ago(p.lastActiveAt, lang)}</td>
                        <td className={`${tdClass} text-right text-muted`}>
                          <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="ml-auto" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {shown.length === 0 && (
                <p className="py-10 text-center text-[13px] text-muted">
                  {c("조건에 맞는 멤버가 없습니다.", "No one matches these filters.")}
                </p>
              )}
            </div>
          </div>

          <div hidden={tab !== "invites"}>
            <InvitationPanel editable={editable} dialog={inviteDialog} onCount={setInvites} />
          </div>

          {owner && (
            <div hidden={tab !== "recovery"} className="space-y-8">
              <RecoverLead people={people} />
              <RecoverSteward />
            </div>
          )}
        </div>
      )}
      {selected && roster && (
        <MemberSheet
          person={selected}
          roster={roster}
          seat={editors.has(selected.userId)}
          licences={editable ? licences : null}
          onSaved={load}
          onClose={() => setOpen(null)}
        />
      )}
    </TeamShell>
  );
}

function PersonTags({ person: p }: { person: TeamPerson }) {
  const c = useCopy();
  return (
    <>
      {p.role === "owner" && <Tag>{c("소유자", "Owner")}</Tag>}
      {p.role === "admin" && <Tag>{c("관리자", "Admin")}</Tag>}
      {p.role === "reviewer" && <Tag>{c("검토", "Reviewer")}</Tag>}
      {p.kind === "external" && <Tag>{c("외부", "External")}</Tag>}
      {p.billingAllowed && p.role !== "owner" && <Tag>{c("결제 권한", "Billing")}</Tag>}
      {p.suspendedAt && <Tag tone="danger">{c("참여 정지", "Suspended")}</Tag>}
      {p.accountUnavailable && <Tag tone="danger">{c("계정 사용 불가", "Account unavailable")}</Tag>}
    </>
  );
}

function MemberSheet({
  person,
  roster,
  seat,
  licences,
  onSaved,
  onClose,
}: {
  person: TeamPerson;
  roster: TeamPeople;
  seat: boolean;
  licences: LicenceOverview | null;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const name = person.name || person.email;
  const manage =
    person.role !== "owner" &&
    person.userId !== data.currentUserId &&
    (data.role === "owner" || person.role !== "admin");
  const affiliation = roster.canDelegateBilling && person.role !== "owner" && !person.suspendedAt;
  const roleLabel = {
    owner: c("소유자", "Owner"),
    admin: c("팀 관리자", "Team administrator"),
    editor: c("팀 참여자 · 제작", "Team participant · Production"),
    reviewer: c("팀 참여자 · 검토", "Team participant · Review"),
  }[person.role];
  return (
    <Sheet title={name} onClose={onClose}>
      <div className="flex items-center gap-3">
        <Avatar id={person.userId} name={name} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[15px] font-medium">{name}</p>
            <PersonTags person={person} />
          </div>
          <p className="truncate text-[13px] text-muted">{person.email}</p>
        </div>
      </div>
      <KeyValues
        items={[
          [c("역할", "Role"), roleLabel],
          [c("구분", "Affiliation"), person.kind === "external" ? c("외부 참여자", "External collaborator") : c("내부 참여자", "Internal participant")],
          ...(person.billingAllowed !== undefined
            ? ([[c("결제", "Billing"), person.billingAllowed ? c("결제 권한 있음", "Billing permission") : c("결제 권한 없음", "No billing permission")]] as [string, string][])
            : []),
          [
            c("좌석", "Seat"),
            <span key="seat" className="inline-flex flex-wrap items-center gap-x-3">
              {seat ? c("편집 좌석", "Editing seat") : c("보기·검토만", "View and review only")}
              {licences && <SeatToggle key={person.revision} person={person} licences={licences} onSaved={onSaved} />}
            </span>,
          ],
          [c("최근 활동", "Last active"), ago(person.lastActiveAt, lang)],
        ]}
      />
      {manage && <MemberActionEditor key={`a:${person.revision}:${person.suspendedAt}`} person={person} onSaved={onSaved} />}
      {affiliation && <AffiliationEditor key={`b:${person.revision}`} person={person} onSaved={onSaved} />}
    </Sheet>
  );
}

const occupying = ["active", "scheduled", "revoking"];
/**
 * A seat is one switch on the person (2026-10-08): 배정 takes a free seat in
 * every purchased period still to run, 해제 releases each one they hold. The
 * per-period, scheduled and device-wait detail stays on /licences, which no
 * longer has a nav entry.
 */
function SeatToggle({
  person,
  licences,
  onSaved,
}: {
  person: TeamPerson;
  licences: LicenceOverview;
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = Date.parse(licences.serverTime);
  const periods = licences.periods.filter(
    (p) => ["active", "future"].includes(p.state) && Date.parse(p.endsAt) > now,
  );
  const mine = licences.assignments.filter(
    (a) => a.userId === person.userId && periods.some((p) => p.id === a.periodId),
  );
  const held = mine.filter((a) => a.state === "active" || a.state === "scheduled");
  const open = periods.filter(
    (p) =>
      !mine.some((a) => a.periodId === p.id && occupying.includes(a.state)) &&
      licences.assignments.filter((a) => a.periodId === p.id && occupying.includes(a.state)).length < p.capacity,
  );
  const releasing = !held.length && mine.some((a) => a.state === "revoking");
  if (releasing) return <span className="text-muted">{c("해제 중", "Releasing")}</span>;
  const assign = !held.length;
  if (assign && (!open.length || person.suspendedAt || person.accountUnavailable))
    return !periods.length || person.suspendedAt || person.accountUnavailable ? null : (
      <span className="text-muted">{c("남은 좌석 없음", "No free seat")}</span>
    );
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      // One request per period; a refresh shows whatever landed.
      for (const p of assign ? open : [])
        await b2bService.assignLicence(data.workspace.id, { requestKey: crypto.randomUUID(), periodId: p.id, userId: person.userId });
      for (const a of assign ? [] : held)
        await b2bService.revokeLicence(data.workspace.id, a.id, {
          requestKey: crypto.randomUUID(),
          revision: a.revision,
          reason: "멤버 화면에서 좌석 해제",
        });
    } catch (e) {
      setError(errorCode(e));
    } finally {
      setBusy(false);
      await onSaved();
    }
  };
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="text-muted underline underline-offset-2 hover:text-foreground disabled:opacity-60"
      >
        {assign ? c("좌석 배정", "Give a seat") : c("좌석 해제", "Release seat")}
      </button>
      {error && <B2bError code={error} />}
    </>
  );
}

function AffiliationEditor({
  person,
  onSaved,
}: {
  person: TeamPerson;
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const pending = useRef<ChangeAffiliation | null>(null);
  const [kind, setKind] = useState(person.kind);
  const [billing, setBilling] = useState(person.billingAllowed ?? false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3 border-t border-border pt-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        pending.current ??= {
          requestKey: crypto.randomUUID(),
          revision: person.revision,
          kind,
          billingAllowed: billing,
          reason: reason.trim(),
        };
        setBusy(true);
        setError("");
        try {
          await b2bService.changeAffiliation(data.workspace.id, person.userId, pending.current);
          pending.current = null;
          setReason("");
          await onSaved();
        } catch (e) {
          setError(errorCode(e));
          if (freeIntent(pending.current, e)) pending.current = null;
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-[13px] font-medium">{c("참여 구분·결제 권한 변경", "Change affiliation and billing permission")}</h3>
      <label className="block space-y-1.5 text-[13px]">
        <span>{c("참여 구분", "Affiliation")}</span>
        <select
          aria-label={c("참여 구분", "Affiliation")}
          className={inputClass}
          disabled={busy || !!pending.current}
          value={kind}
          onChange={(e) => setKind(e.target.value as TeamPerson["kind"])}
        >
          <option value="internal">{c("내부 참여자", "Internal participant")}</option>
          <option value="external">{c("외부 참여자", "External collaborator")}</option>
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-3 text-[13px] sm:min-h-9">
        <input
          type="checkbox"
          checked={billing}
          disabled={busy || !!pending.current}
          onChange={(e) => setBilling(e.target.checked)}
        />
        {c("결제 권한 위임", "Delegate billing permission")}
      </label>
      <label className="block space-y-1.5 text-[13px]">
        <span>{c("변경 사유", "Reason for change")}</span>
        <textarea
          aria-label={c("변경 사유", "Reason for change")}
          className={inputClass}
          required
          maxLength={1000}
          value={reason}
          disabled={busy || !!pending.current}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {error && <B2bError code={error} />}
      <button className={primaryClass} disabled={busy || !reason.trim()}>
        {busy ? c("저장 중…", "Saving…") : c("권한 변경 저장", "Save permissions")}
      </button>
    </form>
  );
}

function MemberActionEditor({
  person,
  onSaved,
}: {
  person: TeamPerson;
  onSaved: () => Promise<void>;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const pending = useRef<ChangeTeamMember | null>(null);
  const [action, setAction] = useState<ChangeTeamMember["action"]>(person.suspendedAt ? "reactivate" : "reviewer");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="space-y-3 border-t border-border pt-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        pending.current ??= {
          requestKey: crypto.randomUUID(),
          revision: person.revision,
          action,
          reason: reason.trim(),
        };
        setBusy(true);
        setError("");
        try {
          await b2bService.changeTeamMember(data.workspace.id, person.userId, pending.current);
          pending.current = null;
          setReason("");
          await onSaved();
        } catch (e) {
          setError(errorCode(e));
          if (freeIntent(pending.current, e)) pending.current = null;
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="text-[13px] font-medium">{c("팀 역할·참여 관리", "Manage team role and participation")}</h3>
      <label className="block space-y-1.5 text-[13px]">
        <span>{c("참여 변경", "Participation change")}</span>
        <select
          aria-label={c("참여 변경", "Participation change")}
          className={inputClass}
          value={action}
          disabled={busy || !!pending.current}
          onChange={(e) => setAction(e.target.value as ChangeTeamMember["action"])}
        >
          <option value="reviewer">{c("팀 참여자 · 검토", "Team participant · Review")}</option>
          <option value="editor">{c("팀 참여자 · 제작", "Team participant · Production")}</option>
          {data.role === "owner" && person.kind === "internal" && (
            <option value="admin">{c("팀 관리자", "Team administrator")}</option>
          )}
          {person.suspendedAt ? (
            <option value="reactivate">{c("팀 참여 다시 활성화", "Reactivate team participation")}</option>
          ) : (
            <option value="suspend">{c("팀 참여 정지", "Suspend team participation")}</option>
          )}
          <option value="remove">{c("팀에서 제거", "Remove from team")}</option>
        </select>
      </label>
      <label className="block space-y-1.5 text-[13px]">
        <span>{c("참여 변경 사유", "Reason for participation change")}</span>
        <textarea
          aria-label={c("참여 변경 사유", "Reason for participation change")}
          className={inputClass}
          required
          maxLength={1000}
          disabled={busy || !!pending.current}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="text-xs leading-5 text-muted">
        {c(
          "정지·제거는 즉시 접근을 회수하며, 다시 활성화해도 이전 폴더·결제 권한은 복구되지 않습니다.",
          "Suspension and removal revoke access at once; reactivation does not restore folder or billing grants.",
        )}
      </p>
      {error && <B2bError code={error} />}
      <button className={primaryClass} disabled={busy || !reason.trim()}>
        {busy ? c("변경 중…", "Updating…") : c("참여 변경 확인", "Confirm participation change")}
      </button>
    </form>
  );
}
