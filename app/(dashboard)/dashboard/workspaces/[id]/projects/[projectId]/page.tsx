"use client";
import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  File,
  FolderClosed,
  FolderPlus,
  LockKeyhole,
  Pause,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  cloudService,
  type Asset,
  type ProjectDetail,
} from "@/lib/api/services/cloud.service";
import {
  workspaceService,
  type WorkspaceDetail,
} from "@/lib/api/services/workspace.service";
import { useI18n } from "@/lib/i18n/context";
import { bytes, uploadFile } from "@/lib/workspaces/upload";
import {
  TeamShell,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import {
  CloudError,
  CloudProgress,
  cloudErrorCode,
  StorageMeter,
} from "@/components/workspaces/cloud-shared";
export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>;
}) {
  const { id, projectId } = use(params);
  return <Content key={`${id}/${projectId}`} id={id} projectId={projectId} />;
}
function Content({ id, projectId }: { id: string; projectId: string }) {
  const { lang } = useI18n();
  const c = (ko: string, en: string) => (lang === "ko" ? ko : en);
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [team, setTeam] = useState<WorkspaceDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [folderId, setFolderId] = useState<string>();
  const [trash, setTrash] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [showFolder, setShowFolder] = useState(false);
  const [showAccess, setShowAccess] = useState(false);
  const [manager, setManager] = useState("");
  const [editing, setEditing] = useState<Asset | null>(null);
  const [editName, setEditName] = useState("");
  const [editFolder, setEditFolder] = useState("");
  const [confirm, setConfirm] = useState<{
    label: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const [progress, setProgress] = useState<{
    name: string;
    total: number;
    bytes: number;
    phase: "hashing" | "uploading" | "verifying";
    index: number;
    count: number;
  } | null>(null);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resume = useRef<Asset | undefined>(undefined);
  const alive = useRef(true);
  const load = useCallback(async () => {
    try {
      const next = await cloudService.project(id, projectId);
      if (alive.current) {
        setData(next);
        if (next.canManage) setTeam(await workspaceService.detail(id));
      }
    } catch (e) {
      if (alive.current) {
        const code = cloudErrorCode(e);
        setError(code);
        if (
          [
            "PROJECT_NOT_FOUND",
            "WORKSPACE_NOT_FOUND",
            "TEAM_PROJECTS_DISABLED",
          ].includes(code)
        ) {
          setData(null);
          controller.current?.abort();
        }
      }
    }
  }, [id, projectId]);
  useEffect(() => {
    alive.current = true;
    void load();
    const focus = () => {
      void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      controller.current?.abort();
      window.removeEventListener("focus", focus);
    };
  }, [load]);
  const pending = data?.assets.some((a) =>
    ["verifying", "cancelling"].includes(a.state),
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [pending, load]);
  useEffect(() => {
    if (!running) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [running]);
  async function action(key: string, run: () => Promise<unknown>) {
    if (busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await run();
      await load();
    } catch (e) {
      setError(cloudErrorCode(e));
    } finally {
      setBusy("");
    }
  }
  async function upload(files: File[]) {
    if (
      controller.current ||
      !data?.canEdit ||
      !data.capabilities.uploadsEnabled ||
      !files.length
    )
      return;
    const requestedResume = resume.current;
    resume.current = undefined;
    if (
      files.some((f) => f.size === 0 || f.size > data.capabilities.maxFileBytes)
    ) {
      setError("UPLOAD_FILE_INVALID");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setError("");
    setNotice("");
    try {
      for (const [index, file] of files.entries()) {
        abort.signal.throwIfAborted();
        setProgress({
          name: file.name,
          total: file.size,
          bytes: 0,
          phase: "hashing",
          index: index + 1,
          count: files.length,
        });
        await uploadFile({
          file,
          workspaceId: id,
          projectId,
          folderId,
          resume: requestedResume,
          signal: abort.signal,
          onProgress: (phase, bytes) => {
            if (alive.current)
              setProgress({
                name: file.name,
                total: file.size,
                bytes,
                phase,
                index: index + 1,
                count: files.length,
              });
          },
          onCreated: () => {
            void load();
          },
        });
        await load();
      }
      setNotice(
        c(
          "전송이 끝났습니다. 원본 검증 후 다운로드할 수 있습니다.",
          "Transfer complete. Files become downloadable after verification.",
        ),
      );
    } catch (e) {
      if (abort.signal.aborted)
        setNotice(
          c(
            "업로드를 멈췄습니다. 아래 파일에서 이어 올릴 수 있습니다. 대기 중이던 나머지 파일은 다시 선택하세요.",
            "Upload paused. Resume it from the file below. Select any remaining queued files again.",
          ),
        );
      else setError(cloudErrorCode(e));
    } finally {
      controller.current = null;
      if (alive.current) {
        setRunning(false);
        setProgress(null);
        await load();
      }
    }
  }
  async function download(asset: Asset) {
    await action(asset.id, async () => {
      const result = await cloudService.download(id, projectId, asset.id);
      const link = document.createElement("a");
      link.href = result.url;
      link.rel = "noopener noreferrer";
      link.download = result.name;
      document.body.append(link);
      link.click();
      link.remove();
      setNotice(
        c(
          "원본 다운로드를 시작했습니다. 앱에서 새 프로젝트를 만들고 이 파일을 가져오세요.",
          "Original download started. Create a local project in the app and import this file.",
        ),
      );
    });
  }
  const folder = data?.folders.find((f) => f.id === folderId);
  const files =
    data?.assets.filter((a) =>
      trash ? !!a.trashedAt : !a.trashedAt && a.folderId === (folderId ?? null),
    ) ?? [];
  const canUpload =
    !!data?.canEdit && !!data.capabilities.uploadsEnabled && !running && !trash;
  const stateLabel = (a: Asset) =>
    a.trashedAt
      ? c("휴지통", "Trash")
      : a.state === "ready"
        ? new Date(a.expiresAt).getTime() <= Date.now()
          ? c("보관 기한 만료", "Expired")
          : c("원본 검증 완료", "Original verified")
        : a.state === "uploading"
          ? new Date(a.uploadExpiresAt).getTime() <= Date.now()
            ? c("업로드 만료", "Upload expired")
            : c("이어 올리기 대기", "Ready to resume")
          : a.state === "verifying"
            ? c("원본 검증 중", "Verifying original")
            : a.state === "quarantined"
              ? c(
                  "검증 실패 · 다운로드 차단",
                  "Verification failed · download blocked",
                )
              : c(
                  "정리 대기 · 용량 예약 유지",
                  "Cleanup pending · storage reserved",
                );
  return (
    <TeamShell
      title={data?.project.name ?? c("팀 프로젝트", "Team project")}
      description={c(
        "팀 원본을 안전하게 보관하고, 필요한 파일을 내려받아 앱에서 편집하세요.",
        "Store team originals and download the files you need to edit in the app.",
      )}
    >
      <div className="flex flex-wrap justify-between gap-3">
        <Link
          className={secondaryClass}
          href={`/dashboard/workspaces/${id}/projects`}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          {c("프로젝트 목록", "All projects")}
        </Link>
        {data?.canManage && (
          <div className="flex flex-wrap gap-2">
            <button
              className={secondaryClass}
              onClick={() => setShowAccess(!showAccess)}
              aria-expanded={showAccess}
            >
              <LockKeyhole size={16} strokeWidth={1.5} />
              {c("프로젝트 접근 관리", "Project access")}
            </button>
            <button
              className={secondaryClass}
              disabled={running || !!busy}
              onClick={() =>
                setConfirm({
                  label: data.project.archivedAt
                    ? c(
                        "이 프로젝트를 다시 활성화할까요?",
                        "Restore this project?",
                      )
                    : c(
                        "프로젝트를 보관할까요? 원본 다운로드는 유지되고 새 업로드와 수정은 중단됩니다.",
                        "Archive this project? Downloads remain available; uploads and edits will stop.",
                      ),
                  run: () =>
                    cloudService.updateProject(id, projectId, {
                      archived: !data.project.archivedAt,
                    }),
                })
              }
            >
              {data.project.archivedAt
                ? c("보관 해제", "Restore project")
                : c("프로젝트 보관", "Archive project")}
            </button>
          </div>
        )}
      </div>
      {error && (
        <CloudError
          code={error}
          retry={() => {
            setError("");
            void load();
          }}
        />
      )}
      {!data && !error && <TeamLoading />}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-4 text-sm leading-6"
        >
          {notice}
        </p>
      )}
      {confirm && (
        <div
          role="alertdialog"
          aria-label={c("작업 확인", "Confirm action")}
          className="space-y-4 rounded-xl border border-border bg-surface p-5"
        >
          <p className="text-sm leading-6">{confirm.label}</p>
          <div className="flex gap-2">
            <button
              className={primaryClass}
              disabled={!!busy}
              autoFocus
              onClick={() => {
                void action("confirm", confirm.run).then(() =>
                  setConfirm(null),
                );
              }}
            >
              {c("확인", "Confirm")}
            </button>
            <button
              className={secondaryClass}
              disabled={!!busy}
              onClick={() => setConfirm(null)}
            >
              {c("돌아가기", "Go back")}
            </button>
          </div>
        </div>
      )}
      {data && (
        <>
          {data.project.archivedAt && (
            <p className="rounded-lg border border-border p-4 text-sm">
              {c(
                "보관된 프로젝트입니다. 파일은 다운로드할 수 있습니다.",
                "This project is archived. Files remain downloadable.",
              )}
            </p>
          )}
          <StorageMeter storage={data.storage} />
          {showAccess && data.canManage && team && (
            <section className="space-y-4 rounded-xl border border-border p-5">
              <h2 className="font-medium">
                {c("프로젝트 참여자", "Project members")}
              </h2>
              <p className="text-sm leading-6 text-muted">
                {c(
                  "소유자와 관리자는 모든 프로젝트에 접근합니다. 그 외 멤버는 아래 권한이 필요합니다. 하위 폴더와 파일에도 같은 권한을 적용합니다.",
                  "Owners and admins can access every project. Other members need an explicit grant below. Folders and files inherit these permissions.",
                )}
              </p>
              {team.canManage && team.managementEnabled && (
                <div className="space-y-3 rounded-lg border border-border p-4">
                  <p className="text-sm">
                    {c("프로젝트 담당자", "Project manager")}:{" "}
                    {team.members.find(
                      (m) => m.userId === data.project.managerId,
                    )?.email || c("미배정", "Unassigned")}
                  </p>
                  <p className="text-xs leading-5 text-muted">
                    {c(
                      "새 담당자는 이 프로젝트의 편집 및 관리 권한을 받습니다. 이전 담당자의 편집 접근은 아래에서 별도로 변경할 수 있습니다.",
                      "The new manager receives edit and management access. Change the previous manager's remaining project access separately below.",
                    )}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <select
                      className={`${inputClass} sm:max-w-64`}
                      aria-label={c(
                        "새 프로젝트 담당자",
                        "New project manager",
                      )}
                      value={manager}
                      disabled={!!busy}
                      onChange={(e) => setManager(e.target.value)}
                    >
                      <option value="">
                        {c("담당자 선택", "Select a manager")}
                      </option>
                      {team.members
                        .filter(
                          (m) =>
                            !m.suspendedAt &&
                            m.role !== "reviewer" &&
                            m.userId !== data.project.managerId,
                        )
                        .map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.name || m.email}
                          </option>
                        ))}
                    </select>
                    <button
                      className={secondaryClass}
                      disabled={!!busy || !manager}
                      onClick={() =>
                        action("manager", async () => {
                          await workspaceService.assign(id, projectId, manager);
                          setManager("");
                        })
                      }
                    >
                      {c("담당자 변경", "Change manager")}
                    </button>
                  </div>
                </div>
              )}
              <ul className="divide-y divide-border">
                {team.members.map((member) => {
                  const fixed =
                    ["owner", "admin"].includes(member.role) ||
                    (member.userId ===
                      (data.project.managerId === undefined
                        ? data.project.createdBy
                        : data.project.managerId) &&
                      member.userId === data.currentUserId);
                  const current =
                    data.members.find((m) => m.userId === member.userId)
                      ?.access ?? "none";
                  return (
                    <li
                      key={member.userId}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="break-all text-sm">{member.email}</p>
                        <p className="mt-1 text-xs text-muted">
                          {member.suspendedAt
                            ? c(
                                "참여 정지 · 접근 불가",
                                "Suspended · no access",
                              )
                            : fixed
                              ? c("관리 권한 유지", "Management access")
                              : c(
                                  "명시적으로 허용한 작업만 가능",
                                  "Only explicitly allowed actions",
                                )}
                        </p>
                      </div>
                      <select
                        aria-label={`${member.email} ${c("프로젝트 권한", "project access")}`}
                        className={`${inputClass} sm:max-w-48`}
                        value={
                          member.suspendedAt
                            ? "none"
                            : fixed
                              ? "editor"
                              : current
                        }
                        disabled={!!member.suspendedAt || fixed || !!busy}
                        onChange={(e) => {
                          void action(member.userId, () =>
                            cloudService.grant(
                              id,
                              projectId,
                              member.userId,
                              e.target.value,
                            ),
                          );
                        }}
                      >
                        <option value="none">
                          {c("접근 없음", "No access")}
                        </option>
                        <option value="viewer">
                          {c("파일 목록 보기", "View file list")}
                        </option>
                        <option value="downloader">
                          {c("보기와 다운로드", "View and download")}
                        </option>
                        {member.role !== "reviewer" && (
                          <option value="editor">
                            {c("업로드와 파일 관리", "Upload and manage files")}
                          </option>
                        )}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section
            className="space-y-5"
            onDragOver={(e) => {
              if (canUpload) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (canUpload) void upload(Array.from(e.dataTransfer.files));
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <nav
                aria-label={c("폴더 경로", "Folder path")}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <button
                  className={secondaryClass}
                  onClick={() => {
                    setTrash(false);
                    setFolderId(undefined);
                  }}
                >
                  {c("모든 파일", "All files")}
                </button>
                {folder && !trash && (
                  <>
                    <button
                      className={secondaryClass}
                      onClick={() => setFolderId(folder.parentId ?? undefined)}
                      aria-label={c("상위 폴더", "Parent folder")}
                    >
                      <ArrowLeft size={16} strokeWidth={1.5} />
                    </button>
                    <span className="max-w-60 break-all font-medium">
                      {folder.name}
                    </span>
                  </>
                )}
                {trash && <span>{c("휴지통", "Trash")}</span>}
              </nav>
              <div className="flex flex-wrap gap-2">
                {data.canEdit && (
                  <button
                    className={secondaryClass}
                    onClick={() => setTrash(!trash)}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                    {trash
                      ? c("파일로 돌아가기", "Back to files")
                      : c("휴지통", "Trash")}
                  </button>
                )}
                {data.canEdit && !trash && (
                  <button
                    className={secondaryClass}
                    disabled={running}
                    aria-expanded={showFolder}
                    onClick={() => setShowFolder(!showFolder)}
                  >
                    <FolderPlus size={16} strokeWidth={1.5} />
                    {c("새 폴더", "New folder")}
                  </button>
                )}
                {data.canEdit && !trash && (
                  <button
                    className={primaryClass}
                    disabled={!canUpload}
                    onClick={() => {
                      resume.current = undefined;
                      fileInput.current?.click();
                    }}
                  >
                    <Upload size={16} strokeWidth={1.5} />
                    {c("원본 업로드", "Upload originals")}
                  </button>
                )}
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                e.target.value = "";
                void upload(resume.current ? selected.slice(0, 1) : selected);
              }}
            />
            {!data.capabilities.uploadsEnabled && data.canEdit && (
              <p className="text-sm leading-6 text-muted">
                {c(
                  "이 환경의 새 업로드가 비활성화되어 있습니다. 기존 파일은 계속 관리할 수 있습니다.",
                  "New uploads are disabled in this environment. You can still manage existing files.",
                )}
              </p>
            )}
            {showFolder && data.canEdit && !trash && (
              <form
                className="flex flex-col gap-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("folder", async () => {
                    await cloudService.folder(
                      id,
                      projectId,
                      folderName,
                      folderId,
                    );
                    setFolderName("");
                    setShowFolder(false);
                  });
                }}
              >
                <input
                  aria-label={c("폴더 이름", "Folder name")}
                  required
                  maxLength={120}
                  className={inputClass}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                />
                <button
                  className={primaryClass}
                  disabled={!!busy || !folderName.trim()}
                >
                  {c("폴더 만들기", "Create folder")}
                </button>
              </form>
            )}
            {progress && (
              <div
                role="status"
                className="space-y-3 rounded-xl border border-border bg-surface p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 break-all text-sm">
                    {progress.name}{" "}
                    <span className="text-muted tabular-nums">
                      {progress.index}/{progress.count}
                    </span>
                  </p>
                  <button
                    className={secondaryClass}
                    onClick={() => controller.current?.abort()}
                  >
                    <Pause size={16} strokeWidth={1.5} />
                    {c("멈추기", "Pause")}
                  </button>
                </div>
                <CloudProgress
                  value={progress.bytes}
                  max={progress.total}
                  label={c("업로드 진행률", "Upload progress")}
                />
                <p className="text-xs text-muted tabular-nums">
                  {progress.phase === "hashing"
                    ? c("파일 확인 중", "Checking file")
                    : progress.phase === "verifying"
                      ? c("전송 완료 확인 중", "Finalizing transfer")
                      : c("업로드 중", "Uploading")}{" "}
                  · {bytes(progress.bytes)} / {bytes(progress.total)}
                </p>
              </div>
            )}
            {editing && (
              <form
                className="space-y-4 rounded-xl border border-border bg-surface p-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("edit", async () => {
                    await cloudService.update(id, projectId, editing.id, {
                      name: editName,
                      folderId: editFolder || null,
                    });
                    setEditing(null);
                  });
                }}
              >
                <label className="block text-sm">
                  {c("파일 이름", "File name")}
                  <input
                    className={`${inputClass} mt-2`}
                    required
                    maxLength={255}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  {c("이동할 폴더", "Destination folder")}
                  <select
                    className={`${inputClass} mt-2`}
                    value={editFolder}
                    onChange={(e) => setEditFolder(e.target.value)}
                  >
                    <option value="">{c("모든 파일", "All files")}</option>
                    {data.folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <button className={primaryClass} disabled={!!busy}>
                    {c("변경 저장", "Save changes")}
                  </button>
                  <button
                    type="button"
                    className={secondaryClass}
                    onClick={() => setEditing(null)}
                  >
                    {c("취소", "Cancel")}
                  </button>
                </div>
              </form>
            )}
            <ul className="divide-y divide-border rounded-xl border border-border">
              {!trash &&
                data.folders
                  .filter((f) => f.parentId === (folderId ?? null))
                  .map((f) => (
                    <li key={f.id}>
                      <button
                        className="flex min-h-16 w-full items-center gap-3 p-5 text-left text-sm transition-colors hover:bg-surface"
                        onClick={() => setFolderId(f.id)}
                      >
                        <FolderClosed size={20} strokeWidth={1.5} />
                        <span className="break-all">{f.name}</span>
                      </button>
                    </li>
                  ))}
              {files.map((asset) => {
                const ready = asset.state === "ready";
                const active =
                  !asset.trashedAt &&
                  ready &&
                  new Date(asset.expiresAt).getTime() > Date.now();
                return (
                  <li key={asset.id} className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <File
                        size={20}
                        strokeWidth={1.5}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <h3 className="break-all text-sm font-medium">
                          {asset.name}
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-muted tabular-nums">
                          {bytes(asset.size)} · {stateLabel(asset)}
                        </p>
                        {ready && (
                          <p className="text-xs leading-5 text-muted">
                            {c("보관 기한", "Expires")}{" "}
                            {new Date(asset.expiresAt).toLocaleDateString(lang)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {active && data.canDownload && (
                        <button
                          className={secondaryClass}
                          disabled={!!busy}
                          onClick={() => {
                            void download(asset);
                          }}
                        >
                          <Download size={16} strokeWidth={1.5} />
                          {c("원본 다운로드", "Download original")}
                        </button>
                      )}
                      {data.canEdit && ready && !trash && (
                        <>
                          <button
                            className={secondaryClass}
                            disabled={!!busy}
                            onClick={() => {
                              setEditing(asset);
                              setEditName(asset.name);
                              setEditFolder(asset.folderId ?? "");
                            }}
                          >
                            {c("이름과 폴더 변경", "Rename or move")}
                          </button>
                          <button
                            className={secondaryClass}
                            disabled={!!busy}
                            onClick={() =>
                              setConfirm({
                                label: c(
                                  `${asset.name} 파일을 휴지통으로 옮길까요? 팀원의 다운로드가 중단됩니다.`,
                                  `Move ${asset.name} to trash? Team members will no longer be able to download it.`,
                                ),
                                run: () =>
                                  cloudService.update(id, projectId, asset.id, {
                                    trashed: true,
                                  }),
                              })
                            }
                          >
                            <Trash2 size={16} strokeWidth={1.5} />
                            {c("휴지통으로", "Move to trash")}
                          </button>
                        </>
                      )}
                      {data.canPurge && ready && trash && (
                        <button
                          className={secondaryClass}
                          disabled={!!busy}
                          onClick={() =>
                            setConfirm({
                              label: c(
                                `${asset.name} 파일을 영구 삭제할까요? 원본을 복구할 수 없습니다. 저장소 정리가 끝난 뒤 용량이 반환됩니다.`,
                                `Permanently delete ${asset.name}? The original cannot be recovered. Capacity is released after storage cleanup finishes.`,
                              ),
                              run: () =>
                                cloudService.purge(
                                  id,
                                  projectId,
                                  asset.id,
                                  asset.name,
                                ),
                            })
                          }
                        >
                          {c("영구 삭제", "Delete permanently")}
                        </button>
                      )}
                      {data.canEdit && ready && trash && (
                        <button
                          className={secondaryClass}
                          disabled={
                            !!busy ||
                            new Date(asset.expiresAt).getTime() <= Date.now()
                          }
                          onClick={() => {
                            void action(asset.id, () =>
                              cloudService.update(id, projectId, asset.id, {
                                trashed: false,
                              }),
                            );
                          }}
                        >
                          <RotateCcw size={16} strokeWidth={1.5} />
                          {c("복구", "Restore")}
                        </button>
                      )}
                      {asset.state === "uploading" &&
                        data.canEdit &&
                        asset.createdBy === data.currentUserId &&
                        new Date(asset.uploadExpiresAt).getTime() >
                          Date.now() && (
                          <button
                            className={secondaryClass}
                            disabled={!canUpload}
                            onClick={() => {
                              resume.current = asset;
                              fileInput.current?.click();
                            }}
                          >
                            {c(
                              "같은 파일로 이어 올리기",
                              "Select original to resume",
                            )}
                          </button>
                        )}
                      {data.canEdit &&
                        ["uploading", "quarantined", "verifying"].includes(
                          asset.state,
                        ) && (
                          <button
                            className={secondaryClass}
                            disabled={!!busy || running}
                            onClick={() =>
                              setConfirm({
                                label: c(
                                  "이 업로드를 취소할까요? 완료된 조각도 정리하고 용량 예약을 해제합니다. 정리에 몇 분이 걸릴 수 있습니다.",
                                  "Cancel this upload? Uploaded parts will be cleaned up before the storage reservation is released. Cleanup may take several minutes.",
                                ),
                                run: () =>
                                  cloudService.cancel(id, projectId, asset.id),
                              })
                            }
                          >
                            {c("업로드 취소", "Cancel upload")}
                          </button>
                        )}
                    </div>
                  </li>
                );
              })}
              {!files.length &&
                (trash ||
                  !data.folders.some(
                    (f) => f.parentId === (folderId ?? null),
                  )) && (
                  <li className="space-y-3 p-10 text-center">
                    <Upload
                      className="mx-auto text-muted"
                      size={28}
                      strokeWidth={1.5}
                    />
                    <h3 className="font-medium">
                      {trash
                        ? c("휴지통이 비어 있습니다", "Trash is empty")
                        : c(
                            "첫 원본을 올려보세요",
                            "Upload your first original",
                          )}
                    </h3>
                    <p className="text-sm leading-6 text-muted">
                      {trash
                        ? c(
                            "휴지통 파일은 저장 용량에 포함됩니다.",
                            "Trashed files still count toward storage.",
                          )
                        : data.canEdit
                          ? c(
                              "파일을 이 영역에 놓거나 원본 업로드를 선택하세요.",
                              "Drop files here or choose Upload originals.",
                            )
                          : c(
                              "프로젝트에 원본이 추가되면 여기에 표시됩니다.",
                              "Originals added to this project will appear here.",
                            )}
                    </p>
                  </li>
                )}
            </ul>
            <p className="text-xs leading-5 text-muted">
              {c(
                `파일당 최대 ${bytes(data.capabilities.maxFileBytes)}. 모든 형식을 보관할 수 있으며 앱 편집 지원은 형식에 따라 다릅니다. 업로드만으로 AI 분석을 시작하지 않습니다.`,
                `Up to ${bytes(data.capabilities.maxFileBytes)} per file. Any file type can be stored; editing support varies. Uploading does not start AI analysis.`,
              )}
            </p>
          </section>
        </>
      )}
    </TeamShell>
  );
}
