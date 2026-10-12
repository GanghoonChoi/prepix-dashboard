"use client";
import { InvitationPanel } from "./invitations";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
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
import {
  Avatar,
  Badge,
  Button,
  Field,
  Select,
  tableClass,
  tdClass,
  textareaClass,
  thClass,
  Toolbar,
  InfoTip,
} from "@/components/ui";
import {
  Block,
  ConfirmDialog,
  inputClass,
  Notice,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { useI18n } from "@/lib/i18n/context";
import { ReviewList, useRun } from "./reviews";
import {
  B2bError,
  errorCode,
  useCopy,
  accessEnded,
  freeIntent,
  projectFrame,
  projectsDenial,
} from "./shared";

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
  const { lang } = useI18n();
  const [editing, setEditing] = useState(false);
  if (error && !project)
    return <B2bError code={error} retry={() => void reload()} />;
  if (!project) return <TeamLoading />;
  const settable = project.allowedActions.edit || project.allowedActions.changeVisibility;
  return (
    <TeamShell
      {...projectFrame(id, project, c, lang)}
      // The brief, when there is one, is a line under the name — not a block.
      description={project.brief || undefined}
      actions={
        settable && (
          <Button
            variant="secondary"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
          >
            {editing ? c("영상 보기", "Back to videos") : c("설정", "Settings")}
          </Button>
        )
      }
    >
      {error && <B2bError code={error} retry={() => void reload()} />}
      {project.role === "viewer" && (
        <Notice role="note">
          {c(
            "팀 공개 프로젝트를 열람 중입니다. 작업하려면 관리자에게 참여를 요청하세요.",
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
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {widening
              ? c("팀 전체 공개로 바꾸기", "Make team-wide")
              : c("비공개로 바꾸기", "Make private")}
          </Button>
        )
      }
    >
      <InfoTip label={c("이 프로젝트에서 누가 무엇을 할 수 있나요?", "Who can do what in this project?")} text={c("누가 무엇을 할 수 있나요?", "Who can do what?")}>
        {project.visibility === "team" ? (
          <p>
            {c(
              "뷰어를 제외한 멤버는 팀 공용 클라우드처럼 자료를 올리고 받고 결과를 발행할 수 있습니다. 공개 범위와 공유 링크는 프로젝트를 올린 사람과 소유자·관리자가 관리합니다. 영상 승인은 참여자 누구나 할 수 있습니다. AI 사용은 자료별 권한을 따릅니다.",
              "Members other than team viewers can upload and download files and publish results, like a shared team cloud. Visibility and share links stay with whoever brought the project in and the owner and admins; anyone taking part can approve a video. AI use follows per-file permissions.",
            )}
          </p>
        ) : (
          <p>
            {c(
              "참여자와 소유자·관리자에게만 보입니다. 발행 영상은 내부 참여자에게 자동 공개됩니다.",
              "Only participants and the team's owners and admins see it. Published videos open to internal participants automatically.",
            )}
          </p>
        )}
        <p>
          {c(
            "외부 참여자는 자기가 발행한 결과의 회차와, 관리하는 사람이 회차에 추가하거나 공유 링크를 보낸 영상만 봅니다.",
            "External participants see the rounds of results they published themselves, and others only when the lead adds them to the round or sends a share link.",
          )}
        </p>
      </InfoTip>
      {open && (
        <ConfirmDialog
          label={
            widening
              ? c("팀 전체 공개로 바꾸기", "Make team-wide")
              : c("비공개로 바꾸기", "Make private")
          }
          onClose={close}
        >
          <h3 className="text-base font-semibold">
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
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={mutation.busy}
              aria-busy={mutation.busy}
              onClick={() => void submit()}
            >
              {widening
                ? c("팀 전체 공개로 바꾸기", "Make team-wide")
                : c("비공개로 바꾸기", "Make private")}
            </Button>
            <Button variant="secondary" disabled={mutation.busy} onClick={close}>
              {c("취소", "Cancel")}
            </Button>
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
  const nameId = useId(),
    briefId = useId();
  return (
    <form
      className="max-w-xl space-y-5"
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
      <Field label={c("프로젝트명", "Project name")} htmlFor={nameId}>
        <input
          id={nameId}
          className={inputClass}
          required
          maxLength={100}
          disabled={busy || !!pending.current}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label={c("작업 개요", "Brief")} htmlFor={briefId}>
        <textarea
          id={briefId}
          aria-label={c("작업 개요", "Brief")}
          className={textareaClass}
          rows={5}
          maxLength={5000}
          disabled={busy || !!pending.current}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
        />
      </Field>
      {error && <B2bError code={error} />}
      {revision !== project.revision && (
        <Notice role="status">
          <div className="space-y-2">
            <p>
              {c("최신 내용", "Current server version")}: {project.name}
            </p>
            <p className="whitespace-pre-wrap text-muted">{project.brief}</p>
            <Button
              variant="secondary"
              size="sm"
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
            </Button>
          </div>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          aria-busy={busy}
          disabled={busy || !name.trim() || revision !== project.revision}
        >
          {busy ? c("저장 중…", "Saving…") : c("변경 저장", "Save changes")}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void onRefresh()}
        >
          {c("최신 내용 확인", "Check current version")}
        </Button>
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
  const { lang } = useI18n();
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
  const people = [...roster?.people ?? []].sort(
    (a, b) => Number(b.role === "lead") - Number(a.role === "lead"),
  );
  return (
    <TeamShell {...projectFrame(id, project, c, lang)}>
      {rosterError && (
        <B2bError code={rosterError} retry={() => void loadPeople()} />
      )}
      {!roster ? (
        !rosterError && <TeamLoading />
      ) : (
        <section className="space-y-2">
          <Toolbar title={c("프로젝트 멤버", "Project people")} count={people.length} />
          <table className={`${tableClass} table-fixed`}>
            <thead>
              <tr>
                <th className={thClass}>{c("이름", "Name")}</th>
                <th className={`${thClass} w-32`}>{c("역할", "Role")}</th>
                <th className={`${thClass} w-12`}>
                  <span className="sr-only">{c("작업", "Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => {
                const name = person.name || person.email;
                const lead = person.role === "lead";
                return (
                  <tr key={person.userId} data-person={person.email}>
                    <td className={tdClass}>
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar id={person.userId} name={name} />
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-medium">{name}</span>
                            {person.kind === "external" && <Badge>{c("외부", "Guest")}</Badge>}
                            {person.canDownload && !lead && <Badge>{c("다운로드", "Download")}</Badge>}
                          </div>
                          {person.name && (
                            <p className="truncate text-xs text-muted">{person.email}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={tdClass}>
                      {editable && !lead ? (
                        <Select
                          size="sm"
                          aria-label={c(`${name} 역할`, `Role of ${name}`)}
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
                        </Select>
                      ) : (
                        <span className="text-muted">
                          {lead ? c("올린 사람", "Creator") : person.role === "producer" ? c("편집자", "Editor") : c("뷰어", "Viewer")}
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      {editable && !lead && (
                        <RowMenu label={c(`${name} 작업`, `Actions for ${name}`)}>
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      {project.role === "lead" && (
        <InvitationPanel projectId={projectId} editable={editable} />
      )}
    </TeamShell>
  );
}
