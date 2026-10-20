"use client";
import { OwnershipControls } from "@/components/b2b/ownership";
import { DeleteTeam, LeaveTeam } from "@/components/b2b/leave-team";
import { AccessDenied } from "@/components/b2b/shared";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { TeamShell, SpaceBadge, SpaceIcon } from "@/components/workspaces/shared";
import {
  Button,
  buttonClass,
  CardFooter,
  DangerZone,
  Field,
  inputClass,
  PropertyList,
  Select,
  SettingsSection,
  textareaClass,
} from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
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
/**
 * A picked image as the team logo: the centre square, 128 px, WebP (PNG where
 * the browser cannot encode WebP), JPEG if that is still over the 64 KB the
 * server takes. Done here so the server only ever stores a small raster.
 */
async function logoFrom(file: File): Promise<string> {
  const image = await createImageBitmap(file);
  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  canvas
    .getContext("2d")!
    .drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 128, 128);
  image.close();
  let url = canvas.toDataURL("image/webp", 0.9);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/png");
  if (url.length > 65536) url = canvas.toDataURL("image/jpeg", 0.85);
  return url;
}

export default function Page() {
  const { data, reload, b2b } = useWorkspace()!;
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
  const MembershipZone = data.role === "owner" ? SettingsSection : DangerZone;
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
  // Owners and admins only. Everyone else leaves the team, or answers an
  // ownership offer, from the team home.
  if (!data.canManage) return <AccessDenied code="B2B_TEAM_MANAGER_REQUIRED" />;
  if (!data.managementEnabled)
    return (
      <TeamShell title={c("설정", "Settings")}>
        <CloudError code="WORKSPACE_MANAGEMENT_DISABLED" />
      </TeamShell>
    );
  return (
    <TeamShell
      /* The switcher and the badge below both name the space already; a third
         copy under the title is furniture. The title is the nav entry's own
         word (lib/workspaces/nav.ts), so the two never disagree. */
      title={c("설정", "Settings")}
    >
      <SpaceBadge workspace={data.workspace} />
      {error && <CloudError code={error} />}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <div className="space-y-8">
        <SettingsSection
          title={
            personal
              ? c("공간 정보", "Space details")
              : c("팀 정보", "Team details")
          }
        >
          {!personal && (
            // Its own row and its own save: picking an image is the change.
            <div className="mb-4 space-y-1.5">
              <p className="text-[13px] font-medium">{c("로고", "Logo")}</p>
              <div className="flex items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-background">
                  <SpaceIcon kind="team" size={data.workspace.logo ? 48 : 20} logo={data.workspace.logo} />
                </span>
                <label className={`${buttonClass({ variant: "secondary", size: "sm" })} cursor-pointer has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50`}>
                  {data.workspace.logo ? c("변경", "Change") : c("업로드", "Upload")}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      let logo: string;
                      try {
                        logo = await logoFrom(file);
                      } catch {
                        return setError("WORKSPACE_LOGO_INVALID");
                      }
                      await run(() => workspaceService.logo(id, logo), c("로고를 바꿨습니다.", "Logo updated."));
                    }}
                  />
                </label>
                {data.workspace.logo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void run(() => workspaceService.logo(id, null), c("로고를 삭제했습니다.", "Logo removed."))}
                  >
                    {c("삭제", "Remove")}
                  </Button>
                )}
              </div>
            </div>
          )}
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
            <Field label={c("워크스페이스 이름", "Workspace name")} htmlFor="workspace-name">
              <input
                id="workspace-name"
                className={inputClass}
                maxLength={b2b?.enrolled ? 100 : 80}
                required
                disabled={busy}
                value={form.name}
                onChange={(e) => setDraft({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label={c("소개", "Description")} htmlFor="workspace-description">
              <textarea
                id="workspace-description"
                className={`${textareaClass} min-h-24 resize-y`}
                maxLength={500}
                disabled={busy}
                value={form.description}
                onChange={(e) =>
                  setDraft({ ...form, description: e.target.value })
                }
              />
            </Field>
            {/* The save button appears when there is something to save. A
              permanently greyed-out button is a control that has never once
              been usable in the reader's experience of the page. */}
            {(draft || conflicted) && (
              <CardFooter>
                {conflicted ? (
                  <p role="status">
                    {c(
                      "다른 관리자가 설정을 변경했습니다. 최신 정보 불러오기로 다시 시작하세요.",
                      "Another administrator updated the settings. Load the latest details before editing again.",
                    )}
                  </p>
                ) : (
                  <span />
                )}
                <div className="flex flex-wrap gap-2">
                  {(draft || conflicted) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        await reload();
                        setDraft(null);
                        setError("");
                      }}
                    >
                      {c("최신 정보 불러오기", "Load latest details")}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !draft || !form.name.trim() || conflicted}
                  >
                    {c("변경 저장", "Save changes")}
                  </Button>
                </div>
              </CardFooter>
            )}
          </form>
        </SettingsSection>
        {!personal && b2b?.enrolled && <OwnershipControls />}
        {!personal && !b2b?.enrolled && (
          <SettingsSection
            title={c("소유권", "Ownership")}
            description={c(
              "상대방이 수락하면 완료되고, 이전 소유자는 관리자로 남습니다.",
              "It completes when the recipient accepts; you stay on as an admin.",
            )}
          >
            <div className="space-y-4">
              <PropertyList
                divided
                items={[
                  [
                    c("현재 소유자", "Current owner"),
                    data.members.find((m) => m.role === "owner")?.email,
                  ],
                  ...(pending
                    ? ([
                        [
                          c("수락 대기", "Awaiting acceptance"),
                          data.members.find((m) => m.userId === pending.toUserId)
                            ?.email,
                        ],
                        [
                          c("요청 만료", "Expires"),
                          `${formatDate(pending.expiresAt, lang)} ${formatTime(pending.expiresAt, lang)}`,
                        ],
                      ] as [string, string | undefined][])
                    : []),
                ]}
              />
              {pending && (
                <div className="flex flex-wrap gap-2">
                  {pending.toUserId === data.currentUserId && (
                    <>
                      <Button
                        disabled={busy || !!confirming}
                        onClick={() => setConfirm("accept")}
                      >
                        {c(
                          "이전 내용 확인 후 수락",
                          "Review and accept ownership",
                        )}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy || !!confirming}
                        onClick={() =>
                          run(
                            () =>
                              workspaceService.resolveTransfer(
                                id,
                                pending.id,
                                "decline",
                              ),
                            c("이전 요청을 거절했습니다.", "Transfer declined."),
                          )
                        }
                      >
                        {c("거절", "Decline")}
                      </Button>
                    </>
                  )}
                  {data.role === "owner" && (
                    <Button
                      variant="secondary"
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
                    </Button>
                  )}
                </div>
              )}
              {data.role === "owner" && !pending && (
                <div className="flex max-w-xl flex-wrap items-end gap-2">
                  <Field label={c("새 소유자", "New owner")} htmlFor="new-owner" className="min-w-0 flex-1 basis-56">
                    <Select
                      id="new-owner"
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
                    </Select>
                  </Field>
                  <Button
                    variant="secondary"
                    disabled={!target || !!confirming}
                    onClick={() => setConfirm("transfer")}
                  >
                    {c("소유권 이전 요청", "Request ownership transfer")}
                  </Button>
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
            </div>
          </SettingsSection>
        )}
        {/* The owner deletes (handing over is above); everyone else leaves.
            The shared leave section brings its own heading. */}
        {!personal && b2b?.enrolled &&
          (data.role === "owner" ? (
            <DeleteTeam />
          ) : (
            <DangerZone>
              <LeaveTeam />
            </DangerZone>
          ))}
        {!personal && !b2b?.enrolled && (
          <MembershipZone
            title={c("내 참여", "Your membership")}
            description={
              data.role === "owner"
                ? c(
                    "소유자는 소유권 이전을 완료한 뒤 탈퇴할 수 있습니다.",
                    "Owners must complete an ownership transfer before leaving.",
                  )
                : c(
                    "팀 자료는 남습니다. 다시 참여하려면 새 초대가 필요합니다.",
                    "Team files remain. Rejoining needs a new invitation.",
                  )
            }
          >
            {data.role !== "owner" && !leave ? (
              <Button
                variant="danger"
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
              </Button>
            ) : undefined}
            {leave && data.role !== "owner" && (
              <form
                className="max-w-xl space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run(async () => {
                    await workspaceService.leave(id);
                    router.replace("/dashboard/workspaces");
                  }, "");
                }}
              >
                <p className="text-[13px] text-muted">
                  {c(
                    `진행 중 업로드 ${impact?.pendingUploads ?? 0}개를 취소합니다.`,
                    `${impact?.pendingUploads ?? 0} pending uploads will be cancelled.`,
                  )}
                </p>
                <Field
                  htmlFor="leave-confirm"
                  label={c(
                    `확인하려면 ‘${data.workspace.name}’ 입력`,
                    `Type “${data.workspace.name}” to confirm`,
                  )}
                >
                  <input
                    id="leave-confirm"
                    className={inputClass}
                    required
                    value={leaveName}
                    disabled={busy}
                    onChange={(e) => setLeaveName(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    variant="danger"
                    disabled={busy || leaveName !== data.workspace.name}
                  >
                    {c("탈퇴 확인", "Confirm leaving")}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setLeave(false);
                      setLeaveName("");
                    }}
                  >
                    {c("취소", "Cancel")}
                  </Button>
                </div>
              </form>
            )}
          </MembershipZone>
        )}
      </div>
    </TeamShell>
  );
}
