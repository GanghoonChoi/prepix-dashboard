"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type Role,
  type InviteRole,
  type WorkspaceDetail,
  type MemberImpact,
} from "@/lib/api/services/workspace.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { inputClass, primaryClass, secondaryClass } from "./shared";
type Action = InviteRole | "remove" | "suspend" | "reactivate";
export function MemberActions({
  workspaceId,
  member,
  actorRole,
  team,
  onChange,
}: {
  workspaceId: string;
  member: WorkspaceDetail["members"][number];
  actorRole: Role;
  team?: WorkspaceDetail;
  onChange: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [edit, setEdit] = useState(false);
  const [role, setRole] = useState<Action>(
    member.role === "owner" ? "admin" : member.role,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [impact, setImpact] = useState<MemberImpact | null>(null);
  const [successor, setSuccessor] = useState("");
  const offboard = role === "remove" || role === "suspend";
  if (
    member.role === "owner" ||
    (member.role === "admin" && actorRole !== "owner")
  )
    return null;
  return (
    <div className="w-full">
      <button
        className={secondaryClass}
        aria-expanded={edit}
        onClick={() => {
          setEdit(!edit);
          setRole(member.role as InviteRole);
          setError("");
          setImpact(null);
          setSuccessor("");
        }}
      >
        {c("멤버 관리", "Manage member")}
      </button>
      {edit && (
        <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface p-4">
          {error && <CloudError code={error} />}
          <label className="block space-y-2 text-sm">
            <span>{c("변경할 작업", "Action")}</span>
            <select
              className={inputClass}
              value={role}
              disabled={busy}
              onChange={(e) => {
                setRole(e.target.value as Action);
                setImpact(null);
              }}
            >
              {actorRole === "owner" && (
                <option value="admin">{c("관리자", "Admin")}</option>
              )}
              <option value="editor">{c("편집자", "Editor")}</option>
              <option value="reviewer">{c("검토자", "Reviewer")}</option>
              {team?.managementEnabled && (
                <option value={member.suspendedAt ? "reactivate" : "suspend"}>
                  {member.suspendedAt
                    ? c("참여 재개", "Reactivate")
                    : c("참여 정지", "Suspend")}
                </option>
              )}
              <option value="remove">
                {c("팀에서 제거", "Remove from team")}
              </option>
            </select>
          </label>
          <p className="text-sm leading-6 text-muted">
            {offboard
              ? c(
                  "팀 자료와 작업 기록은 남습니다. 진행 중 업로드는 취소하고 좌석을 반환합니다. 이미 내려받은 파일은 회수할 수 없으며 발급된 다운로드 링크는 최대 60초 동안 유효합니다.",
                  "Team files and history remain. Pending uploads are cancelled and the seat is released. Downloaded files cannot be recalled; existing download links can remain valid for up to 60 seconds.",
                )
              : role === "reactivate"
                ? c(
                    "좌석 여유를 확인한 뒤 기존 프로젝트 접근 권한을 다시 활성화합니다. 취소된 업로드와 이전 담당 지정은 복원하지 않습니다.",
                    "Reactivation checks seat capacity and restores retained project access. Cancelled uploads and previous assignments are not restored.",
                  )
                : c(
                    "역할은 가능한 작업의 상한입니다. 프로젝트 접근 권한은 프로젝트에서 따로 관리합니다.",
                    "The role limits allowed actions. Project access is managed separately.",
                  )}
          </p>
          {offboard && team?.managementEnabled && !impact && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setImpact(
                    await workspaceService.impact(workspaceId, member.userId),
                  );
                } catch (e) {
                  setError(cloudErrorCode(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {c("담당 작업과 영향 확인", "Review responsibilities and impact")}
            </button>
          )}
          {offboard && impact && (
            <div className="space-y-3 text-sm">
              <p className="tabular-nums">
                {c(
                  `담당 프로젝트 ${impact.projects.length}개 · 진행 중 업로드 ${impact.pendingUploads}개`,
                  `${impact.projects.length} assigned projects · ${impact.pendingUploads} pending uploads`,
                )}
              </p>
              {!!impact.projects.length && (
                <ul className="space-y-1 text-muted">
                  {impact.projects.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              )}
              <label className="block space-y-2">
                <span>{c("프로젝트 인수자", "Project successor")}</span>
                <select
                  className={inputClass}
                  disabled={busy}
                  value={successor}
                  onChange={(e) => setSuccessor(e.target.value)}
                >
                  <option value="">
                    {c(
                      "지금 지정하지 않음 · 관리자가 나중에 배정",
                      "Leave unassigned for an administrator",
                    )}
                  </option>
                  {team?.members
                    .filter(
                      (m) =>
                        m.userId !== member.userId &&
                        !m.suspendedAt &&
                        m.role !== "reviewer",
                    )
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name || m.email}
                      </option>
                    ))}
                </select>
              </label>
              <p className="text-xs leading-5 text-muted">
                {c(
                  "인수자는 위 프로젝트의 편집 및 관리 권한을 받습니다. 확정할 때 최신 담당 작업에 적용합니다.",
                  "The successor receives edit and management access to these projects. The latest assignments are used when you confirm.",
                )}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              className={primaryClass}
              disabled={
                busy ||
                role === member.role ||
                (offboard && !!team?.managementEnabled && !impact)
              }
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await workspaceService.changeMember(
                    workspaceId,
                    member.userId,
                    role,
                    offboard ? successor || undefined : undefined,
                  );
                  await onChange();
                  setEdit(false);
                } catch (e) {
                  setError(cloudErrorCode(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? c("변경 중…", "Updating…")
                : offboard
                  ? c("접근 종료 확인", "Confirm access removal")
                  : c("변경 저장", "Save changes")}
            </button>
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => setEdit(false)}
            >
              {c("취소", "Cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
