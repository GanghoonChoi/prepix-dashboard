import { apiClient } from "../api/client";
import type {
  BeginTeamFileUploadInput,
  TeamFileCapabilities,
  TeamFileUploadLookup,
  TeamFileUploadStatus,
  TeamFileVersionList,
  TeamFileDownload,
} from "../api/generated/b2b";

export type FileScope = {
  origin: string;
  userId: string;
  workspaceId: string;
  projectId: string;
};
export function fileApi(scope: FileScope) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  const e = encodeURIComponent;
  const root = `/workspaces/${e(scope.workspaceId)}/b2b/projects/${e(scope.projectId)}`;
  async function get<T>(path: string, signal?: AbortSignal) {
    return (
      await apiClient.get<{ data: T }>(root + path, {
        signal,
        timeout: 15_000,
        headers: { "X-Prepix-Account-ID": scope.userId },
      })
    ).data.data;
  }
  async function post<T>(path: string, body: unknown, signal?: AbortSignal) {
    // Transfer operations do not reload the entire workspace for every part.
    return (
      await apiClient.post<{ data: T }>(root + path, body, {
        signal,
        timeout: 30_000,
        headers: { "X-Prepix-Account-ID": scope.userId },
      })
    ).data.data;
  }
  return {
    capabilities: (signal?: AbortSignal) =>
      get<TeamFileCapabilities>("/files/capabilities", signal),
    versions: (search = "", cursor?: string, signal?: AbortSignal) =>
      get<TeamFileVersionList>(
        `/files?search=${e(search)}${cursor ? `&cursor=${e(cursor)}` : ""}`,
        signal,
      ),
    lookup: (requestKey: string, signal?: AbortSignal) =>
      get<TeamFileUploadLookup>(`/uploads/requests/${e(requestKey)}`, signal),
    begin: (input: BeginTeamFileUploadInput, signal?: AbortSignal) =>
      post<TeamFileUploadStatus>("/uploads", input, signal),
    status: (id: string, signal?: AbortSignal) =>
      get<TeamFileUploadStatus>(`/uploads/${e(id)}`, signal),
    part: (
      id: string,
      number: number,
      checksum: string,
      signal?: AbortSignal,
    ) =>
      post<{ url: string; headers: Record<string, string> }>(
        `/uploads/${e(id)}/parts`,
        { number, checksum },
        signal,
      ),
    complete: (id: string, signal?: AbortSignal) =>
      post<{ upload: TeamFileUploadStatus["upload"] }>(
        `/uploads/${e(id)}/complete`,
        {},
        signal,
      ),
    cancel: (requestKey: string, signal?: AbortSignal) =>
      post<{ uploadId: string | null; cancelled: boolean; requestId: string }>(
        `/uploads/requests/${e(requestKey)}/cancel`,
        {},
        signal,
      ),
    download: (id: string, signal?: AbortSignal) =>
      post<TeamFileDownload>(`/files/${e(id)}/download`, {}, signal),
  };
}
export type FileApi = ReturnType<typeof fileApi>;
export function fileError(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (typeof message === "string") return message;
  return error instanceof Error && /^(B2B_FILE_|UPLOAD_)/.test(error.message)
    ? error.message
    : "REQUEST_FAILED";
}
