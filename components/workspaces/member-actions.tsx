"use client";
import { useState } from "react";
import { useOverlayState } from "@heroui/react";
import { Dialog } from "@/components/dialog";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type Role,
  type InviteRole,
  type WorkspaceDetail,
  type MemberImpact,
} from "@/lib/api/services/workspace.service";
import { CloudError, cloudErrorCode } from "./cloud-shared";
import { RoleTable } from "./role-guide";
import { RowMenu, RowMenuItem } from "./row-menu";
import { primaryClass, secondaryClass } from "./shared";

type Action = InviteRole | "remove" | "suspend" | "reactivate";

/**
 * What an admin may do to one member, from the kebab at the end of their row.
 *
 * This used to be a "멤버 관리" button that expanded a panel INSIDE the row's
 * action cell — a column the table sizes at `w-12`. The panel held a select, a
 * six-row permissions grid with a 30rem minimum and three buttons, so opening
 * it stretched the table past the viewport and stranded the controls in a
 * horizontally scrolling last column. It read as broken because it was.
 *
 * Now the kebab offers the actions themselves — the same affordance the
 * invitation rows already use — and each one opens a dialog that says what
 * will happen before it happens. The select is gone: choosing the action from
 * the menu IS choosing it, and a dropdown whose options are "편집자 / 검토자 /
 * 참여 정지 / 팀에서 제거" was asking someone to pick a role and a removal
 * from one list.
 */
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
  const confirm = useOverlayState();
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [impact, setImpact] = useState<MemberImpact | null>(null);

  // The owner is untouchable from the side, and only the owner manages an
  // admin — both enforced by the server (WORKSPACE_OWNER_PROTECTED /
  // WORKSPACE_OWNER_REQUIRED), stated here so the menu never offers a refusal.
  if (
    member.role === "owner" ||
    (member.role === "admin" && actorRole !== "owner")
  )
    return null;

  const managed = team?.managementEnabled;
  const offboard = action === "remove" || action === "suspend";

  const label = (value: Action) =>
    ({
      admin: c("관리자로 변경", "Change to admin"),
      editor: c("편집자로 변경", "Change to editor"),
      reviewer: c("검토자로 변경", "Change to reviewer"),
      suspend: c("참여 정지", "Suspend"),
      reactivate: c("참여 재개", "Reactivate"),
      remove: c("팀에서 제거", "Remove from team"),
    })[value];

  function open(next: Action) {
    setAction(next);
    setError("");
    setImpact(null);
    confirm.open();
    // Removal and suspension cancel work in flight. Fetch the count up front
    // rather than behind a "영향 확인" button: the number is the reason the
    // dialog exists, and one more click to see it is one more click nobody
    // makes before confirming.
    if (next === "remove" || next === "suspend")
      void workspaceService
        .impact(workspaceId, member.userId)
        .then(setImpact)
        .catch(() => {});
  }

  return (
    <>
      <RowMenu>
        {actorRole === "owner" && member.role !== "admin" && (
          <RowMenuItem onClick={() => open("admin")}>
            {label("admin")}
          </RowMenuItem>
        )}
        {member.role !== "editor" && (
          <RowMenuItem onClick={() => open("editor")}>
            {label("editor")}
          </RowMenuItem>
        )}
        {member.role !== "reviewer" && (
          <RowMenuItem onClick={() => open("reviewer")}>
            {label("reviewer")}
          </RowMenuItem>
        )}
        {managed && (
          <RowMenuItem
            onClick={() => open(member.suspendedAt ? "reactivate" : "suspend")}
          >
            {label(member.suspendedAt ? "reactivate" : "suspend")}
          </RowMenuItem>
        )}
        <RowMenuItem tone="danger" onClick={() => open("remove")}>
          {label("remove")}
        </RowMenuItem>
      </RowMenu>

      {action && (
        <Dialog
          state={confirm}
          title={label(action)}
          /* A role change carries the grid inline — this is one of the two
             places a role is assigned, and "I made someone an admin by
             accident" is the failure it exists to prevent. Offboarding does
             not need it and stays narrow. */
          size={offboard || action === "reactivate" ? "default" : "wide"}
        >
          <div className="space-y-4">
            <p className="break-all text-sm leading-6">
              {member.name ? `${member.name} · ${member.email}` : member.email}
            </p>
            {error && <CloudError code={error} />}
            <p className="text-sm leading-6 text-muted">
              {offboard
                ? c(
                    "팀 자료는 남습니다. 진행 중인 업로드는 취소되고 좌석은 반환됩니다.",
                    "Team files remain. Pending uploads are cancelled and the seat is released.",
                  )
                : action === "reactivate"
                  ? c(
                      "빈 좌석이 있어야 참여를 다시 활성화할 수 있습니다.",
                      "Reactivating needs a free seat.",
                    )
                  : c(
                      "이 사람이 할 수 있는 일이 바뀝니다.",
                      "This changes what they can do.",
                    )}
            </p>
            {!offboard && action !== "reactivate" && <RoleTable />}
            {offboard && impact && impact.pendingUploads > 0 && (
              <p className="text-sm tabular-nums">
                {c(
                  `진행 중 업로드 ${impact.pendingUploads}개를 취소합니다.`,
                  `${impact.pendingUploads} pending uploads will be cancelled.`,
                )}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={secondaryClass}
                disabled={busy}
                onClick={() => confirm.close()}
              >
                {c("취소", "Cancel")}
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await workspaceService.changeMember(
                      workspaceId,
                      member.userId,
                      action,
                    );
                    await onChange();
                    confirm.close();
                    setAction(null);
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
                    ? c("확인", "Confirm")
                    : c("변경", "Change")}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
