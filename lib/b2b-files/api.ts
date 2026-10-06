import { apiClient } from "../api/client";
import type {
  BeginTeamFileUploadInput,
  TeamFileCapabilities,
  TeamFileUploadLookup,
  TeamFileUploadStatus,
  TeamFileVersionList,
  TeamFileVersion,
  TeamFileDownload,
  TeamFilePermissionList,
  ChangeTeamFilePermissionInput,
  ProjectPeople,
  ProjectList,
  TeamFileMutationAction,
  TeamFileMutationLookup,
  TeamLibraryList,
} from "../api/generated/b2b";

export type FileScope = {
  origin: string;
  userId: string;
  workspaceId: string;
  projectId: string;
  library?: boolean;
};
export function fileApi(scope: FileScope) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  const e = encodeURIComponent;
  const root = `/workspaces/${e(scope.workspaceId)}/b2b/projects/${e(scope.projectId)}`;
  const libraryRoot = `/workspaces/${e(scope.workspaceId)}/b2b/library`;
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
      scope.library
        ? apiClient
            .post<{ data: TeamFileDownload }>(
              `${libraryRoot}/files/${e(id)}/download`,
              { sourceProjectId: scope.projectId },
              {
                signal,
                timeout: 30000,
                headers: { "X-Prepix-Account-ID": scope.userId },
              },
            )
            .then((r) => r.data.data)
        : post<TeamFileDownload>(`/files/${e(id)}/download`, {}, signal),
    version: (id: string, signal?: AbortSignal) =>
      scope.library
        ? apiClient
            .get<{ data: { version: TeamFileVersion } }>(
              `${libraryRoot}/files/${e(id)}?sourceProjectId=${e(scope.projectId)}`,
              {
                signal,
                timeout: 15000,
                headers: { "X-Prepix-Account-ID": scope.userId },
              },
            )
            .then((r) => r.data.data)
        : get<{ version: TeamFileVersion }>(`/files/${e(id)}`, signal),
    permissions: (assetId: string, signal?: AbortSignal) =>
      get<TeamFilePermissionList>(`/assets/${e(assetId)}/permissions`, signal),
    people: (signal?: AbortSignal) => get<ProjectPeople>("/people", signal),
    projects: async (cursor?: string, signal?: AbortSignal) =>
      (
        await apiClient.get<{ data: ProjectList }>(
          `/workspaces/${e(scope.workspaceId)}/b2b/projects${cursor ? `?cursor=${e(cursor)}` : ""}`,
          {
            signal,
            timeout: 15000,
            headers: { "X-Prepix-Account-ID": scope.userId },
          },
        )
      ).data.data,
    changePermission: (
      assetId: string,
      input: ChangeTeamFilePermissionInput,
      signal?: AbortSignal,
    ) =>
      post<{ projectId: string; requestId: string; revision: number }>(
        `/assets/${e(assetId)}/permissions`,
        input,
        signal,
      ),
    link: (
      input: {
        requestKey: string;
        sourceProjectId: string;
        versionId: string;
        fromLibrary?: boolean;
      },
      signal?: AbortSignal,
    ) =>
      post<{ projectId: string; requestId: string; revision: number }>(
        "/files/link",
        input,
        signal,
      ),
    unlink: (
      versionId: string,
      input: { requestKey: string; revision: number; reason: string },
      signal?: AbortSignal,
    ) =>
      post<{ projectId: string; requestId: string; revision: number }>(
        `/files/${e(versionId)}/unlink`,
        input,
        signal,
      ),
    operation: (
      action: TeamFileMutationAction,
      requestKey: string,
      hash: string,
      signal?: AbortSignal,
    ) =>
      get<TeamFileMutationLookup>(
        `/files/operations/${action}/${e(requestKey)}?inputHash=${e(hash)}`,
        signal,
      ),
  };
}
export type FileApi = ReturnType<typeof fileApi>;
export async function libraryList(
  scope: Omit<FileScope, "projectId">,
  query: { search: string; cursor?: string; kind?: string },
  signal?: AbortSignal,
) {
  if (new URL(apiClient.defaults.baseURL!).origin !== scope.origin)
    throw new Error("B2B_FILE_SERVICE_CHANGED");
  const params = new URLSearchParams({ search: query.search });
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.kind) params.set("kind", query.kind);
  const result = (
    await apiClient.get<{ data: TeamLibraryList }>(
      `/workspaces/${encodeURIComponent(scope.workspaceId)}/b2b/library?${params}`,
      {
        signal,
        timeout: 15000,
        headers: { "X-Prepix-Account-ID": scope.userId },
      },
    )
  ).data.data;
  if (result.currentUserId !== scope.userId)
    throw new Error("B2B_FILE_ACCOUNT_CHANGED");
  return result;
}
export function fileError(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (typeof message === "string") return message;
  return error instanceof Error && /^(B2B_FILE_|UPLOAD_)/.test(error.message)
    ? error.message
    : "REQUEST_FAILED";
}
