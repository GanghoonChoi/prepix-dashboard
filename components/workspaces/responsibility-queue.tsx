"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useWorkspace } from "./workspace-context";
import { useI18n } from "@/lib/i18n/context";
import { workspaceService } from "@/lib/api/services/workspace.service";
import { inputClass, primaryClass } from "./shared";
import { CloudError, cloudErrorCode } from "./cloud-shared";
export function ResponsibilityQueue() {
  const context = useWorkspace()!;
  const { data } = context;
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setProjects(
        (await workspaceService.management(data.workspace.id))
          .unassignedProjects,
      );
      setError("");
    } catch (e) {
      setError(cloudErrorCode(e));
    }
  }, [data.workspace.id]);
  // A fresh `members` array arrives from every 30s poll even when nothing
  // changed, so key the refetch on the membership itself.
  const roster = data.members
    .map((m) => `${m.userId}:${m.role}:${!!m.suspendedAt}`)
    .join(",");
  useEffect(() => {
    void load();
  }, [load, roster]);
  if (!projects.length && !error) return null;
  return (
    <section className="space-y-4 rounded-xl border border-border p-5">
      <h2 className="font-medium">
        {c("담당자 지정이 필요한 프로젝트", "Projects awaiting a manager")}
      </h2>
      <p className="text-sm leading-6 text-muted">
        {c(
          "프로젝트를 맡을 멤버를 지정하세요. 파일과 기록은 보존되어 있으며 관리자가 계속 관리할 수 있습니다.",
          "Assign a member to manage each project. Files and history remain available to administrators.",
        )}
      </p>
      {error && <CloudError code={error} retry={load} />}
      {projects.map((project) => (
        <form
          key={project.id}
          className="flex flex-wrap items-center gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(project.id);
            setError("");
            try {
              await workspaceService.assign(
                data.workspace.id,
                project.id,
                targets[project.id],
              );
              await load();
            } catch (e) {
              setError(cloudErrorCode(e));
            } finally {
              setBusy("");
            }
          }}
        >
          <Link
            className="min-w-0 flex-1 break-words text-sm underline"
            href={`/dashboard/workspaces/${data.workspace.id}/projects/${project.id}`}
          >
            {project.name}
          </Link>
          <select
            aria-label={`${project.name} ${c("담당자", "manager")}`}
            className={`${inputClass} sm:max-w-64`}
            required
            disabled={!!busy}
            value={targets[project.id] || ""}
            onChange={(e) =>
              setTargets({ ...targets, [project.id]: e.target.value })
            }
          >
            <option value="">{c("담당자 선택", "Select a manager")}</option>
            {data.members
              .filter((m) => !m.suspendedAt && m.role !== "reviewer")
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || m.email}
                </option>
              ))}
          </select>
          <button
            className={primaryClass}
            disabled={!!busy || !targets[project.id]}
          >
            {c("배정", "Assign")}
          </button>
        </form>
      ))}
    </section>
  );
}
