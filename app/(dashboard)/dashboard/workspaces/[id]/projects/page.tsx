"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderClosed, LockKeyhole, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { activityLabel } from "@/lib/workspaces/activity";
import {
  cloudService,
  type CloudOverview,
} from "@/lib/api/services/cloud.service";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import {
  TeamShell,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import {
  CloudError,
  cloudErrorCode,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
export default function ProjectsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <Content key={id} id={id} />;
}
function Content({ id }: { id: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<CloudOverview | null>(null);
  const [team, setTeam] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"projects" | "plan" | "activity">("projects");
  const [archive, setArchive] = useState(false);
  const [activity, setActivity] = useState<
    Awaited<ReturnType<typeof cloudService.activity>>
  >([]);
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
      setError(cloudErrorCode(e));
      setData(null);
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
      await cloudService.create(id, name);
      setName("");
      await load();
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <TeamShell
      title={team?.workspace.name ?? c("팀 프로젝트", "Team projects")}
      description={c(
        "함께 편집할 원본을 모으고, 프로젝트마다 참여할 멤버를 정하세요.",
        "Collect your source files and choose who can work on each project.",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav
          className="flex flex-wrap gap-2"
          aria-label={c("팀 메뉴", "Team navigation")}
        >
          {(
            [
              "projects",
              "plan",
              ...(team?.canManage ? ["activity"] : []),
            ] as const
          ).map((value) => (
            <button
              key={value}
              className={tab === value ? primaryClass : secondaryClass}
              aria-current={tab === value ? "page" : undefined}
              onClick={() => {
                setTab(value as typeof tab);
                if (value === "activity") {
                  setBusy(true);
                  void cloudService
                    .activity(id)
                    .then(setActivity)
                    .catch((e) => setError(cloudErrorCode(e)))
                    .finally(() => setBusy(false));
                }
              }}
            >
              {value === "projects"
                ? c("프로젝트", "Projects")
                : value === "plan"
                  ? c("플랜과 사용량", "Plan and usage")
                  : c("활동 기록", "Activity")}
            </button>
          ))}
        </nav>
        <Link className={secondaryClass} href={`/dashboard/workspaces/${id}`}>
          {c("멤버와 초대 관리", "Manage members")}
        </Link>
      </div>
      {error && <CloudError code={error} retry={load} />}
      {!data && !error && <TeamLoading />}
      {data && tab === "projects" && (
        <>
          <StorageMeter storage={data.storage} />
          {data.canCreate && (
            <form
              onSubmit={create}
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
            >
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
              <button disabled={busy || !name.trim()} className={primaryClass}>
                <Plus size={18} strokeWidth={1.5} />
                {busy
                  ? c("만드는 중…", "Creating…")
                  : c("프로젝트 만들기", "Create project")}
              </button>
            </form>
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
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                          <LockKeyhole size={12} strokeWidth={1.5} />
                          {c(
                            "지정 멤버만 접근",
                            "Restricted to project members",
                          )}
                        </p>
                      </div>
                      <ArrowUpRight size={20} strokeWidth={1.5} />
                    </Link>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-xs leading-5 text-muted">
            {c(
              "팀 소유자와 관리자는 모든 팀 프로젝트를 관리할 수 있습니다. 파일과 하위 폴더는 프로젝트 권한을 따릅니다.",
              "Workspace owners and admins can manage all team projects. Files and subfolders inherit project access.",
            )}
          </p>
        </>
      )}
      {data && tab === "plan" && (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-border p-6">
            <p className="text-xs text-muted">
              {c("현재 팀 플랜", "Current team plan")}
            </p>
            <h2 className="text-2xl font-medium">
              {c("팀 프리뷰", "Team preview")}
            </h2>
            <p className="max-w-xl text-sm leading-6 text-muted">
              {c(
                "팀 요금과 결제 시작일은 아직 정해지지 않았습니다. 현재 팀 사용으로 청구되거나 개인 구독이 변경되지 않습니다.",
                "Team pricing and billing start dates are not set. Current team use does not create a charge or change your personal subscription.",
              )}
            </p>
          </section>
          <section className="space-y-3 rounded-xl border border-border p-6">
            <h2 className="font-medium">{c("팀 좌석", "Team seats")}</h2>
            <p className="text-2xl font-medium tabular-nums">
              {data.plan.seats.used + data.plan.seats.reserved} /{" "}
              {data.plan.seats.limit}
            </p>
            <p className="text-sm leading-6 text-muted">
              {c(
                `멤버 ${data.plan.seats.used}명 · 초대 예약 ${data.plan.seats.reserved}명. 소유자·관리자·편집자는 좌석을 사용합니다. 검토자는 좌석을 사용하지 않습니다.`,
                `${data.plan.seats.used} members · ${data.plan.seats.reserved} reserved invitations. Owners, admins, and editors use seats. Reviewers do not.`,
              )}
            </p>
            <Link
              href={`/dashboard/workspaces/${id}`}
              className={secondaryClass}
            >
              {c("좌석과 초대 관리", "Manage seats and invitations")}
            </Link>
          </section>
          <StorageMeter storage={data.storage} />
          <p className="text-sm leading-6 text-muted">
            {c(
              "업로드 예약과 휴지통 파일도 저장 용량에 포함됩니다. 원본 보관 기한은 업로드 시점부터 1년이며 각 파일에 만료일을 표시합니다. 팀 AI 사용량과 자동 결제는 아직 제공하지 않습니다.",
              "Upload reservations and trashed files count toward storage. Originals expire one year after upload; each file shows its expiry date. Team AI allowances and automated billing are not available yet.",
            )}
          </p>
        </div>
      )}
      {data && tab === "activity" && (
        <section className="space-y-4">
          <h2 className="font-medium">
            {c("최근 활동 100건", "Latest 100 events")}
          </h2>
          {busy ? (
            <TeamLoading />
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border px-5">
              {activity.map((row) => (
                <li key={row.id} className="space-y-2 py-4">
                  <p className="text-sm">{row.actor}</p>
                  <p className="break-all text-xs text-muted">
                    {activityLabel(row.action, lang)} ·{" "}
                    {new Date(row.createdAt).toLocaleString(lang)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </TeamShell>
  );
}
