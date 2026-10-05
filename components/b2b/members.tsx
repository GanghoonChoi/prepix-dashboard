"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  b2bService,
  type ChangeAffiliation,
  type TeamPeople,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { InvitationPanel } from "./invitations";
import { B2bError, definitivelyRejected, errorCode, useCopy } from "./shared";

export function TeamMembers() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const [roster, setRoster] = useState<TeamPeople | null>(null);
  const [error, setError] = useState("");
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
  return (
    <TeamShell
      title={c("팀 참여자", "Team participants")}
      description={c(
        "참여는 무료입니다. 편집 이용권 배정과 구매 정원은 따로 관리합니다.",
        "Participation is free. Editing licences and purchased capacity are managed separately.",
      )}
    >
      <SpaceBadge workspace={data.workspace} />
      {error && <B2bError code={error} retry={() => void load()} />}
      {!roster ? (
        !error && <TeamLoading />
      ) : (
        <>
          {(["internal", "external"] as const).map((kind) => (
            <section className="space-y-4" key={kind}>
              <h2 className="font-medium">
                {kind === "internal"
                  ? c("내부 참여자", "Internal participants")
                  : c("외부 참여자", "External collaborators")}
              </h2>
              <ul className="divide-y divide-border">
                {roster.people
                  .filter((p) => p.kind === kind)
                  .map((person) => (
                    <li key={person.userId} className="space-y-3 py-4">
                      <p className="break-all text-sm font-medium">
                        {person.name || person.email}
                      </p>
                      {person.name && (
                        <p className="break-all text-xs text-muted">
                          {person.email}
                        </p>
                      )}
                      <p className="text-xs text-muted">
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
                      {roster.canDelegateBilling &&
                        person.role !== "owner" &&
                        !person.suspendedAt && (
                          <AffiliationEditor
                            key={person.userId}
                            person={person}
                            onSaved={load}
                          />
                        )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          <InvitationPanel editable={b2b.team.currentState === "active"} />
        </>
      )}
    </TeamShell>
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
    <details className="max-w-2xl rounded-lg border border-border p-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        {c(
          "참여 구분·결제 권한 변경",
          "Change affiliation and billing permission",
        )}
      </summary>
      <form
        className="space-y-4 pt-4"
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
            if (definitivelyRejected(e)) pending.current = null;
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-2 text-sm">
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
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={billing}
            disabled={busy || !!pending.current}
            onChange={(e) => setBilling(e.target.checked)}
          />
          {c("결제 권한 위임", "Delegate billing permission")}
        </label>
        <label className="block space-y-2 text-sm">
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
    </details>
  );
}
