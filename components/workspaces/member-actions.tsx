"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type Role,
  type InviteRole,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { inputClass, primaryClass, secondaryClass } from "./shared";
export function MemberActions({
  workspaceId,
  member,
  actorRole,
  onChange,
}: {
  workspaceId: string;
  member: WorkspaceDetail["members"][number];
  actorRole: Role;
  onChange: () => Promise<void>;
}) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [edit, setEdit] = useState(false);
  const [role, setRole] = useState<InviteRole | "remove">(
    member.role === "owner" ? "admin" : member.role,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
        }}
      >
        {c("멤버 관리", "Manage member")}
      </button>
      {edit && (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface p-4">
          {error && <CloudError code={error} />}
          <select
            aria-label={`${member.email} ${c("역할 변경", "role change")}`}
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {actorRole === "owner" && (
              <option value="admin">{c("관리자", "Admin")}</option>
            )}
            <option value="editor">{c("편집자", "Editor")}</option>
            <option value="reviewer">{c("검토자", "Reviewer")}</option>
            <option value="remove">
              {c("팀에서 제거", "Remove from team")}
            </option>
          </select>
          <p className="text-sm leading-6 text-muted">
            {role === "remove"
              ? c(
                  `${member.email}의 팀 접근을 종료합니다. 기존 작업 기록은 보존됩니다. 이미 내려받은 파일은 회수할 수 없습니다.`,
                  `End ${member.email}'s team access. Work history is preserved. Previously downloaded files cannot be recalled.`,
                )
              : c(
                  "역할이 허용하는 작업과 팀 좌석 사용량이 변경됩니다.",
                  "This changes allowed actions and may change seat usage.",
                )}
          </p>
          <div className="flex gap-2">
            <button
              className={primaryClass}
              disabled={busy || role === member.role}
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
                : role === "remove"
                  ? c("접근 종료 확인", "Confirm removal")
                  : c("역할 변경 저장", "Save role")}
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
