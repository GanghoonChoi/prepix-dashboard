import { localRefusal } from "../api/session";
import type { ProjectList } from "../api/generated/b2b";
import type { HomeEnvironment, HomeScope } from "../b2b-home/home";

export type ProjectListScope = HomeScope;
export const projectListKey = (scope: ProjectListScope) =>
  `prepix.projects.navigation.v1:${JSON.stringify([scope.origin, scope.userId, scope.workspaceId])}`;
// The server orders createdAt DESC, id DESC. No names, ids or cursors are cached.
export type ProjectNavigation = {
  search: string;
  state: string;
  sort: "created-desc";
  pages: number;
  scroll: number;
};
export const initialNavigation = (): ProjectNavigation => ({
  search: "", state: "", sort: "created-desc", pages: 1, scroll: 0,
});
export function decodeNavigation(raw: string | null): ProjectNavigation {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || value.sort !== "created-desc" ||
      typeof value.search !== "string" || value.search.length > 100 ||
      !["", "draft", "in_progress", "completed", "archived"].includes(value.state) ||
      !Number.isSafeInteger(value.pages) || value.pages < 1 ||
      typeof value.scroll !== "number" || !Number.isFinite(value.scroll) || value.scroll < 0)
      return initialNavigation();
    // Whitelist fields even if an older cache contained private response data.
    return { search: value.search, state: value.state, sort: "created-desc", pages: value.pages, scroll: value.scroll };
  } catch { return initialNavigation(); }
}
export function encodeNavigation(value: ProjectNavigation): string {
  return JSON.stringify(decodeNavigation(JSON.stringify(value)));
}
const changed = () => localRefusal("B2B_PROJECT_LIST_SCOPE_CHANGED");
export function assertProjectListScope(scope: ProjectListScope, current: HomeEnvironment, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const path = `/dashboard/workspaces/${scope.workspaceId}/projects`;
  if (!scope.userId || !current.signedIn || current.userId !== scope.userId ||
      current.origin !== scope.origin || ![path, `${path}/`].includes(current.pathname))
    throw changed();
}
/** Restore S05 by replaying the current ACL cursor chain, never a saved cursor. */
export async function readProjectPages(
  scope: ProjectListScope,
  current: () => HomeEnvironment,
  pages: number,
  send: (cursor?: string) => Promise<ProjectList>,
  signal?: AbortSignal,
): Promise<ProjectList & { pages: number }> {
  assertProjectListScope(scope, current(), signal);
  if (!Number.isSafeInteger(pages) || pages < 1) throw new Error("Invalid page count");
  const projects: ProjectList["projects"] = [];
  const ids = new Set<string>(), cursors = new Set<string>();
  let cursor: string | undefined, loaded = 0;
  try {
    for (; loaded < pages;) {
      assertProjectListScope(scope, current(), signal);
      const result = await send(cursor);
      assertProjectListScope(scope, current(), signal);
      if (result.projects.some((project) => project.workspaceId !== scope.workspaceId)) throw changed();
      for (const project of result.projects) if (!ids.has(project.id)) {
        ids.add(project.id); projects.push(project);
      }
      loaded++;
      if (!result.nextCursor) return { projects, nextCursor: null, pages: loaded };
      if (cursors.has(result.nextCursor)) throw new Error("Repeated project cursor");
      cursors.add(result.nextCursor);
      cursor = result.nextCursor;
    }
    return { projects, nextCursor: cursor ?? null, pages: loaded };
  } catch (error) {
    assertProjectListScope(scope, current(), signal);
    throw error;
  }
}
