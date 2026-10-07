"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useOverlayState } from "@heroui/react";
import { ChevronRight, Plus } from "lucide-react";
import {
  b2bService,
  type ChangeAffiliation,
  type ChangeTeamMember,
  type TeamPeople,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  inputClass,
  primaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { RecoverLead } from "./recover-lead";
import { RecoverSteward } from "./file-stewards";
import { InvitationPanel } from "./invitations";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

export function TeamMembers() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const [roster, setRoster] = useState<TeamPeople | null>(null);
  const [error, setError] = useState("");
  const inviteDialog = useOverlayState();
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await b2bService.members(data.workspace.id);
      if (request !== sequence.current) return;
      setRoster(result);
      setError("");
    } catch (e) {
      if (request !== sequence.current) return;
      setRoster(null);
      setError(errorCode(e));
    }
  }, [data.workspace.id]);
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
  return (
    <TeamShell
      title={c("팀 참여자", "Team participants")}
      actions={
        roster &&
        editable && (
          <button className={primaryClass} onClick={inviteDialog.open}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {c("초대", "Invite")}
          </button>
        )
      }
    >
      {error && <B2bError code={error} retry={() => void load()} />}
      {!roster ? (
        !error && <TeamLoading />
      ) : (
        <>
          {(["internal", "external"] as const).map((kind) => {
            const people = roster.people.filter((p) => p.kind === kind);
            if (!people.length) return null;
            return (
              <Block
                key={kind}
                title={
                  kind === "internal"
                    ? c("내부 참여자", "Internal participants")
                    : c("외부 참여자", "External collaborators")
                }
              >
                <ul className="divide-y divide-border">
                  {people.map((person) => {
                    const manage =
                      person.role !== "owner" &&
                      person.userId !== data.currentUserId &&
                      (data.role === "owner" || person.role !== "admin");
                    const affiliation =
                      roster.canDelegateBilling &&
                      person.role !== "owner" &&
                      !person.suspendedAt;
                    return (
                      <li key={person.userId} className="space-y-1 py-3">
                        <p className="break-all text-sm font-medium">
                          {person.name || person.email}
                        </p>
                        <p className="break-all text-xs text-muted">
                          {person.name ? `${person.email} · ` : ""}
                          {person.role === "owner"
                            ? c("소유자", "Owner")
                            : person.role === "admin"
                              ? c("팀 관리자", "Team administrator")
                              : c("팀 참여자", "Team participant")}
                          {person.suspendedAt
                            ? ` · ${c("참여 정지", "Suspended")}`
                            : ""}
                          {person.billingAllowed !== undefined
                            ? ` · ${person.billingAllowed ? c("결제 권한 있음", "Billing permission") : c("결제 권한 없음", "No billing permission")}`
                            : ""}
                        </p>
                        {(manage || affiliation) && (
                          <div className="flex flex-wrap gap-x-5">
                            {manage && (
                              <MemberActionEditor person={person} onSaved={load} />
                            )}
                            {affiliation && (
                              <AffiliationEditor
                                key={person.userId}
                                person={person}
                                onSaved={load}
                              />
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Block>
            );
          })}
          <InvitationPanel editable={editable} dialog={inviteDialog} />
          {data.role === "owner" && <RecoverLead people={roster.people} />}
          <RecoverSteward />
        </>
      )}
    </TeamShell>
  );
}

/** A row's editor: a quiet disclosure that takes the full row once open. */
function Editor({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group open:basis-full">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-[13px] text-muted transition-colors hover:text-foreground sm:min-h-9 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          className="transition-transform group-open:rotate-90"
        />
        {summary}
      </summary>
      {children}
    </details>
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
    <Editor
      summary={c(
        "참여 구분·결제 권한 변경",
        "Change affiliation and billing permission",
      )}
    >
      <form
        className="max-w-xl space-y-3 pb-2 pt-2"
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
            await b2bService.changeAffiliation(
              data.workspace.id,
              person.userId,
              pending.current,
            );
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
        <label className="block space-y-1.5 text-[13px]">
          <span>{c("참여 구분", "Affiliation")}</span>
          <select
            aria-label={c("참여 구분", "Affiliation")}
            className={inputClass}
            disabled={busy || !!pending.current}
            value={kind}
            onChange={(e) => setKind(e.target.value as TeamPerson["kind"])}
          >
            <option value="internal">
              {c("내부 참여자", "Internal participant")}
            </option>
            <option value="external">
              {c("외부 참여자", "External collaborator")}
            </option>
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
          {busy
            ? c("저장 중…", "Saving…")
            : c("권한 변경 저장", "Save permissions")}
        </button>
      </form>
    </Editor>
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
  const [action, setAction] = useState<ChangeTeamMember["action"]>(
    person.suspendedAt ? "reactivate" : "reviewer",
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Editor summary={c("팀 역할·참여 관리", "Manage team role and participation")}>
      <form
        className="max-w-xl space-y-3 pb-2 pt-2"
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
            await b2bService.changeTeamMember(
              data.workspace.id,
              person.userId,
              pending.current,
            );
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
        <label className="block space-y-1.5 text-[13px]">
          <span>{c("참여 변경", "Participation change")}</span>
          <select
            aria-label={c("참여 변경", "Participation change")}
            className={inputClass}
            value={action}
            disabled={busy || !!pending.current}
            onChange={(e) =>
              setAction(e.target.value as ChangeTeamMember["action"])
            }
          >
            <option value="reviewer">
              {c("팀 참여자 · 검토", "Team participant · Review")}
            </option>
            <option value="editor">
              {c("팀 참여자 · 제작", "Team participant · Production")}
            </option>
            {data.role === "owner" && person.kind === "internal" && (
              <option value="admin">
                {c("팀 관리자", "Team administrator")}
              </option>
            )}
            {person.suspendedAt ? (
              <option value="reactivate">
                {c("팀 참여 다시 활성화", "Reactivate team participation")}
              </option>
            ) : (
              <option value="suspend">
                {c("팀 참여 정지", "Suspend team participation")}
              </option>
            )}
            <option value="remove">
              {c("팀에서 제거", "Remove from team")}
            </option>
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
          {busy
            ? c("변경 중…", "Updating…")
            : c("참여 변경 확인", "Confirm participation change")}
        </button>
      </form>
    </Editor>
  );
}
