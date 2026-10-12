"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import {
  ago,
  Button,
  EmptyState,
  Notice,
  rowClass,
  SearchField,
  SortHeader,
  sortRows,
  useSort,
  tableClass,
  tdClass,
  thClass,
  Toolbar,
} from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
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
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { ReviewWorkPanel } from "./review-work";
import { LeaveTeam } from "./leave-team";
import { TeamLoading, TeamShell } from "@/components/workspaces/shared";
import {
  B2bError,
  errorCode,
  roleLabels,
  visibilityLabels,
  useCopy,
  projectsDenial } from "./shared";

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
  const router = useRouter();
  const context = useWorkspace()!;
  const c = useCopy();
  const { lang } = useI18n();
  const id = scope.workspaceId;
  const base = `/dashboard/workspaces/${id}/projects`;
  const status = context.b2b;
  const permitted = !!status?.enrolled && status.allowedActions.projects;
  const viewer = context.data.role === "reviewer";
  const [rows, setRows] = useState<Project[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [navigation, setNavigation] = useState(initialNavigation);
  const { search, state } = navigation;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sort, sortBy] = useSort<"name" | "role" | "visibility" | "updated">({ key: "updated", dir: "desc" });
  const serial = useRef(0);
  const lifetime = useRef<AbortController | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const settings = useRef(initialNavigation());
  const restoring = useRef(true);
  const restoredScroll = useRef<number | null>(null);
  // Only a list on screen has a scroll position worth keeping: while it is
  // loading or hidden behind a detail view the page is shorter and the
  // browser's clamped value would overwrite the real one.
  const list = useRef<HTMLTableElement>(null);
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
      if (!restoring.current && list.current?.offsetParent)
        settings.current = { ...settings.current, scroll: window.scrollY };
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
          projectsDenial(status) ?? "B2B_PROJECT_NOT_FOUND"
        }
      />
    );
  return (
    // No page title: the list's toolbar names it, with its count.
    <TeamShell>
      {/* A viewer has no team home, so what waits on them shows here. */}
      {viewer && <ReviewWorkPanel />}
      <section className="space-y-2">
        <Toolbar
          title={c("프로젝트", "Projects")}
          count={rows ? (cursor ? `${rows.length}+` : rows.length) : undefined}
        >
          <SearchField
            value={search}
            onChange={(value) => changeFilter({ search: value.slice(0, 100) })}
            label={c("이름으로 검색", "Search by name")}
            placeholder={c("프로젝트 검색…", "Search projects…")}
          />
        </Toolbar>
        {error === "B2B_PROJECT_LIST_SCOPE_CHANGED" ? (
          <Notice
            role="alert"
            tone="danger"
            action={
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                {c("목록 다시 열기", "Reopen list")}
              </Button>
            }
          >
            {c("계정 또는 서비스가 변경되었습니다. 현재 권한으로 목록을 다시 확인해 주세요.", "The account or service changed. Reload the list with your current access.")}
          </Notice>
        ) : error && <B2bError code={error} retry={() => void load()} />}
        {rows === null && !error ? (
          <TeamLoading />
        ) : rows?.length === 0 ? (
          <EmptyState
            icon={FolderOpen}
            title={
              status.enrolled && status.member.kind === "internal"
                ? c(
                    "참여한 프로젝트가 없습니다. 앱에서 프로젝트를 공유하면 여기에 나타나요.",
                    "No projects yet. A project shared from the app shows up here.",
                  )
                : c(
                    "초대된 프로젝트가 없습니다. 관리자에게 문의하세요.",
                    "There are no invited projects. Contact an admin.",
                  )
            }
          />
        ) : (
          <table ref={list} className={`${tableClass} table-fixed`}>
            <thead>
              <tr>
                <SortHeader column="name" label={c("이름", "Name")} sort={sort} onSort={sortBy} />
                <SortHeader column="role" label={c("내 역할", "My role")} sort={sort} onSort={sortBy} className="hidden w-[18%] sm:table-cell" />
                <SortHeader column="visibility" label={c("공개 범위", "Visibility")} sort={sort} onSort={sortBy} className="hidden w-[16%] md:table-cell" />
                <SortHeader column="updated" label={c("업데이트", "Updated")} sort={sort} onSort={sortBy} className="hidden w-28 lg:table-cell" />
                <th className={`${thClass} w-10`}><span className="sr-only">{c("열기", "Open")}</span></th>
              </tr>
            </thead>
            <tbody>
              {sortRows(rows ?? [], sort, (p, key) =>
                key === "name" ? p.name : key === "role" ? c(...roleLabels[p.role]) : key === "visibility" ? c(...visibilityLabels[p.visibility]) : Date.parse(p.updatedAt),
              lang).map((p) => (
                <tr
                  key={p.id}
                  className={rowClass}
                  onClick={(e) => {
                    // The name is a real link; a click on it navigates by itself.
                    if ((e.target as HTMLElement).closest("a")) return;
                    persist();
                    router.push(`${base}/${p.id}`);
                  }}
                >
                  <td className={tdClass}>
                    <Link
                      className="flex min-w-0 items-center gap-3 outline-none focus-visible:underline"
                      href={`${base}/${p.id}`}
                      onClick={persist}
                    >
                      <Folder size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
                      <h2 className="truncate text-[13px] font-medium">{p.name}</h2>
                    </Link>
                  </td>
                  <td className={`${tdClass} hidden text-muted sm:table-cell`}>{c(...roleLabels[p.role])}</td>
                  <td className={`${tdClass} hidden text-muted md:table-cell`}>{c(...visibilityLabels[p.visibility])}</td>
                  <td className={`${tdClass} hidden whitespace-nowrap text-muted lg:table-cell`}>{ago(p.updatedAt, lang)}</td>
                  <td className={`${tdClass} text-right text-muted`}>
                    <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" className="ml-auto" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {cursor && (
          <div className="pt-2">
            <Button
              variant="secondary"
              size="sm"
              aria-busy={busy}
              disabled={busy}
              onClick={() => void load(settings.current.pages + 1)}
            >
              {busy ? c("불러오는 중…", "Loading…") : c("더 보기", "Load more")}
            </Button>
          </div>
        )}
      </section>
      {viewer && <LeaveTeam />}
    </TeamShell>
  );
}
