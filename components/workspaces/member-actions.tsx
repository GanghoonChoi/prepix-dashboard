"use client";
import { useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type Role,
  type InviteRole,
  type WorkspaceDetail,
  type MemberImpact,
} from "@/lib/api/services/workspace.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import {
  RoleCapabilities,
  inputClass,
  primaryClass,
  secondaryClass,
} from "./shared";
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
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => {
    setEdit(false);
    trigger.current?.focus();
  };
  const offboard = role === "remove" || role === "suspend";
  if (
    member.role === "owner" ||
    (member.role === "admin" && actorRole !== "owner")
  )
    return null;
  return (
    <div className="w-full">
      <button
        ref={trigger}
        className={secondaryClass}
        aria-expanded={edit}
        onClick={() => {
          setEdit(!edit);
          setRole(member.role as InviteRole);
          setError("");
          setImpact(null);
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
          {/*
            The same grid the invite form shows, at the other place a role is
            assigned. A role change is where "I made someone an admin by
            accident" actually happens, so the comparison belongs here too —
            including the rule that an admin can never reach owner.
          */}
          {!offboard && role !== "reactivate" && <RoleCapabilities />}
          <p className="text-sm leading-6 text-muted">
            {offboard
              ? c(
                  "팀 자료와 작업 기록은 남습니다. 진행 중 업로드는 취소하고 좌석을 반환합니다. 이미 내려받은 파일은 회수할 수 없으며 발급된 다운로드 링크는 최대 60초 동안 유효합니다.",
                  "Team files and history remain. Pending uploads are cancelled and the seat is released. Downloaded files cannot be recalled; existing download links can remain valid for up to 60 seconds.",
                )
              : role === "reactivate"
                ? c(
                    "좌석 여유를 확인한 뒤 참여를 다시 활성화합니다. 취소된 업로드는 복원하지 않습니다.",
                    "Reactivation checks seat capacity and restores membership. Cancelled uploads are not restored.",
                  )
                : c(
                    "역할은 가능한 작업의 상한입니다.",
                    "The role limits allowed actions.",
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
              {c("영향 확인", "Review impact")}
            </button>
          )}
          {offboard && impact && (
            <p className="tabular-nums text-sm">
              {c(
                `진행 중 업로드 ${impact.pendingUploads}개를 취소합니다.`,
                `${impact.pendingUploads} pending uploads will be cancelled.`,
              )}
            </p>
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
                  );
                  await onChange();
                  close();
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
              onClick={close}
            >
              {c("취소", "Cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
