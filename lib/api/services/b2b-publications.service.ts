import { apiClient } from "../client";
import { localRefusal } from "../session";
import type { PublicationList, PublicationMutationLookup, PublishPublication, RegisterPublication, TeamPublication } from "../generated/b2b";
import { BrowserPublicationStore, publicationHash, publicationScopeKey, runPublication, checkPublication, type PublicationApi, type PublicationOperation, type PublicationScope } from "../../b2b-publications/operations";

const e = encodeURIComponent, store = new BrowserPublicationStore();
const deny = (message: string): never => { throw localRefusal(message, 403); };
export const publicationOrigin = () => new URL(apiClient.defaults.baseURL!).origin;
const root = (s: PublicationScope) => `/workspaces/${e(s.workspaceId)}/b2b/projects/${e(s.projectId)}`;
function headers(s: PublicationScope) {
  if (publicationOrigin() !== s.origin) return deny("B2B_FILE_SERVICE_CHANGED");
  if (typeof window !== "undefined") {
    const user = localStorage.getItem("userInfo");
    let id: unknown;
    try { id = user ? JSON.parse(user)?.id : null; } catch { return deny("B2B_FILE_ACCOUNT_CHANGED"); }
    if (id !== s.userId) return deny("B2B_FILE_ACCOUNT_CHANGED");
    const activeProject = `/dashboard/workspaces/${s.workspaceId}/projects/${s.projectId}`;
    if (window.location.pathname !== activeProject && !window.location.pathname.startsWith(`${activeProject}/`)) return deny("B2B_PUBLICATION_SCOPE_CHANGED");
  }
  return { "X-Prepix-Account-ID": s.userId };
}
async function get<T extends { currentUserId: string }>(s: PublicationScope, path: string) {
  const data = (await apiClient.get<{ data: T }>(path, { headers: headers(s), timeout: 15000 })).data.data;
  headers(s);
  if (data.currentUserId !== s.userId) return deny("B2B_FILE_ACCOUNT_CHANGED");
  return data;
}
function verifyItem(s: PublicationScope, p: TeamPublication) {
  if (p.workspaceId !== s.workspaceId || p.projectId !== s.projectId) return deny("B2B_PUBLICATION_SCOPE_CHANGED");
  return p;
}
function api(s: PublicationScope): PublicationApi {
  return {
    assertScope: (r) => { if (publicationScopeKey(r.scope) !== publicationScopeKey(s)) return deny("B2B_PUBLICATION_SCOPE_CHANGED"); headers(s); },
    lookup: (r) => {
      if (publicationScopeKey(r.scope) !== publicationScopeKey(s)) return deny("B2B_PUBLICATION_SCOPE_CHANGED");
      return get<PublicationMutationLookup>(s, `${root(s)}/publication-operations/${r.action}/${e(r.input.requestKey)}?${new URLSearchParams({ inputHash: publicationHash(r), ...(r.target ? { target: r.target } : {}) })}`);
    },
    apply: (r) => {
      if (publicationScopeKey(r.scope) !== publicationScopeKey(s)) return deny("B2B_PUBLICATION_SCOPE_CHANGED");
      return apiClient.post(`${root(s)}/publications${r.action === "publish" ? `/${e(r.target!)}/publish` : ""}`, r.input, { headers: headers(s), timeout: 30000 });
    },
  };
}
export const publicationsService = {
  assertScope: (s: PublicationScope) => { headers(s); },
  list: async (s: PublicationScope, cursor?: string) => {
    const data = await get<PublicationList>(s, `${root(s)}/publications${cursor ? `?cursor=${e(cursor)}` : ""}`);
    data.publications.forEach((p) => verifyItem(s, p)); return data;
  },
  detail: async (s: PublicationScope, id: string) => {
    const data = await get<{ currentUserId: string; projectRevision: number; publication: TeamPublication }>(s, `${root(s)}/publications/${e(id)}`);
    verifyItem(s, data.publication); if (data.publication.id !== id) return deny("B2B_PUBLICATION_SCOPE_CHANGED"); return data;
  },
  publish: (s: PublicationScope, p: TeamPublication, input: PublishPublication) => { verifyItem(s, p); return runPublication({ schema: 1, scope: s, action: "publish", target: p.id, versionId: p.versionId, input, attempts: 0 }, api(s), store); },
  register: (s: PublicationScope, input: RegisterPublication) => runPublication({ schema: 1, scope: s, action: "register", input, attempts: 0 }, api(s), store),
  pending: async (s: PublicationScope) => { headers(s); const rows = await store.list(s); headers(s); return rows; },
  check: (r: PublicationOperation) => checkPublication(r, api(r.scope), store),
  retry: (r: PublicationOperation) => runPublication(r, api(r.scope), store),
};
