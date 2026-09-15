import { apiClient } from "../client";
export type CloudCapabilities = {
  enabled: boolean;
  uploadsEnabled: boolean;
  maxFileBytes: number;
  partSize: number;
  billingEnabled: boolean;
};
export type StorageUsage = { used: number; reserved: number; limit: number };
export type Folder = { id: string; parentId: string | null; name: string };
/**
 * D14: assets and folders belong to the workspace directly — there is no
 * cloud "team project" any more. `folderId: null` is the archive root.
 */
export type Asset = {
  id: string;
  name: string;
  workspaceId: string;
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
  /**
   * The PREVIEW axis, independent of `state` above (F04.6). There is no proxy
   * worker yet, so in practice a row is `stored` and becomes
   * `app_check_required` once the original verifies; `pending`/`ready`/`failed`
   * are the contract a future worker writes.
   *
   * A quarantined ORIGINAL deliberately stays `stored` and never becomes
   * `failed` — an original that failed verification is a storage verdict, and
   * reporting it as a preview failure is exactly what the spec forbids.
   *
   * Optional only for servers older than the field.
   */
  previewState?:
    | "stored"
    | "pending"
    | "ready"
    | "failed"
    | "app_check_required";
  createdAt: string;
  expiresAt: string;
  uploadExpiresAt: string;
  trashedAt: string | null;
};
/**
 * One workspace is one team video archive (D14). Permission verdicts are
 * computed server-side from the workspace role — render from these booleans,
 * never re-derive permission from a role string in the browser. Reviewers do
 * not reach the archive at all, so a reviewer's request answers with an error
 * rather than this shape.
 */
export type ArchiveDetail = {
  currentUserId: string;
  canManage: boolean;
  canEdit: boolean;
  canDownload: boolean;
  canPurge: boolean;
  folders: Folder[];
  assets: Asset[];
  nextCursor: string | null;
  capabilities: CloudCapabilities;
  storage: StorageUsage;
};
const get = async <T>(path: string) =>
  (await apiClient.get<{ data: T }>(path, { timeout: 15_000 })).data.data;
const post = async <T = unknown>(path: string, body?: unknown) =>
  (await apiClient.post<{ data: T }>(path, body, { timeout: 30_000 })).data
    .data;
const base = (w: string) => `/workspaces/${encodeURIComponent(w)}`;
export const cloudService = {
  capabilities: (w?: string) =>
    get<CloudCapabilities>(
      w ? `${base(w)}/cloud-capabilities` : "/workspaces/capabilities/cloud",
    ),
  archive: (w: string, params?: { folderId?: string; cursor?: string }) => {
    const query = new URLSearchParams();
    if (params?.folderId) query.set("folderId", params.folderId);
    if (params?.cursor) query.set("cursor", params.cursor);
    const qs = query.toString();
    return get<ArchiveDetail>(`${base(w)}/archive${qs ? `?${qs}` : ""}`);
  },
  folder: (w: string, name: string, parentId?: string) =>
    post<Folder>(`${base(w)}/folders`, { name, parentId }),
  begin: (
    w: string,
    input: {
      id: string;
      name: string;
      size: number;
      sha256: string;
      folderId?: string;
    },
  ) => post<{ asset: Asset; partSize: number }>(`${base(w)}/uploads`, input),
  upload: (w: string, id: string) =>
    get<{
      asset: Asset;
      partSize: number;
      needsCompletion: boolean;
      parts: { number: number; size: number; etag: string }[];
    }>(`${base(w)}/uploads/${id}`),
  part: (w: string, id: string, number: number, checksum: string) =>
    post<{ url: string }>(`${base(w)}/uploads/${id}/part`, {
      number,
      checksum,
    }),
  complete: (w: string, id: string) =>
    post<Asset>(`${base(w)}/uploads/${id}/complete`),
  cancel: (w: string, id: string) => post(`${base(w)}/uploads/${id}/cancel`),
  update: (
    w: string,
    id: string,
    input: { name?: string; folderId?: string | null; trashed?: boolean },
  ) => post<Asset>(`${base(w)}/assets/${id}`, input),
  download: (w: string, id: string) =>
    post<{ url: string; sha256: string; size: number; name: string }>(
      `${base(w)}/assets/${id}/download`,
    ),
  purge: (w: string, id: string, name: string) =>
    post(`${base(w)}/assets/${id}/delete`, { name }),
  activity: (w: string) =>
    get<
      {
        id: string;
        action: string;
        actor: string;
        detail: Record<string, string>;
        createdAt: string;
      }[]
    >(`${base(w)}/activity`),
};
