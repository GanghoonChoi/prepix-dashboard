"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderClosed, LockKeyhole, Plus, Users } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  cloudService,
  type CloudOverview,
  type ProjectVisibility,
} from "@/lib/api/services/cloud.service";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import {
  TeamShell,
  TeamLoading,
  SpaceBadge,
  inputClass,
  primaryClass,
} from "@/components/workspaces/shared";
import { isPersonal } from "@/lib/workspaces/kind";
import {
  CloudError,
  cloudErrorCode,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
import { contentGone } from "@/lib/workspaces/errors";
export default function ProjectsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}
function Content({ id }: { id: string }) {
  const { lang, t } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<CloudOverview | null>(null);
  const [team, setTeam] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  // F03.1: the creator picks, and 지정 멤버만 is the recommended default.
  const [visibility, setVisibility] = useState<ProjectVisibility>("restricted");
  const [archive, setArchive] = useState(false);
  const load = useCallback(async () => {
    try {
      const [next, workspace] = await Promise.all([
        cloudService.overview(id),
        workspaceService.detail(id),
      ]);
      setData(next);
      setTeam(workspace);
      setError("");
    } catch (e) {
      // Same rule as the workspace provider: a failed refresh (this also runs
      // on every window focus) keeps the projects that are already on screen
      // and shows a banner. Only a code that says the content is gone clears
      // it (§5.1).
      const code = cloudErrorCode(e);
      setError(code);
      if (contentGone(code)) {
        setData(null);
        setTeam(null);
      }
    }
  }, [id]);
  useEffect(() => {
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [load]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await cloudService.create(id, name, visibility);
      setName("");
      setVisibility("restricted");
      await load();
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy(false);
    }
  }
  const personal = !!team && isPersonal(team.workspace);
  return (
    <TeamShell
      title={
        personal
          ? t("team.personalTitle")
          : (team?.workspace.name ?? c("팀 프로젝트", "Team projects"))
      }
      description={
        personal
          ? c(
              "나만 접근하는 원본과 프로젝트입니다.",
              "Originals and projects only you can reach.",
            )
          : c(
              "함께 편집할 원본을 모으고, 프로젝트마다 참여할 멤버를 정하세요.",
              "Collect your source files and choose who can work on each project.",
            )
      }
    >
      {error && <CloudError code={error} retry={load} />}
      {!data && !error && <TeamLoading />}
      {data && (
        <>
          <StorageMeter storage={data.storage} />
          {data.canCreate && (
            <form
              onSubmit={create}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              {/*
                Creating a project is where the file goes, so which space it
                goes into is named right here — not only in the switcher two
                regions up the page.
              */}
              {team && (
                <div className="w-full sm:order-first sm:mb-1 sm:basis-full">
                  <SpaceBadge workspace={team.workspace} />
                </div>
              )}
              <div className="flex-1">
                <label htmlFor="project-name" className="mb-2 block text-sm">
                  {c("새 프로젝트", "New project")}
                </label>
                <input
                  id="project-name"
                  className={inputClass}
                  placeholder={c(
                    "예: 9월 브랜드 필름",
                    "e.g. September brand film",
                  )}
                  value={name}
                  maxLength={120}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              {!personal && (
              <div>
                <label htmlFor="project-visibility" className="mb-2 block text-sm">
                  {c("공개 범위", "Visibility")}
                </label>
                <select
                  id="project-visibility"
                  className={`${inputClass} sm:max-w-56`}
                  value={visibility}
                  onChange={(e) =>
                    setVisibility(e.target.value as ProjectVisibility)
                  }
                >
                  <option value="restricted">
                    {c("지정 멤버만", "Chosen members only")}
                  </option>
                  <option value="team">
                    {c("팀 전체", "Everyone on the team")}
                  </option>
                </select>
              </div>
              )}
              <button disabled={busy || !name.trim()} className={primaryClass}>
                <Plus size={18} strokeWidth={1.5} />
                {busy
                  ? c("만드는 중…", "Creating…")
                  : c("프로젝트 만들기", "Create project")}
              </button>
            </form>
          )}
          {data.canCreate && !personal && (
            <p className="text-xs leading-5 text-muted">
              {/*
                Visibility opens the door; it does not widen what is behind it.
                Saying otherwise would promise edit and download rights that the
                server still requires an explicit grant for.
              */}
              {visibility === "team"
                ? c(
                    "팀 전체가 이 프로젝트를 열어볼 수 있습니다. 업로드와 원본 다운로드 권한은 멤버별로 따로 정합니다.",
                    "Everyone on the team can open it. Upload and original download remain per-member grants.",
                  )
                : c(
                    "지정한 멤버만 이 프로젝트를 볼 수 있습니다. 소유자와 관리자는 항상 접근합니다.",
                    "Only the members you choose can see it. Owners and admins always have access.",
                  )}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-medium">
              {c("프로젝트", "Projects")}{" "}
              <span className="ml-2 text-sm tabular-nums text-muted">
                {data.projects.filter((p) => !!p.archivedAt === archive).length}
              </span>
            </h2>
            <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={archive}
                onChange={(e) => setArchive(e.target.checked)}
              />
              {c("보관된 프로젝트", "Archived projects")}
            </label>
          </div>
          {!data.projects.some((p) => !!p.archivedAt === archive) ? (
            <div className="space-y-3 rounded-xl border border-dashed border-border p-8 text-center">
              <FolderClosed
                className="mx-auto text-muted"
                size={28}
                strokeWidth={1.5}
              />
              <h3 className="font-medium">
                {c("아직 프로젝트가 없습니다", "No projects yet")}
              </h3>
              <p className="text-sm text-muted">
                {data.canCreate
                  ? c(
                      "프로젝트를 만든 후 원본을 올리고 동료를 추가하세요.",
                      "Create a project, upload your originals, and add collaborators.",
                    )
                  : c(
                      "팀 관리자에게 프로젝트 참여를 요청하세요.",
                      "Ask a team administrator to add you to a project.",
                    )}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {data.projects
                .filter((p) => !!p.archivedAt === archive)
                .map((project) => (
                  <li key={project.id}>
                    <Link
                      className="flex min-h-20 items-center gap-4 rounded-lg p-5 transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-foreground"
                      href={`/dashboard/workspaces/${id}/projects/${project.id}`}
                    >
                      <FolderClosed
                        size={22}
                        strokeWidth={1.5}
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="break-words font-medium">
                          {project.name}
                        </p>
                        {project.visibility && (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                            {project.visibility === "team" ? (
                              <Users size={12} strokeWidth={1.5} />
                            ) : (
                              <LockKeyhole size={12} strokeWidth={1.5} />
                            )}
                            {project.visibility === "team"
                              ? c("팀 전체 보기 가능", "Visible to the whole team")
                              : c("지정 멤버만 접근", "Chosen members only")}
                          </p>
                        )}
                      </div>
                      <ArrowUpRight size={20} strokeWidth={1.5} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs leading-5 text-muted">
            {personal
              ? t("team.personalDesc")
              : c(
                  "팀 소유자와 관리자는 모든 팀 프로젝트를 관리할 수 있습니다. 파일과 하위 폴더는 프로젝트 권한을 따릅니다.",
                  "Workspace owners and admins can manage all team projects. Files and subfolders inherit project access.",
                )}
          </p>
        </>
      )}
    </TeamShell>
  );
}
