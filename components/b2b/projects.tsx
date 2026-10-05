"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  b2bService,
  type Project,
  type ProjectState,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import {
  B2bError,
  errorCode,
  StateBadge,
  stateLabels,
  useCopy,
  definitivelyRejected,
} from "./shared";

export function Projects() {
  const context = useWorkspace()!;
  const c = useCopy();
  const id = context.data.workspace.id;
  const base = `/dashboard/workspaces/${id}/projects`;
  const status = context.b2b;
  const permitted = !!status?.enrolled && status.allowedActions.projects;
  const [rows, setRows] = useState<Project[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      if (!permitted) return;
      const request = ++serial.current;
      setBusy(true);
      try {
        const result = await b2bService.projects(id, {
          search: search || undefined,
          state: state || undefined,
          cursor: next,
        });
        if (request !== serial.current) return;
        setRows((previous) =>
          next
            ? [
                ...(previous ?? []),
                ...result.projects.filter(
                  (p) => !previous?.some((old) => old.id === p.id),
                ),
              ]
            : result.projects,
        );
        setCursor(result.nextCursor);
        setError("");
      } catch (e) {
        if (request !== serial.current) return;
        setError(errorCode(e));
        // Never keep private titles on screen after an access refusal.
        setRows(null);
        setCursor(null);
      } finally {
        if (request === serial.current) setBusy(false);
      }
    },
    [id, permitted, search, state],
  );
  useEffect(() => {
    const sequence = serial;
    const initial = window.setTimeout(() => void load(), 250);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      ++sequence.current;
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  if (!status) return <TeamLoading />;
  if (!permitted)
    return (
      <B2bError
        code={
          status.enrolled
            ? `B2B_TEAM_${status.team.currentState.toUpperCase()}`
            : "B2B_PROJECT_NOT_FOUND"
        }
      />
    );
  return (
    <TeamShell
      title={c("프로젝트", "Projects")}
      description={c(
        "현재 참여 중인 프로젝트만 표시됩니다.",
        "Only projects you currently participate in are shown.",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpaceBadge workspace={context.data.workspace} />
        {status.enrolled && status.allowedActions.createProject && (
          <Link className={primaryClass} href={`${base}/new`}>
            {c("프로젝트 만들기", "Create project")}
          </Link>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="space-y-2 text-sm">
          <span>{c("이름으로 검색", "Search by name")}</span>
          <input
            className={inputClass}
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span>{c("상태", "State")}</span>
          <select
            aria-label={c("상태", "State")}
            className={inputClass}
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="">{c("전체", "All")}</option>
            {(
              [
                "draft",
                "in_progress",
                "completed",
                "archived",
              ] as ProjectState[]
            ).map((s) => (
              <option key={s} value={s}>
                {c(...stateLabels[s])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <B2bError code={error} retry={() => void load()} />}
      {rows === null && !error ? (
        <TeamLoading />
      ) : rows?.length === 0 ? (
        <p className="py-8 text-sm leading-6 text-muted">
          {status.enrolled && status.member.kind === "internal"
            ? c(
                "참여한 프로젝트가 없습니다. 새 프로젝트를 만들 수 있습니다.",
                "You have no projects yet. Create one to begin.",
              )
            : c(
                "초대된 프로젝트가 없습니다. 프로젝트 담당자에게 문의하세요.",
                "There are no invited projects. Contact your project lead.",
              )}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows?.map((p) => (
            <li key={p.id}>
              <Link
                className="flex min-h-20 items-center justify-between gap-4 rounded-md py-5 focus-visible:outline-2 focus-visible:outline-offset-2 hover:bg-surface"
                href={`${base}/${p.id}`}
              >
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{p.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {p.role === "lead"
                      ? c("담당자", "Lead")
                      : p.role === "producer"
                        ? c("제작자", "Producer")
                        : c("검토자", "Reviewer")}
                  </p>
                </div>
                <StateBadge state={p.state} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          {busy ? c("불러오는 중…", "Loading…") : c("더 보기", "Load more")}
        </button>
      )}
    </TeamShell>
  );
}

export function NewProject() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const router = useRouter();
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [workingFiles, setWorkingFiles] = useState(false);
  const [originals, setOriginals] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  if (!b2b) return <TeamLoading />;
  if (!b2b.enrolled || !b2b.allowedActions.createProject)
    return <B2bError code="B2B_PROJECT_NOT_FOUND" />;
  return (
    <TeamShell
      title={c("프로젝트 만들기", "Create project")}
      description={c(
        "파일 없이 시작할 수 있습니다. 생성자는 프로젝트 담당자가 됩니다.",
        "Start without uploading files. You become the project lead.",
      )}
    >
      <SpaceBadge workspace={data.workspace} />
      <form
        className="max-w-2xl space-y-5"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const draft = {
            name: name.trim(),
            brief: brief.trim(),
            requiresWorkingFiles: workingFiles,
            shareOriginals: originals,
          };
          const fingerprint = JSON.stringify(draft);
          if (pending.current && pending.current.fingerprint !== fingerprint) {
            // The server may have committed a request whose response was lost.
            // Keep retrying that intent until its outcome is known.
            setError("B2B_REQUEST_KEY_CONFLICT");
            return;
          }
          pending.current ??= { fingerprint, key: crypto.randomUUID() };
          setBusy(true);
          setError("");
          try {
            const result = await b2bService.createProject(data.workspace.id, {
              ...draft,
              requestKey: pending.current.key,
            });
            router.replace(
              `/dashboard/workspaces/${data.workspace.id}/projects/${result.project.id}`,
            );
          } catch (e) {
            setError(errorCode(e));
            if (definitivelyRejected(e)) pending.current = null;
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>{c("프로젝트명", "Project name")}</span>
          <input
            className={inputClass}
            maxLength={100}
            required
            value={name}
            disabled={busy || !!pending.current}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block space-y-2 text-sm">
          <span>{c("작업 개요", "Brief")}</span>
          <textarea
            className={`${inputClass} min-h-36`}
            maxLength={5000}
            value={brief}
            disabled={busy || !!pending.current}
            onChange={(e) => setBrief(e.target.value)}
          />
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={workingFiles}
            disabled={busy || !!pending.current}
            onChange={(e) => setWorkingFiles(e.target.checked)}
          />
          <span>
            {c(
              "납품에 편집 가능한 작업 파일과 소스 확인 필요",
              "Require verified editable working files and sources for delivery",
            )}
          </span>
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={originals}
            disabled={busy || !!pending.current}
            onChange={(e) => setOriginals(e.target.checked)}
          />
          <span>
            {c(
              "프로젝트에서 원본 공유 허용",
              "Allow original sharing in the project",
            )}
          </span>
        </label>
        {error && <B2bError code={error} />}
        <button className={primaryClass} disabled={busy || !name.trim()}>
          {busy
            ? c("만드는 중…", "Creating…")
            : c("프로젝트 만들기", "Create project")}
        </button>
      </form>
    </TeamShell>
  );
}
