"use client";
import { InvitationPanel } from "./invitations";
import { RequestWorkPanel } from "./request-work";
import { ReviewWorkPanel } from "./review-work";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { buildTeamProjectOpenUrl } from "@/lib/workspaces/app-link";
import { projectSurfaces, visibilityChange } from "@/lib/b2b-projects/visibility";
import {
  b2bService,
  type Project,
  type ProjectPeople,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { PublishedItems, useRun } from "./reviews";
import {
  B2bError,
  errorCode,
  StateBadge,
  VisibilityBadge,
  useCopy,
  accessEnded,
  freeIntent,
} from "./shared";

// ponytail: folder model (2026-10-07) — teammates don't open someone's work in the app; delete after merge
const APP_ENTRY = false;
// Secondary links under the published items: present, not competing.
const moreLink = "text-muted underline underline-offset-4 hover:text-foreground";

function useProject(projectId: string) {
  const context = useWorkspace()!;
  const id = context.data.workspace.id;
  const account = context.data.currentUserId;
  const permitted =
    !!context.b2b?.enrolled && context.b2b.allowedActions.projects;
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  const serial = useRef(0);
  const reload = useCallback(async () => {
    if (!permitted) return;
    const request = ++serial.current;
    try {
      const result = await b2bService.project(id, projectId, account);
      if (request === serial.current) {
        setProject(result.project);
        setError("");
      }
    } catch (e) {
      if (request === serial.current) {
        setError(errorCode(e));
        if (accessEnded(e)) setProject(null);
      }
    }
  }, [id, projectId, permitted, account]);
  const deny = useCallback(async () => {
    ++serial.current;
    setProject(null);
    setError("B2B_PROJECT_NOT_FOUND");
  }, []);
  useEffect(() => {
    const sequence = serial;
    const start = window.setTimeout(() => void reload(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      ++sequence.current;
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  return {
    context,
    id,
    project: permitted ? project : null,
    error: permitted ? error : context.b2b ? "B2B_PROJECT_NOT_FOUND" : "",
    reload,
    deny,
  };
}

export function ProjectOverview({ projectId }: { projectId: string }) {
  const context = useWorkspace()!;
  const origin = new URL(apiClient.defaults.baseURL!).origin;
  return (
    <ScopedProjectOverview
      key={`${origin}:${context.data.currentUserId}:${context.data.workspace.id}:${projectId}`}
      projectId={projectId}
    />
  );
}
function ScopedProjectOverview({ projectId }: { projectId: string }) {
  const { context, id, project, error, reload, deny } = useProject(projectId);
  const c = useCopy();
  const [editing, setEditing] = useState(false);
  if (error && !project)
    return <B2bError code={error} retry={() => void reload()} />;
  if (!project) return <TeamLoading />;
  const appUrl = buildTeamProjectOpenUrl({
    workspaceId: id,
    projectId: project.id,
  });
  const surfaces = projectSurfaces(project.role);
  return (
    <TeamShell title={project.name}>
      {error && <B2bError code={error} retry={() => void reload()} />}
      <div className="flex flex-wrap items-center gap-3">
        <SpaceBadge workspace={context.data.workspace} />
        <StateBadge state={project.state} />
        <VisibilityBadge visibility={project.visibility} />
      </div>
      {project.role === "viewer" && (
        <p role="note" className="text-sm text-muted">
          {c(
            "팀 공개 폴더를 열람 중입니다. 작업하려면 담당자에게 참여를 요청하세요.",
            "You are viewing a team-wide folder. Ask the lead to add you to work on it.",
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {APP_ENTRY && appUrl && surfaces.app && (
          <a className={secondaryClass} href={appUrl}>
            {c("앱에서 작업하기", "Work in app")}
          </a>
        )}
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${id}/projects`}
        >
          {c("폴더 목록", "Folders")}
        </Link>
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${id}/projects/${projectId}/files`}
        >
          {c("자료", "Files")}
        </Link>
        {surfaces.people && (
          <Link
            className={secondaryClass}
            href={`/dashboard/workspaces/${id}/projects/${projectId}/people`}
          >
            {c("참여자", "Participants")}
          </Link>
        )}
        {project.allowedActions.edit && (
          <button
            className={secondaryClass}
            onClick={() => setEditing(!editing)}
          >
            {editing
              ? c("개요 보기", "View overview")
              : c("개요 수정", "Edit overview")}
          </button>
        )}
      </div>
      {editing && project.allowedActions.edit ? (
        <ProjectEditor
          key={project.id}
          project={project}
          onSaved={async () => {
            setEditing(false);
            await reload();
          }}
          onRefresh={reload}
        />
      ) : (
        <>
          <PublishedItems projectId={projectId} />
          <section className="space-y-3 border-b border-border pb-8">
            <h2 className="font-medium">{c("작업 개요", "Brief")}</h2>
            <p className="max-w-3xl whitespace-pre-wrap break-words text-sm leading-6 text-muted">
              {project.brief || c("등록된 개요가 없습니다.", "No brief yet.")}
            </p>
          </section>
          <VisibilitySection project={project} onChanged={reload} />
          {/* P (2026-10-07): requests, delivery and completion stay reachable
              but sit below the published items, their panels folded away. */}
          <section
            className="space-y-4"
            aria-label={c("요청·납품·완료", "Requests, delivery and completion")}
          >
            <h2 className="text-sm text-muted">
              {c("요청·납품·완료", "Requests, delivery and completion")}
            </h2>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {surfaces.requests && (
                <Link className={moreLink} href={`/dashboard/workspaces/${id}/projects/${projectId}/requests`}>
                  {c("요청사항", "Requests")}
                </Link>
              )}
              {surfaces.delivery && (
                <Link className={moreLink} href={`/dashboard/workspaces/${id}/projects/${projectId}/delivery`}>
                  {c("납품·폴더 완료", "Delivery and completion")}
                </Link>
              )}
              {surfaces.publications && (
                <Link className={moreLink} href={`/dashboard/workspaces/${id}/projects/${projectId}/publications`}>
                  {c("등록된 결과", "Registered results")}
                </Link>
              )}
            </div>
            <details>
              <summary className="min-h-11 cursor-pointer text-sm text-muted">
                {c("더 보기", "More")}
              </summary>
              <div className="mt-4 space-y-8">
                {surfaces.requestWork && (
                  <RequestWorkPanel projectId={projectId} onDenied={deny} />
                )}
                <ReviewWorkPanel projectId={projectId} onDenied={deny} />
                <section className="space-y-3">
                  <h2 className="font-medium">
                    {c("완료 조건", "Completion requirements")}
                  </h2>
                  <p className="text-sm leading-6 text-muted">
                    {project.requiresWorkingFiles
                      ? c(
                          "최종 영상 승인, 필수 요청 확인과 작업 파일 열기 확인이 필요합니다.",
                          "Delivery requires final video approval, required request confirmation and verified working files.",
                        )
                      : c(
                          "최종 영상 승인과 필수 요청 확인이 필요합니다.",
                          "Delivery requires final video approval and required request confirmation.",
                        )}
                  </p>
                  <p className="text-sm text-muted">
                    {project.shareOriginals
                      ? c(
                          "원본 공유 허용. 다운로드는 참여자별 권한을 따릅니다.",
                          "Original sharing is enabled. Download access is granted separately per participant.",
                        )
                      : c("원본 공유 비허용", "Original sharing is disabled")}
                  </p>
                </section>
              </div>
            </details>
          </section>
        </>
      )}
    </TeamShell>
  );
}

function VisibilitySection({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => Promise<void>;
}) {
  const c = useCopy();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const mutation = useRun();
  const widening = project.visibility === "private";
  const close = () => {
    setOpen(false);
    setReason("");
    setConfirmed(false);
    mutation.setError("");
  };
  const submit = async () => {
    let input;
    try {
      input = visibilityChange(project, { reason, confirmed });
    } catch (e) {
      mutation.setError((e as Error).message);
      return;
    }
    const done = await mutation.run(input, (requestKey) =>
      b2bService.changeVisibility(project.workspaceId, project.id, {
        ...input,
        requestKey,
      }),
    );
    if (done) close();
    await onChanged();
  };
  return (
    <section
      className="space-y-3 border-b border-border pb-8"
      aria-label={c("공개 범위", "Visibility")}
    >
      <h2 className="font-medium">{c("공개 범위", "Visibility")}</h2>
      <p className="max-w-3xl text-sm leading-6 text-muted">
        {project.visibility === "team"
          ? c(
              "팀 전체 공개: 팀의 모든 내부 멤버가 이 폴더와 발행된 영상을 보고 코멘트할 수 있고, 팀 검토자를 제외한 멤버는 팀 공용 클라우드처럼 자료를 올리고 받고 결과를 발행할 수 있습니다. 공개 범위·완료·승인자·공유 링크 관리는 담당자만 합니다. 외부 참여자는 담당자가 회차에 추가하거나 공유 링크를 보낼 때만 봅니다. AI 사용은 자료별 권한을 따릅니다.",
              "Team-wide: every internal team member can see this folder and its published videos and comment on them; members other than team reviewers can also upload and download files and publish results, like a shared team cloud. Visibility, completion, approver and share links stay with the lead. External participants see a video only when the lead adds them to the round or sends a share link. AI use follows per-file permissions.",
            )
          : c(
              "비공개: 참여자만 이 폴더를 볼 수 있습니다. 참여하지 않은 소유자·관리자에게도 보이지 않습니다. 발행 영상은 내부 참여자에게 자동 공개되고, 외부 참여자는 담당자가 회차에 추가하거나 공유 링크를 보낼 때만 봅니다.",
              "Private: only participants can see this folder, including owners and admins who don't participate. Published videos open to internal participants automatically; external participants see them only when the lead adds them to the round or sends a share link.",
            )}
      </p>
      {project.allowedActions.changeVisibility && !open && (
        <button
          type="button"
          className={secondaryClass}
          onClick={() => setOpen(true)}
        >
          {widening
            ? c("팀 전체 공개로 바꾸기", "Make team-wide")
            : c("비공개로 바꾸기", "Make private")}
        </button>
      )}
      {open && (
        <ConfirmDialog
          label={
            widening
              ? c("팀 전체 공개로 바꾸기", "Make team-wide")
              : c("비공개로 바꾸기", "Make private")
          }
          onClose={close}
        >
          <h3 className="font-medium">
            {widening
              ? c("팀 전체 공개로 바꿀까요?", "Make this folder team-wide?")
              : c("비공개로 바꿀까요?", "Make this folder private?")}
          </h3>
          <p className="text-sm leading-6 text-muted">
            {widening
              ? c(
                  "팀의 모든 내부 멤버가 이 폴더, 발행된 영상과 그 코멘트를 보고 코멘트할 수 있게 됩니다. 팀 검토자를 제외한 멤버는 자료를 올리고 받고 결과를 발행할 수 있게 됩니다. AI 사용은 계속 자료별 권한을 따르고, 외부 참여자는 초대받은 폴더만 봅니다.",
                  "Every internal team member will see this folder, its published videos and their comments, and can comment. Members other than team reviewers can also upload and download files and publish results. AI use still follows per-file permissions; external people still see only folders they were invited to.",
                )
              : c(
                  "참여자만 볼 수 있게 됩니다. 참여하지 않은 팀원은 다음 동작부터 이 폴더에 접근할 수 없고, 그동안 남긴 코멘트는 기록에 남습니다.",
                  "Only participants will see it. Team members who don't participate lose access on their next action; comments they already left stay in the record.",
                )}
          </p>
          {widening && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={mutation.busy}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {c(
                "모든 팀원에게 공개되는 범위를 확인했습니다",
                "I understand every team member will see it",
              )}
            </label>
          )}
          <label className="block space-y-2 text-sm">
            <span>
              {widening
                ? c("공개 사유(필수)", "Reason (required)")
                : c("사유(선택)", "Reason (optional)")}
            </span>
            <input
              className={inputClass}
              value={reason}
              maxLength={1000}
              disabled={mutation.busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {mutation.error && <B2bError code={mutation.error} />}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryClass}
              disabled={
                mutation.busy || (widening && (!confirmed || !reason.trim()))
              }
              onClick={() => void submit()}
            >
              {widening
                ? c("팀 전체 공개로 바꾸기", "Make team-wide")
                : c("비공개로 바꾸기", "Make private")}
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={mutation.busy}
              onClick={close}
            >
              {c("취소", "Cancel")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}

function ProjectEditor({
  project,
  onSaved,
  onRefresh,
}: {
  project: Project;
  onSaved: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const c = useCopy();
  const [name, setName] = useState(project.name);
  const [brief, setBrief] = useState(project.brief);
  const [working, setWorking] = useState(project.requiresWorkingFiles);
  const [originals, setOriginals] = useState(project.shareOriginals);
  const [revision, setRevision] = useState(project.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const input = {
          name: name.trim(),
          brief: brief.trim(),
          requiresWorkingFiles: working,
          shareOriginals: originals,
          revision,
        };
        const fingerprint = JSON.stringify(input);
        if (pending.current && pending.current.fingerprint !== fingerprint) {
          setError("B2B_REQUEST_KEY_CONFLICT");
          return;
        }
        pending.current ??= { fingerprint, key: crypto.randomUUID() };
        setBusy(true);
        setError("");
        try {
          await b2bService.updateProject(project.workspaceId, project.id, {
            ...input,
            requestKey: pending.current.key,
          });
          pending.current = null;
          await onSaved();
        } catch (e) {
          setError(errorCode(e));
          if (freeIntent(pending.current, e)) pending.current = null;
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="block space-y-2 text-sm">
        <span>{c("폴더명", "Folder name")}</span>
        <input
          className={inputClass}
          required
          maxLength={100}
          disabled={busy || !!pending.current}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block space-y-2 text-sm">
        <span>{c("작업 개요", "Brief")}</span>
        <textarea
          aria-label={c("작업 개요", "Brief")}
          className={`${inputClass} min-h-36`}
          maxLength={5000}
          disabled={busy || !!pending.current}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={working}
          disabled={busy || !!pending.current}
          onChange={(e) => setWorking(e.target.checked)}
        />
        {c(
          "납품에 작업 파일 확인 필요",
          "Require verified working files for delivery",
        )}
      </label>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={originals}
          disabled={busy || !!pending.current}
          onChange={(e) => setOriginals(e.target.checked)}
        />
        {c("원본 공유 허용", "Allow original sharing")}
      </label>
      {error && <B2bError code={error} />}
      {revision !== project.revision && (
        <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
          <p>
            {c("최신 내용", "Current server version")}: {project.name}
          </p>
          <p className="whitespace-pre-wrap text-muted">{project.brief}</p>
          <p>
            {c("작업 파일 확인", "Working file verification")}:{" "}
            {project.requiresWorkingFiles
              ? c("필수", "Required")
              : c("선택", "Optional")}
          </p>
          <button
            type="button"
            className={secondaryClass}
            disabled={busy}
            onClick={() => {
              pending.current = null;
              setRevision(project.revision);
              setError("");
            }}
          >
            {c(
              "차이를 확인하고 내 입력으로 저장 준비",
              "Keep my draft after reviewing changes",
            )}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className={primaryClass}
          disabled={busy || !name.trim() || revision !== project.revision}
        >
          {busy ? c("저장 중…", "Saving…") : c("변경 저장", "Save changes")}
        </button>
        <button
          type="button"
          className={secondaryClass}
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          {c("최신 내용 확인", "Check current version")}
        </button>
      </div>
    </form>
  );
}

export function ProjectParticipants({ projectId }: { projectId: string }) {
  const { context, id, project, error, reload } = useProject(projectId);
  const c = useCopy();
  const [roster, setRoster] = useState<ProjectPeople | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [target, setTarget] = useState("");
  const [role, setRole] = useState<"producer" | "reviewer">("producer");
  const [download, setDownload] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ hash: string; key: string } | null>(null);
  const active = !!project && projectSurfaces(project.role).people;
  const loadPeople = useCallback(async () => {
    if (!active) return;
    try {
      setRoster(await b2bService.people(id, projectId));
      setRosterError("");
    } catch (e) {
      setRoster(null);
      setRosterError(errorCode(e));
    }
  }, [id, projectId, active]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadPeople(), 0);
    return () => clearTimeout(timer);
  }, [loadPeople, project?.revision]);
  if (error) return <B2bError code={error} retry={() => void reload()} />;
  if (!project) return <TeamLoading />;
  if (!active)
    return (
      <B2bError
        code={
          project.role === "viewer"
            ? "B2B_PROJECT_PARTICIPATION_REQUIRED"
            : "B2B_PROJECT_PEOPLE_RESTRICTED"
        }
      />
    );
  const editable = project.allowedActions.managePeople;
  const mutate = async (
    input:
      | {
          userId: string;
          role: "producer" | "reviewer";
          canDownload: boolean;
          remove?: boolean;
        }
      | { targetId: string },
  ) => {
    if (busy || !reason.trim()) return;
    const body = {
      ...input,
      revision: project.revision,
      reason: reason.trim(),
    };
    const hash = JSON.stringify(body);
    if (pending.current && pending.current.hash !== hash) {
      setRosterError("B2B_REQUEST_KEY_CONFLICT");
      return;
    }
    pending.current ??= { hash, key: crypto.randomUUID() };
    setBusy(true);
    setRosterError("");
    try {
      if ("targetId" in input)
        await b2bService.transferLead(id, projectId, {
          ...body,
          ...input,
          requestKey: pending.current.key,
        });
      else
        await b2bService.changeParticipant(id, projectId, {
          ...body,
          ...input,
          requestKey: pending.current.key,
        });
      pending.current = null;
      await reload();
      await loadPeople();
    } catch (e) {
      setRosterError(errorCode(e));
      if (freeIntent(pending.current, e)) pending.current = null;
    } finally {
      setBusy(false);
    }
  };
  return (
    <TeamShell
      title={c("폴더 참여자", "Folder participants")}
      description={project.name}
    >
      <SpaceBadge workspace={context.data.workspace} />
      <Link
        className={secondaryClass}
        href={`/dashboard/workspaces/${id}/projects/${projectId}`}
      >
        {c("폴더 개요", "Folder overview")}
      </Link>
      {rosterError && (
        <B2bError code={rosterError} retry={() => void loadPeople()} />
      )}
      {!roster ? (
        !rosterError && <TeamLoading />
      ) : (
        <ul className="divide-y divide-border">
          {roster.people.map((person) => (
            <li
              className="flex flex-wrap items-center justify-between gap-3 py-4"
              key={person.userId}
            >
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">
                  {person.name || person.email}
                </p>
                {person.name && (
                  <p className="mt-1 break-all text-xs text-muted">
                    {person.email}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted">
                  {person.kind === "external"
                    ? c("외부 참여자", "External")
                    : c("내부 참여자", "Internal")}{" "}
                  ·{" "}
                  {person.role === "lead"
                    ? c("담당자", "Lead")
                    : person.role === "producer"
                      ? c("제작자", "Producer")
                      : c("검토자", "Reviewer")}{" "}
                  ·{" "}
                  {person.canDownload
                    ? c("다운로드 허용", "Downloads allowed")
                    : c("다운로드 비허용", "Downloads denied")}
                </p>
              </div>
              {editable && person.role !== "lead" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    className={secondaryClass}
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void mutate({
                        userId: person.userId,
                        role: person.role as "producer" | "reviewer",
                        canDownload: person.canDownload,
                        remove: true,
                      })
                    }
                  >
                    {c("참여 종료", "Remove")}
                  </button>
                  {person.kind === "internal" && (
                    <button
                      className={secondaryClass}
                      disabled={busy || !reason.trim()}
                      onClick={() => void mutate({ targetId: person.userId })}
                    >
                      {c("담당자 이전", "Transfer lead")}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form
          className="max-w-2xl space-y-4 border-t border-border pt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void mutate({ userId: target, role, canDownload: download });
          }}
        >
          <h2 className="font-medium">
            {c("참여 범위 변경", "Change participation")}
          </h2>
          <label className="block space-y-2 text-sm">
            <span>{c("팀 참여자", "Team participant")}</span>
            <select
              aria-label={c("팀 참여자", "Team participant")}
              className={inputClass}
              required
              disabled={busy || !!pending.current}
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                const person = roster?.people.find(
                  (p) => p.userId === e.target.value,
                );
                setRole(person?.role === "reviewer" ? "reviewer" : "producer");
                setDownload(person?.canDownload ?? false);
              }}
            >
              <option value="">{c("선택", "Select")}</option>
              {context.data.members
                .filter(
                  (m) =>
                    !m.suspendedAt &&
                    m.userId !== project.leadId &&
                    roster?.people.some((p) => p.userId === m.userId),
                )
                .map((m) => (
                  <option value={m.userId} key={m.userId}>
                    {m.name || m.email}
                  </option>
                ))}
            </select>
          </label>
          <label className="block space-y-2 text-sm">
            <span>{c("폴더 역할", "Folder role")}</span>
            <select
              aria-label={c("폴더 역할", "Folder role")}
              className={inputClass}
              disabled={busy || !!pending.current}
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "producer" | "reviewer")
              }
            >
              <option value="producer">{c("제작자", "Producer")}</option>
              <option value="reviewer">{c("검토자", "Reviewer")}</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={download}
              disabled={busy || !!pending.current}
              onChange={(e) => setDownload(e.target.checked)}
            />
            {c("다운로드 허용", "Allow downloads")}
          </label>
          <label className="block space-y-2 text-sm">
            <span>
              {c(
                "변경·종료·이전 사유",
                "Reason for change, removal or handoff",
              )}
            </span>
            <textarea
              aria-label={c(
                "변경·종료·이전 사유",
                "Reason for change, removal or handoff",
              )}
              className={inputClass}
              maxLength={1000}
              required
              disabled={busy || !!pending.current}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            className={primaryClass}
            disabled={busy || !target || !reason.trim()}
          >
            {busy
              ? c("처리 중…", "Saving…")
              : c("참여 범위 저장", "Save participation")}
          </button>
        </form>
      )}
      {project.role === "lead" && (
        <InvitationPanel projectId={projectId} editable={editable} />
      )}
    </TeamShell>
  );
}
