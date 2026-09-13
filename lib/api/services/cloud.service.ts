import { apiClient } from "../client";
export type CloudCapabilities = {
  enabled: boolean;
  uploadsEnabled: boolean;
  maxFileBytes: number;
  partSize: number;
  billingEnabled: boolean;
};
export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
  managerId?: string | null;
  archivedAt: string | null;
  createdAt: string;
};
export type StorageUsage = { used: number; reserved: number; limit: number };
export type Asset = {
  id: string;
  name: string;
  projectId: string;
  folderId: string | null;
  createdBy: string;
  size: number;
  sha256: string;
  state:
    | "uploading"
    | "verifying"
    | "ready"
    | "quarantined"
    | "cancelling"
    | "cancelled";
  failure: string | null;
  createdAt: string;
  expiresAt: string;
  uploadExpiresAt: string;
  trashedAt: string | null;
};
export type ProjectDetail = {
  project: Project;
  currentUserId: string;
  canManage: boolean;
  canEdit: boolean;
  canDownload: boolean;
  canPurge: boolean;
  members: {
    userId: string;
    email: string;
    name: string | null;
    access: string;
  }[];
  folders: { id: string; parentId: string | null; name: string }[];
  assets: Asset[];
  capabilities: CloudCapabilities;
  storage: StorageUsage;
};
export type CloudOverview = {
  projects: Project[];
  canCreate: boolean;
  capabilities: CloudCapabilities;
  storage: StorageUsage;
  plan: {
    status: "preview";
    billingEnabled: false;
    seats: { used: number; reserved: number; limit: number };
  };
};
const get = async <T>(path: string) =>
  (await apiClient.get<{ data: T }>(path, { timeout: 15_000 })).data.data;
const post = async <T = unknown>(path: string, body?: unknown) =>
  (await apiClient.post<{ data: T }>(path, body, { timeout: 30_000 })).data
    .data;
const base = (w: string, p?: string) =>
  `/workspaces/${encodeURIComponent(w)}/projects${p ? `/${encodeURIComponent(p)}` : ""}`;
export const cloudService = {
  capabilities: (w?: string) =>
    get<CloudCapabilities>(
      w
        ? `/workspaces/${encodeURIComponent(w)}/cloud-capabilities`
        : "/workspaces/capabilities/cloud",
    ),
  overview: (w: string) => get<CloudOverview>(base(w)),
  create: (w: string, name: string) => post<Project>(base(w), { name }),
  project: (w: string, p: string) => get<ProjectDetail>(base(w, p)),
  updateProject: (
    w: string,
    p: string,
    input: { name?: string; archived?: boolean },
  ) => post<Project>(base(w, p), input),
  grant: (w: string, p: string, userId: string, access: string) =>
    post(`${base(w, p)}/members`, { userId, access }),
  folder: (w: string, p: string, name: string, parentId?: string) =>
    post(`${base(w, p)}/folders`, { name, parentId }),
  begin: (
    w: string,
    p: string,
    input: {
      id: string;
      name: string;
      size: number;
      sha256: string;
      folderId?: string;
    },
  ) => post<{ asset: Asset; partSize: number }>(`${base(w, p)}/uploads`, input),
  upload: (w: string, p: string, id: string) =>
    get<{
      asset: Asset;
      partSize: number;
      needsCompletion: boolean;
      parts: { number: number; size: number; etag: string }[];
    }>(`${base(w, p)}/uploads/${id}`),
  part: (w: string, p: string, id: string, number: number, checksum: string) =>
    post<{ url: string; headers: Record<string, string> }>(
      `${base(w, p)}/uploads/${id}/part`,
      { number, checksum },
    ),
  complete: (w: string, p: string, id: string) =>
    post<Asset>(`${base(w, p)}/uploads/${id}/complete`),
  cancel: (w: string, p: string, id: string) =>
    post(`${base(w, p)}/uploads/${id}/cancel`),
  update: (
    w: string,
    p: string,
    id: string,
    input: { name?: string; folderId?: string | null; trashed?: boolean },
  ) => post<Asset>(`${base(w, p)}/assets/${id}`, input),
  download: (w: string, p: string, id: string) =>
    post<{ url: string; sha256: string; size: number; name: string }>(
      `${base(w, p)}/assets/${id}/download`,
    ),
  purge: (w: string, p: string, id: string, name: string) =>
    post(`${base(w, p)}/assets/${id}/delete`, { name }),
  activity: (w: string) =>
    get<
      {
        id: string;
        action: string;
        actor: string;
        detail: Record<string, string>;
        createdAt: string;
      }[]
    >(`/workspaces/${w}/activity`),
};
