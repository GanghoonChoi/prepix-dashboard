"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";
import { homeEnvironment } from "@/lib/b2b-home/home";
import {
  assertProjectListScope, decodeNavigation, encodeNavigation, initialNavigation,
  projectListKey, readProjectPages, type ProjectListScope,
} from "@/lib/b2b-projects/list";
import { useRouter } from "next/navigation";
import {
  b2bService,
  type Project,
  type ProjectState,
  type ProjectVisibility,
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
  VisibilityBadge,
  roleLabels,
  stateLabels,
  useCopy,
  freeIntent,
} from "./shared";

export function Projects() {
  const context = useWorkspace()!;
  const status = context.b2b;
  const scope: ProjectListScope = {
    origin: new URL(apiClient.defaults.baseURL!).origin,
    userId: context.data.currentUserId ?? "",
    workspaceId: context.data.workspace.id,
  };
  // Changing the actor/service/team grant replaces all private React state at render.
  const key = JSON.stringify([projectListKey(scope), status?.enrolled && [
    status.team.currentState, status.team.revision, status.member.revision,
    status.allowedActions.projects,
  ]]);
  return <ScopedProjects key={key} scope={scope} />;
}
function ScopedProjects({ scope: initialScope }: { scope: ProjectListScope }) {
  const [scope] = useState(initialScope);
  const context = useWorkspace()!;
  const c = useCopy();
  const id = scope.workspaceId;
  const base = `/dashboard/workspaces/${id}/projects`;
  const status = context.b2b;
  const permitted = !!status?.enrolled && status.allowedActions.projects;
  const [rows, setRows] = useState<Project[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [navigation, setNavigation] = useState(initialNavigation);
  const { search, state } = navigation;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const serial = useRef(0);
  const lifetime = useRef<AbortController | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const settings = useRef(initialNavigation());
  const restoring = useRef(true);
  const restoredScroll = useRef<number | null>(null);
  const persist = useCallback(() => {
    try { sessionStorage.setItem(projectListKey(scope), encodeNavigation(settings.current)); }
    catch { /* Storage unavailable: browsing remains usable. */ }
  }, [scope]);
  useLayoutEffect(() => {
    const sequence = serial;
    const controller = new AbortController();
    lifetime.current = controller;
    // React/Next may retain route state while effects are disconnected. Clear
    // private rows before its restored route can paint, not just on a new mount.
    setRows(null); setCursor(null);
    return () => {
      controller.abort(); sequence.current++;
      setRows(null); setCursor(null);
    };
  }, []);
  useEffect(() => {
    try { settings.current = decodeNavigation(sessionStorage.getItem(projectListKey(scope))); }
    catch { settings.current = initialNavigation(); }
    setNavigation(settings.current);
    setReady(true);
  }, [scope]);
  const load = useCallback(async (pages?: number) => {
    const controller = lifetime.current;
    if (!permitted || !ready || !controller || controller.signal.aborted) return;
    const request = ++serial.current;
    activeRequest.current?.abort();
    const read = new AbortController();
    activeRequest.current = read;
    const signal = AbortSignal.any([controller.signal, read.signal]);
    const target = pages ?? settings.current.pages;
    restoring.current = true;
    setRows(null); setCursor(null); setBusy(true); setError("");
    try {
      const result = await readProjectPages(scope,
        () => homeEnvironment(new URL(apiClient.defaults.baseURL!).origin), target,
        (cursor) => b2bService.projects(id, {
          search: search || undefined, state: state || undefined, cursor,
        }, scope.userId, signal), signal);
      if (request !== serial.current || controller.signal.aborted) return;
      settings.current = { ...settings.current, pages: result.pages };
      persist();
      restoredScroll.current = settings.current.scroll;
      setRows(result.projects); setCursor(result.nextCursor);
    } catch (e) {
      if (request !== serial.current || controller.signal.aborted) return;
      setError(errorCode(e)); setRows(null); setCursor(null);
    } finally {
      if (request === serial.current && !controller.signal.aborted) setBusy(false);
    }
  }, [id, permitted, ready, search, state, scope, persist]);
  useLayoutEffect(() => {
    if (rows === null || restoredScroll.current === null) return;
    const position = restoredScroll.current;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, position);
      restoredScroll.current = null;
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [rows]);
  useEffect(() => {
    if (!ready || !permitted) return;
    const sequence = serial;
    const initial = window.setTimeout(() => void load(), 250);
    const account = () => {
      try { assertProjectListScope(scope,
        homeEnvironment(new URL(apiClient.defaults.baseURL!).origin), lifetime.current?.signal); }
      catch {
        serial.current++; lifetime.current?.abort();
        setRows(null); setCursor(null); setBusy(false);
        setError("B2B_PROJECT_LIST_SCOPE_CHANGED");
        return false;
      }
      return true;
    };
    const refresh = () => {
      if (account() && document.visibilityState === "visible") void load();
    };
    const scroll = () => {
      if (!restoring.current) settings.current = { ...settings.current, scroll: window.scrollY };
    };
    const save = () => persist();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", account);
    window.addEventListener("workspaces:changed", refresh);
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      sequence.current++; persist(); clearTimeout(initial); clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", account);
      window.removeEventListener("workspaces:changed", refresh);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", save);
    };
  }, [load, ready, permitted, scope, persist]);
  const changeFilter = (change: Partial<Pick<typeof navigation, "search" | "state">>) => {
    serial.current++;
    activeRequest.current?.abort();
    settings.current = { ...settings.current, ...change, pages: 1, scroll: 0 };
    restoring.current = true;
    setRows(null); setCursor(null); setError("");
    setNavigation(settings.current); persist();
  };
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
        "참여 중인 프로젝트와 팀 공개 프로젝트가 표시됩니다.",
        "Projects you participate in and team-wide projects are shown.",
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
            onChange={(e) => changeFilter({ search: e.target.value })}
          />
        </label>
        <label className="space-y-2 text-sm">
          <span>{c("상태", "State")}</span>
          <select
            aria-label={c("상태", "State")}
            className={inputClass}
            value={state}
            onChange={(e) => changeFilter({ state: e.target.value })}
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
      {error === "B2B_PROJECT_LIST_SCOPE_CHANGED" ? (
        <div role="alert" className="space-y-3 text-sm">
          <p>{c("계정 또는 서비스가 변경되었습니다. 현재 권한으로 목록을 다시 확인해 주세요.", "The account or service changed. Reload the list with your current access.")}</p>
          <button className={secondaryClass} onClick={() => window.location.reload()}>{c("목록 다시 열기", "Reopen list")}</button>
        </div>
      ) : error && <B2bError code={error} retry={() => void load()} />}
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
                onClick={persist}
              >
                <div className="min-w-0">
                  <h2 className="truncate font-medium">{p.name}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {c(...roleLabels[p.role])}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <VisibilityBadge visibility={p.visibility} />
                  <StateBadge state={p.state} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button
          className={secondaryClass}
          disabled={busy}
          onClick={() => void load(settings.current.pages + 1)}
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
  const [visibility, setVisibility] = useState<ProjectVisibility>("team");
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
            visibility,
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
        <fieldset className="space-y-2 text-sm">
          <legend className="mb-2">{c("공개 범위", "Visibility")}</legend>
          {(
            [
              [
                "team",
                c("팀 전체 공개", "Team-wide"),
                c(
                  "팀의 모든 내부 멤버가 프로젝트와 발행된 영상을 보고 코멘트할 수 있습니다.",
                  "Every internal team member can see the project and its published videos and comment.",
                ),
              ],
              [
                "private",
                c("비공개(참여자만)", "Private (participants only)"),
                c(
                  "초대한 참여자만 볼 수 있습니다. 참여하지 않은 소유자·관리자에게도 보이지 않습니다.",
                  "Only invited participants can see it, including owners and admins who don't participate.",
                ),
              ],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex min-h-11 items-start gap-3">
              <input
                className="mt-1"
                type="radio"
                name="visibility"
                checked={visibility === value}
                disabled={busy || !!pending.current}
                onChange={() => setVisibility(value)}
              />
              <span>
                {label}
                <span className="mt-1 block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
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
