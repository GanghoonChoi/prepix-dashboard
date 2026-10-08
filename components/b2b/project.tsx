"use client";
import { InvitationPanel } from "./invitations";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { buildTeamProjectOpenUrl } from "@/lib/workspaces/app-link";
import {
  projectSurfaces,
  visibilityChange,
} from "@/lib/b2b-projects/visibility";
import {
  b2bService,
  type Project,
  type ProjectPeople,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { RowMenu, RowMenuItem } from "@/components/workspaces/row-menu";
import { Avatar, Tag } from "@/components/ui";
import {
  Block,
  ConfirmDialog,
  Details,
  inputClass,
  Notice,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { ReviewList, useRun } from "./reviews";
import {
  folderTabs,
  B2bError,
  errorCode,
  StateBadge,
  VisibilityBadge,
  useCopy,
  accessEnded,
  freeIntent, projectsDenial } from "./shared";

// ponytail: folder model (2026-10-07) — teammates don't open someone's work in the app; delete after merge
const APP_ENTRY = false;

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
    error: permitted ? error : context.b2b ? (projectsDenial(context.b2b) ?? "B2B_PROJECT_NOT_FOUND") : "",
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
  const { id, project, error, reload } = useProject(projectId);
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
  const settable = project.allowedActions.edit || project.allowedActions.changeVisibility;
  return (
    <TeamShell
      title={project.name}
      // The brief, when there is one, is a line under the name — not a block.
      description={project.brief || undefined}
      tabs={folderTabs(id, project, c)}
      actions={
        <>
          {/* The folder's state sits with its name, not on a row of its own. */}
          <div className="flex items-center gap-2">
            <StateBadge state={project.state} />
            <VisibilityBadge visibility={project.visibility} />
          </div>
          {APP_ENTRY && appUrl && surfaces.app && (
            <a className={secondaryClass} href={appUrl}>
              {c("앱에서 작업하기", "Work in app")}
            </a>
          )}
          {settable && (
            <button
              className={secondaryClass}
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? c("영상 보기", "Back to videos") : c("설정", "Settings")}
            </button>
          )}
        </>
      }
    >
      {error && <B2bError code={error} retry={() => void reload()} />}
      {project.role === "viewer" && (
        <Notice role="note">
          {c(
            "팀 공개 프로젝트를 열람 중입니다. 작업하려면 담당자에게 참여를 요청하세요.",
            "You are viewing a team-wide project. Ask the lead to add you to work on it.",
          )}
        </Notice>
      )}
      {/* 2026-10-08: a project is its videos. Name, brief, original
          sharing and who sees it are settings, one button away. */}
      {editing && settable ? (
        <>
          {project.allowedActions.edit && (
            <ProjectEditor
              key={project.id}
              project={project}
              onSaved={async () => {
                setEditing(false);
                await reload();
              }}
              onRefresh={reload}
            />
          )}
          <VisibilitySection project={project} onChanged={reload} />
        </>
      ) : (
        <ReviewList projectId={projectId} />
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
  const mutation = useRun();
  const widening = project.visibility === "private";
  const close = () => {
    setOpen(false);
    mutation.setError("");
  };
  const submit = async () => {
    const input = visibilityChange(project);
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
    <Block
      title={c("공개 범위", "Visibility")}
      description={
        project.visibility === "team"
          ? c(
              "팀의 모든 내부 멤버가 이 프로젝트를 보고 함께 작업합니다.",
              "Every internal team member can see and work in this project.",
            )
          : c(
              "참여자만 이 프로젝트를 볼 수 있습니다.",
              "Only participants can see this project.",
            )
      }
      actions={
        project.allowedActions.changeVisibility &&
        !open && (
          <button
            type="button"
            className={secondaryClass}
            onClick={() => setOpen(true)}
          >
            {widening
              ? c("팀 전체 공개로 바꾸기", "Make team-wide")
              : c("비공개로 바꾸기", "Make private")}
          </button>
        )
      }
    >
      <Details>
        {project.visibility === "team" ? (
          <p>
            {c(
              "뷰어를 제외한 멤버는 팀 공용 클라우드처럼 자료를 올리고 받고 결과를 발행할 수 있습니다. 공개 범위·완료·승인자·공유 링크 관리는 담당자만 합니다. AI 사용은 자료별 권한을 따릅니다.",
              "Members other than team reviewers can upload and download files and publish results, like a shared team cloud. Visibility, completion, approver and share links stay with the lead. AI use follows per-file permissions.",
            )}
          </p>
        ) : (
          <p>
            {c(
              "참여하지 않은 소유자·관리자에게도 보이지 않습니다. 발행 영상은 내부 참여자에게 자동 공개됩니다.",
              "Owners and admins who don't participate can't see it either. Published videos open to internal participants automatically.",
            )}
          </p>
        )}
        <p>
          {c(
            "외부 참여자는 자기가 발행한 결과의 회차와, 담당자가 회차에 추가하거나 공유 링크를 보낸 영상만 봅니다.",
            "External participants see the rounds of results they published themselves, and others only when the lead adds them to the round or sends a share link.",
          )}
        </p>
      </Details>
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
              ? c("팀 전체 공개로 바꿀까요?", "Make this project team-wide?")
              : c("비공개로 바꿀까요?", "Make this project private?")}
          </h3>
          <p className="text-sm leading-6 text-muted">
            {widening
              ? c(
                  "팀의 모든 내부 멤버가 이 프로젝트, 발행된 영상과 그 코멘트를 보고 코멘트할 수 있게 됩니다. 뷰어를 제외한 멤버는 자료를 올리고 받고 결과를 발행할 수 있게 됩니다. AI 사용은 계속 자료별 권한을 따르고, 외부 참여자는 초대받은 프로젝트만 봅니다.",
                  "Every internal team member will see this project, its published videos and their comments, and can comment. Members other than team reviewers can also upload and download files and publish results. AI use still follows per-file permissions; external people still see only projects they were invited to.",
                )
              : c(
                  "참여자만 볼 수 있게 됩니다. 참여하지 않은 팀원은 다음 동작부터 이 프로젝트에 접근할 수 없고, 그동안 남긴 코멘트는 기록에 남습니다.",
                  "Only participants will see it. Team members who don't participate lose access on their next action; comments they already left stay in the record.",
                )}
          </p>
          {mutation.error && <B2bError code={mutation.error} />}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primaryClass}
              disabled={mutation.busy}
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
    </Block>
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
  const [revision, setRevision] = useState(project.revision);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  return (
    <form
      className="max-w-xl space-y-6"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const input = {
          name: name.trim(),
          brief: brief.trim(),
          // Delivery settings left the form (2026-10-08); they keep their values.
          requiresWorkingFiles: project.requiresWorkingFiles,
          shareOriginals: project.shareOriginals,
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
        <span>{c("프로젝트명", "Project name")}</span>
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
          className={`${inputClass} min-h-28`}
          maxLength={5000}
          disabled={busy || !!pending.current}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </label>
      {error && <B2bError code={error} />}
      {revision !== project.revision && (
        <Notice role="status">
          <div className="space-y-2">
            <p>
              {c("최신 내용", "Current server version")}: {project.name}
            </p>
            <p className="whitespace-pre-wrap text-muted">{project.brief}</p>
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
        </Notice>
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

/**
 * A project's people, like a Figma folder's share list (2026-10-08): each
 * row's role is changed where it is shown, the rest sits in the row's menu,
 * and the lead invites below. No reason to type.
 */
export function ProjectParticipants({ projectId }: { projectId: string }) {
  const { id, project, error, reload } = useProject(projectId);
  const c = useCopy();
  const [roster, setRoster] = useState<ProjectPeople | null>(null);
  const [rosterError, setRosterError] = useState("");
  const [busy, setBusy] = useState(false);
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
  const run = async (work: (base: { requestKey: string; revision: number }) => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setRosterError("");
    try {
      await work({ requestKey: crypto.randomUUID(), revision: project.revision });
    } catch (e) {
      setRosterError(errorCode(e));
    } finally {
      setBusy(false);
      await reload();
      await loadPeople();
    }
  };
  type Person = ProjectPeople["people"][number];
  const change = (
    person: Person,
    next: { role?: "producer" | "reviewer"; canDownload?: boolean; remove?: boolean },
    reason: string,
  ) =>
    run((base) =>
      b2bService.changeParticipant(id, projectId, {
        ...base,
        userId: person.userId,
        role: next.role ?? (person.role as "producer" | "reviewer"),
        canDownload: next.canDownload ?? person.canDownload,
        ...(next.remove ? { remove: true } : {}),
        reason,
      }),
    );
  return (
    <TeamShell
      title={c("프로젝트 멤버", "Project people")}
      description={project.name}
      tabs={folderTabs(id, project, c)}
    >
      {rosterError && (
        <B2bError code={rosterError} retry={() => void loadPeople()} />
      )}
      {!roster ? (
        !rosterError && <TeamLoading />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {[...roster.people]
            .sort((a, b) => Number(b.role === "lead") - Number(a.role === "lead"))
            .map((person) => {
            const name = person.name || person.email;
            const lead = person.role === "lead";
            return (
              <li
                className="flex items-center gap-3 py-3"
                key={person.userId}
                data-person={person.email}
              >
                <Avatar id={person.userId} name={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{name}</p>
                    {person.kind === "external" && <Tag>{c("외부", "Guest")}</Tag>}
                    {person.canDownload && !lead && <Tag>{c("다운로드", "Download")}</Tag>}
                  </div>
                  {person.name && (
                    <p className="truncate text-[13px] text-muted">{person.email}</p>
                  )}
                </div>
                {editable && !lead ? (
                  <select
                    aria-label={c(`${name} 역할`, `Role of ${name}`)}
                    className="w-24 rounded-md border border-transparent bg-transparent py-1 text-[13px] hover:border-border focus-visible:border-foreground/40 disabled:opacity-60"
                    value={person.role}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value as "producer" | "reviewer";
                      // An editor works with the files; a viewer only watches.
                      void change(person, { role: next, canDownload: next === "producer" }, "역할 변경");
                    }}
                  >
                    <option value="producer">{c("편집자", "Editor")}</option>
                    <option value="reviewer">{c("뷰어", "Viewer")}</option>
                  </select>
                ) : (
                  <span className="w-24 text-[13px] text-muted">
                    {lead ? c("담당자", "Lead") : person.role === "producer" ? c("편집자", "Editor") : c("뷰어", "Viewer")}
                  </span>
                )}
                <span className="w-8 text-right">
                  {editable && !lead && (
                    <RowMenu label={c(`${name} 작업`, `Actions for ${name}`)}>
                      {person.kind === "internal" && (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() =>
                            void run((base) =>
                              b2bService.transferLead(id, projectId, {
                                ...base,
                                targetId: person.userId,
                                reason: "담당자 지정",
                              }),
                            )
                          }
                        >
                          {c("담당자로 지정", "Make lead")}
                        </RowMenuItem>
                      )}
                      <RowMenuItem
                        disabled={busy}
                        onClick={() =>
                          void change(person, { canDownload: !person.canDownload }, "다운로드 권한 변경")
                        }
                      >
                        {person.canDownload
                          ? c("다운로드 막기", "Block downloads")
                          : c("다운로드 허용", "Allow downloads")}
                      </RowMenuItem>
                      <RowMenuItem
                        tone="danger"
                        disabled={busy}
                        onClick={() => void change(person, { remove: true }, "프로젝트에서 제외")}
                      >
                        {c("프로젝트에서 제외", "Remove from project")}
                      </RowMenuItem>
                    </RowMenu>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {project.role === "lead" && (
        <InvitationPanel projectId={projectId} editable={editable} />
      )}
    </TeamShell>
  );
}
