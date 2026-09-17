"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  TeamShell,
  SpaceBadge,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { isPersonal } from "@/lib/workspaces/kind";
import {
  CloudError,
  cloudErrorCode,
} from "@/components/workspaces/cloud-shared";
import { ReauthForm } from "@/components/workspaces/reauth-form";
import {
  workspaceService,
  type MemberImpact,
} from "@/lib/api/services/workspace.service";
export default function Page() {
  const { data, reload } = useWorkspace()!;
  const { lang, t } = useI18n();
  const router = useRouter();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const id = data.workspace.id;
  /**
   * A personal workspace cannot be handed over, left or deleted — the backend
   * rejects all three — so neither section is rendered here. Absent, not
   * disabled: a greyed-out "transfer ownership" still teaches people that their
   * private space is the kind of object that can be given away.
   */
  const personal = isPersonal(data.workspace);
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    revision: number;
  } | null>(null);
  const [target, setTarget] = useState("");
  const [confirm, setConfirm] = useState<"transfer" | "accept" | null>(null);
  const [leave, setLeave] = useState(false);
  const [leaveName, setLeaveName] = useState("");
  const [impact, setImpact] = useState<MemberImpact | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const form = draft ?? {
    name: data.workspace.name,
    description: data.workspace.description || "",
    revision: data.workspace.revision ?? 0,
  };
  // The draft normalizes `revision` to 0; compare against the same
  // normalization, or a response without the field reads as "someone else
  // changed this" forever and Save never enables again.
  const conflicted =
    !!draft && draft.revision !== (data.workspace.revision ?? 0);
  const pending = data.pendingTransfer;
  const confirming =
    confirm === "transfer"
      ? data.role === "owner" && !pending
      : confirm === "accept" && pending?.toUserId === data.currentUserId;
  async function run(work: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await reload();
      setNotice(message);
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data.managementEnabled)
    return (
      <TeamShell title={c("워크스페이스 설정", "Workspace settings")}>
        <CloudError code="WORKSPACE_MANAGEMENT_DISABLED" />
      </TeamShell>
    );
  return (
    <TeamShell
      /* The switcher and the badge below both name the space already; a third
         copy under the title is furniture. */
      title={c("워크스페이스 설정", "Workspace settings")}
    >
      <SpaceBadge workspace={data.workspace} />
      {error && <CloudError code={error} />}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <div className="space-y-8">
        <Block
          title={
            personal
              ? c("공간 정보", "Space details")
              : c("팀 정보", "Team details")
          }
          description={c(
            "워크스페이스 주소는 이름을 변경해도 유지됩니다.",
            "The workspace address stays the same when you rename it.",
          )}
        >
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              await run(
                async () => {
                  await workspaceService.settings(id, form);
                  setDraft(null);
                },
                c("팀 정보를 저장했습니다.", "Team details saved."),
              );
            }}
          >
            <label className="block space-y-2 text-sm">
              <span>{c("워크스페이스 이름", "Workspace name")}</span>
              <input
                className={inputClass}
                maxLength={80}
                required
                disabled={!data.canManage || busy}
                value={form.name}
                onChange={(e) => setDraft({ ...form, name: e.target.value })}
              />
            </label>
            <label className="block space-y-2 text-sm">
              <span>{c("소개", "Description")}</span>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                maxLength={500}
                disabled={!data.canManage || busy}
                value={form.description}
                onChange={(e) =>
                  setDraft({ ...form, description: e.target.value })
                }
              />
            </label>
            {conflicted && (
              <p role="status" className="text-sm text-muted">
                {c(
                  "다른 관리자가 설정을 변경했습니다. 최신 정보 불러오기로 다시 시작하세요.",
                  "Another administrator updated the settings. Load the latest details before editing again.",
                )}
              </p>
            )}
            {/* The save button appears when there is something to save. A
              permanently greyed-out button is a control that has never once
              been usable in the reader's experience of the page. */}
            {data.canManage && (draft || conflicted) && (
              <div className="flex flex-wrap gap-2">
                <button
                  className={primaryClass}
                  disabled={busy || !draft || !form.name.trim() || conflicted}
                >
                  {c("변경 저장", "Save changes")}
                </button>
                {(draft || conflicted) && (
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={busy}
                    onClick={async () => {
                      await reload();
                      setDraft(null);
                      setError("");
                    }}
                  >
                    {c("최신 정보 불러오기", "Load latest details")}
                  </button>
                )}
              </div>
            )}
          </form>
        </Block>
        {!personal && (
          <Block
            title={c("소유권", "Ownership")}
            description={c(
              "이전 소유자는 관리자로 남습니다. 상대방이 본인 확인 후 수락해야 완료됩니다.",
              "The previous owner remains an admin. It completes once the recipient verifies and accepts.",
            )}
          >
            <p className="break-all text-sm">
              {c("현재 소유자", "Current owner")}:{" "}
              {data.members.find((m) => m.role === "owner")?.email}
            </p>
            {pending && (
              <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
                <p className="break-all text-sm">
                  {c("수락 대기", "Awaiting acceptance")}:{" "}
                  {
                    data.members.find((m) => m.userId === pending.toUserId)
                      ?.email
                  }
                </p>
                <p className="text-xs text-muted">
                  {c("요청 만료", "Expires")}:{" "}
                  {new Date(pending.expiresAt).toLocaleString(lang)}
                </p>
                <div className="flex flex-wrap gap-2">
                  {pending.toUserId === data.currentUserId && (
                    <>
                      <button
                        className={primaryClass}
                        disabled={busy || !!confirming}
                        onClick={() => setConfirm("accept")}
                      >
                        {c(
                          "이전 내용 확인 후 수락",
                          "Review and accept ownership",
                        )}
                      </button>
                      <button
                        className={secondaryClass}
                        disabled={busy || !!confirming}
                        onClick={() =>
                          run(
                            () =>
                              workspaceService.resolveTransfer(
                                id,
                                pending.id,
                                "decline",
                              ),
                            c(
                              "이전 요청을 거절했습니다.",
                              "Transfer declined.",
                            ),
                          )
                        }
                      >
                        {c("거절", "Decline")}
                      </button>
                    </>
                  )}
                  {data.role === "owner" && (
                    <button
                      className={secondaryClass}
                      disabled={busy || !!confirming}
                      onClick={() =>
                        run(
                          () =>
                            workspaceService.resolveTransfer(
                              id,
                              pending.id,
                              "cancel",
                            ),
                          c("이전 요청을 취소했습니다.", "Transfer cancelled."),
                        )
                      }
                    >
                      {c("이전 요청 취소", "Cancel transfer")}
                    </button>
                  )}
                </div>
              </div>
            )}
            {data.role === "owner" && !pending && (
              <div className="space-y-3">
                <label className="block space-y-2 text-sm">
                  <span>{c("새 소유자", "New owner")}</span>
                  <select
                    className={inputClass}
                    disabled={!!confirming}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">
                      {c("참여 중인 멤버 선택", "Choose an active member")}
                    </option>
                    {data.members
                      .filter(
                        (m) =>
                          m.userId !== data.currentUserId && !m.suspendedAt,
                      )
                      .map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.email} · {t(`team.role.${m.role}`)}
                        </option>
                      ))}
                  </select>
                </label>
                <p className="text-xs leading-5 text-muted">
                  {c(
                    "7일 동안 유효합니다. 검토자가 수락하려면 빈 좌석 1개가 필요합니다.",
                    "Valid for 7 days. A reviewer needs one free seat to accept.",
                  )}
                </p>
                <button
                  className={secondaryClass}
                  disabled={!target || !!confirming}
                  onClick={() => setConfirm("transfer")}
                >
                  {c("소유권 이전 요청", "Request ownership transfer")}
                </button>
              </div>
            )}
            {confirm &&
              ((confirm === "transfer" && !pending && data.role === "owner") ||
                (confirm === "accept" &&
                  pending?.toUserId === data.currentUserId)) && (
                <ReauthForm
                  key={`${confirm}:${target}:${pending?.id}`}
                  workspaceId={id}
                  purpose={
                    confirm === "transfer"
                      ? `transfer:${target}`
                      : `accept:${pending!.id}`
                  }
                  label={
                    confirm === "transfer"
                      ? c(
                          "본인 확인 후 이전 요청",
                          "Verify and request transfer",
                        )
                      : c(
                          "본인 확인 후 소유권 수락",
                          "Verify and accept ownership",
                        )
                  }
                  onCancel={() => setConfirm(null)}
                  onConfirm={async (credential) => {
                    if (confirm === "transfer")
                      await workspaceService.transfer(id, target, credential);
                    else
                      await workspaceService.resolveTransfer(
                        id,
                        pending!.id,
                        "accept",
                        credential,
                      );
                    setConfirm(null);
                    setTarget("");
                    await reload();
                    setNotice(
                      c(
                        "소유권 이전 상태를 업데이트했습니다.",
                        "Ownership transfer updated.",
                      ),
                    );
                  }}
                />
              )}
          </Block>
        )}
        {!personal && (
          <Block
            title={c("내 참여", "Your membership")}
            description={
              data.role === "owner"
                ? c(
                    "소유자는 소유권 이전을 완료한 뒤 탈퇴할 수 있습니다.",
                    "Owners must complete an ownership transfer before leaving.",
                  )
                : c(
                    "탈퇴하면 팀 접근이 종료됩니다. 팀 자료와 기록은 남고, 다시 참여하려면 새 초대가 필요합니다.",
                    "Leaving ends your team access. Team files and history remain, and a new invitation is required to rejoin.",
                  )
            }
            actions={
              data.role !== "owner" && !leave ? (
                <button
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setImpact(
                        await workspaceService.impact(id, data.currentUserId!),
                      );
                      setLeave(true);
                    }, "")
                  }
                >
                  {c("워크스페이스 탈퇴", "Leave workspace")}
                </button>
              ) : undefined
            }
          >
            {leave && data.role !== "owner" && (
              <form
                className="space-y-4 rounded-lg border border-border bg-surface p-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run(async () => {
                    await workspaceService.leave(id);
                    router.replace("/dashboard/workspaces");
                  }, "");
                }}
              >
                <p className="text-sm leading-6 text-muted">
                  {c(
                    `진행 중 업로드 ${impact?.pendingUploads ?? 0}개를 취소합니다.`,
                    `${impact?.pendingUploads ?? 0} pending uploads will be cancelled.`,
                  )}
                </p>
                <label className="block space-y-2 text-sm">
                  <span>
                    {c(
                      `확인하려면 ‘${data.workspace.name}’ 입력`,
                      `Type “${data.workspace.name}” to confirm`,
                    )}
                  </span>
                  <input
                    className={inputClass}
                    required
                    value={leaveName}
                    disabled={busy}
                    onChange={(e) => setLeaveName(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={primaryClass}
                    disabled={busy || leaveName !== data.workspace.name}
                  >
                    {c("탈퇴 확인", "Confirm leaving")}
                  </button>
                  <button
                    type="button"
                    className={secondaryClass}
                    disabled={busy}
                    onClick={() => {
                      setLeave(false);
                      setLeaveName("");
                    }}
                  >
                    {c("취소", "Cancel")}
                  </button>
                </div>
              </form>
            )}
          </Block>
        )}
      </div>
    </TeamShell>
  );
}
