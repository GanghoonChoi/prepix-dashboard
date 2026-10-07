"use client";
import { isDirectLibrary } from "@/lib/b2b-files/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Project,
  ProjectPeople,
  TeamFilePermissionList,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import { fileApi, fileError, type FileScope } from "@/lib/b2b-files/api";
import type { FileMutation } from "@/lib/b2b-files/mutations";
import type { useFileOperations } from "@/lib/b2b-files/use-operations";
import {
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";

export type FileManagementMode = "permission" | "link" | "unlink";
type Operations = ReturnType<typeof useFileOperations>;
export function PendingFileOperations({
  operations,
}: { operations: Operations }) {
  const c = useCopy();
  return (
    <section
      className="space-y-3"
      aria-label={c("자료 변경 결과", "File operation results")}
    >
      {operations.confirmed && (
        <p role="status" className="text-sm">
          {c(
            "변경이 반영되었습니다. 현재 자료 목록과 권한을 다시 확인합니다.",
            "The change was applied. Refreshing current files and access.",
          )}
        </p>
      )}
      {operations.error && <B2bError code={operations.error} />}
      {!!operations.pending.length && (
        <>
          <p className="text-sm text-muted">
            {c(
              "처리 결과를 확인할 요청이 있습니다. 재시도는 처음 요청한 내용 그대로 보내며, 이미 처리됐다면 다시 변경하지 않습니다.",
              "Some requests need confirmation. Retrying sends the original request and does not repeat an applied change.",
            )}
          </p>
          <ul className="space-y-2">
            {operations.pending.map((r) => (
              <li
                key={operations.key(r)}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3"
              >
                <span className="text-sm">
                  {r.kind === "permission"
                    ? c("자료 권한 변경", "File permission change")
                    : r.kind === "link"
                      ? c("폴더에 버전 연결", "Link version to folder")
                      : c("폴더 연결 제외", "Unlink version from folder")}
                </span>
                <button
                  className={secondaryClass}
                  disabled={operations.busy}
                  onClick={() => void operations.refresh()}
                >
                  {c("결과 확인", "Check result")}
                </button>
                <button
                  className={secondaryClass}
                  disabled={operations.busy}
                  onClick={() => void operations.run(r)}
                >
                  {c("같은 요청 재시도", "Retry original request")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function FileManager({
  scope,
  version,
  mode,
  operations,
  close,
}: {
  scope: FileScope;
  version: TeamFileVersion;
  mode: FileManagementMode;
  operations: Operations;
  close: () => void;
}) {
  const c = useCopy(),
    api = useMemo(() => fileApi(scope), [scope]);
  const invalidate = operations.invalidate;
  const [data, setData] = useState<{
    permissions?: TeamFilePermissionList;
    people?: ProjectPeople;
    projects?: Project[];
    nextCursor?: string | null;
  }>();
  const [error, setError] = useState(""),
    [person, setPerson] = useState(""),
    [target, setTarget] = useState("");
  const [read, setRead] = useState(true),
    [download, setDownload] = useState(false),
    [ai, setAi] = useState(false),
    [reason, setReason] = useState("");
  const reader = useRef<AbortController | null>(null),
    serial = useRef(0),
    alive = useRef(true);
  const refresh = useCallback(async () => {
    const sequence = ++serial.current,
      abort = new AbortController();
    reader.current?.abort();
    reader.current = abort;
    try {
      if (mode === "permission") {
        const [permissions, people] = await Promise.all([
          api.permissions(version.assetId, abort.signal),
          api.people(abort.signal),
        ]);
        if (sequence === serial.current) {
          setData({ permissions, people });
          setError("");
        }
      } else if (mode === "link") {
        const result = await api.projects(undefined, abort.signal);
        if (sequence === serial.current) {
          setData({
            projects: result.projects.filter(
              (p) =>
                (scope.library || p.id !== scope.projectId) &&
                p.allowedActions.upload,
            ),
            nextCursor: result.nextCursor,
          });
          setError("");
        }
      } else setData({});
    } catch (e) {
      if (sequence === serial.current && !abort.signal.aborted) {
        setData(undefined);
        setError(fileError(e));
        if (
          [401, 403, 404].includes(
            (e as { response?: { status?: number } })?.response?.status ?? 0,
          )
        )
          invalidate();
      }
    }
  }, [api, mode, scope.projectId, scope.library, version.assetId, invalidate]);
  useEffect(() => {
    alive.current = true;
    const sequence = serial;
    const start = window.setTimeout(() => void refresh(), 0),
      focus = () => {
        if (document.visibilityState === "visible") void refresh();
      };
    const interval = window.setInterval(focus, 15000);
    window.addEventListener("focus", focus);
    return () => {
      alive.current = false;
      ++sequence.current;
      reader.current?.abort();
      clearTimeout(start);
      clearInterval(interval);
      window.removeEventListener("focus", focus);
    };
  }, [refresh]);
  const selectedPerson = data?.people?.people.find((p) => p.userId === person);
  const permission = data?.permissions?.permissions.find(
    (p) => p.userId === person,
  );
  const pending = operations.pending.some(
    (r) =>
      r.kind === mode &&
      r.objectId === (mode === "permission" ? version.assetId : version.id) &&
      (r.kind !== "permission" || r.input.userId === person) &&
      (r.kind !== "link" || r.targetProjectId === target),
  );
  const title =
    mode === "permission"
      ? c("자료 권한 관리", "Manage file permissions")
      : mode === "link"
        ? c("다른 폴더에 연결", "Link to another folder")
        : c("폴더 연결 제외", "Unlink from folder");
  return (
    <ConfirmDialog label={title} onClose={close}>
      <h2 className="font-medium">{title}</h2>
      {data && !error && (
        <p className="break-all text-sm">
          {version.assetName} · {c("버전", "Version")} {version.ordinal}
        </p>
      )}
      {error ? (
        <B2bError code={error} retry={() => void refresh()} />
      ) : !data ? (
        <TeamLoading />
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (operations.busy || pending) return;
            const base = { schema: 1 as const, scope, attempts: 0 };
            let record: FileMutation;
            if (mode === "permission") {
              if (
                !selectedPerson ||
                !data.permissions ||
                (!read && person === data.permissions.stewardId)
              )
                return;
              record = {
                ...base,
                kind: mode,
                objectId: version.assetId,
                input: {
                  requestKey: crypto.randomUUID(),
                  revision: permission?.revision ?? 0,
                  userId: person,
                  canDownload: read && download,
                  canUseForAi: read && selectedPerson.role !== "reviewer" && ai,
                  remove: !read,
                  reason: reason.trim(),
                },
              };
            } else if (mode === "link") {
              if (!data.projects?.some((p) => p.id === target)) return;
              record = {
                ...base,
                kind: mode,
                objectId: version.id,
                targetProjectId: target,
                input: {
                  requestKey: crypto.randomUUID(),
                  ...(isDirectLibrary(scope)
                    ? {}
                    : { sourceProjectId: scope.projectId }),
                  versionId: version.id,
                  ...(scope.library ? { fromLibrary: true } : {}),
                },
              };
            } else {
              if (version.referenceRevision === null) return;
              record = {
                ...base,
                kind: mode,
                objectId: version.id,
                input: {
                  requestKey: crypto.randomUUID(),
                  revision: version.referenceRevision,
                  reason: reason.trim(),
                },
              };
            }
            if ((await operations.run(record)) && alive.current) close();
            else if (alive.current) void refresh();
          }}
        >
          {mode === "permission" && (
            <>
              <p className="text-sm text-muted">
                {c(
                  "이 폴더에 연결된 자료 시리즈 전체에 적용합니다. 다운로드에는 폴더의 다운로드 허용도 필요합니다.",
                  "Applies to this asset series in this folder. Download also requires folder download permission.",
                )}
              </p>
              <label className="block space-y-2">
                <span>{c("현재 참여자", "Current participant")}</span>
                <select
                  className={inputClass}
                  value={selectedPerson ? person : ""}
                  disabled={operations.busy}
                  onChange={(e) => {
                    setPerson(e.target.value);
                    const p = data.permissions!.permissions.find(
                        (p) => p.userId === e.target.value,
                      ),
                      participant = data.people!.people.find(
                        (p) => p.userId === e.target.value,
                      );
                    setRead(!p?.revokedAt);
                    setDownload(!!p && !p.revokedAt && p.canDownload);
                    setAi(
                      !!p &&
                        !p.revokedAt &&
                        p.canUseForAi &&
                        participant?.role !== "reviewer",
                    );
                  }}
                >
                  <option value="">
                    {c("참여자 선택", "Select participant")}
                  </option>
                  {data.people!.people.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name || p.email} · {p.email}
                    </option>
                  ))}
                </select>
              </label>
              {selectedPerson && (
                <fieldset
                  className="space-y-1"
                  disabled={operations.busy || pending}
                >
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={read}
                      disabled={person === data.permissions!.stewardId}
                      onChange={(e) => setRead(e.target.checked)}
                    />
                    {c("열람 허용", "Allow read access")}
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={read && download}
                      disabled={!read}
                      onChange={(e) => setDownload(e.target.checked)}
                    />
                    {c("원본 다운로드 허용", "Allow original downloads")}
                  </label>
                  <label className="flex min-h-11 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={read && selectedPerson.role !== "reviewer" && ai}
                      disabled={!read || selectedPerson.role === "reviewer"}
                      onChange={(e) => setAi(e.target.checked)}
                    />
                    {c("AI 입력 사용 허용", "Allow AI input use")}
                  </label>
                  {person === data.permissions!.stewardId && (
                    <p className="text-sm text-muted">
                      {c(
                        "자료 담당자의 열람을 해제하려면 담당자를 먼저 이전해야 합니다.",
                        "Transfer stewardship before removing the steward's read access.",
                      )}
                    </p>
                  )}
                  {selectedPerson.role === "reviewer" && (
                    <p className="text-sm text-muted">
                      {c(
                        "검토자는 AI 입력 사용 권한을 받을 수 없습니다.",
                        "Reviewers cannot receive AI input permission.",
                      )}
                    </p>
                  )}
                </fieldset>
              )}
            </>
          )}
          {mode === "link" && (
            <>
              <p className="text-sm text-muted">
                {c(
                  "이 버전만 연결하며 파일을 복제하지 않습니다. 연결한 폴더의 다른 참여자 권한은 별도로 허용해야 합니다.",
                  "Links this exact version without copying bytes. Grant other participants access separately in the target folder.",
                )}
              </p>
              <label className="block space-y-2">
                <span>{c("연결할 폴더", "Target folder")}</span>
                <select
                  className={inputClass}
                  value={
                    data.projects?.some((p) => p.id === target) ? target : ""
                  }
                  disabled={operations.busy}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">
                    {c("폴더 선택", "Select folder")}
                  </option>
                  {data.projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {data.nextCursor && (
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={operations.busy}
                  onClick={async () => {
                    const sequence = serial.current,
                      abort = new AbortController();
                    reader.current?.abort();
                    reader.current = abort;
                    try {
                      const result = await api.projects(
                        data.nextCursor!,
                        abort.signal,
                      );
                      if (alive.current && sequence === serial.current)
                        setData((prior) => ({
                          projects: [
                            ...new Map(
                              [
                                ...(prior?.projects ?? []),
                                ...result.projects.filter(
                                  (p) =>
                                    (scope.library ||
                                      p.id !== scope.projectId) &&
                                    p.allowedActions.upload,
                                ),
                              ].map((p) => [p.id, p]),
                            ).values(),
                          ],
                          nextCursor: result.nextCursor,
                        }));
                    } catch (e) {
                      if (!abort.signal.aborted && alive.current) {
                        setData(undefined);
                        setError(fileError(e));
                      }
                    }
                  }}
                >
                  {c("다음 폴더 보기", "Load more folders")}
                </button>
              )}
            </>
          )}
          {mode === "unlink" && (
            <p className="text-sm text-muted">
              {c(
                "이 폴더에서 이 버전의 연결을 제외합니다. 보관된 파일과 팀 저장 사용량은 유지됩니다.",
                "Removes this version's reference from this folder. Stored bytes and team storage usage remain.",
              )}
            </p>
          )}
          {mode !== "link" && (
            <label className="block space-y-2">
              <span>{c("변경 사유", "Reason for change")}</span>
              <textarea
                className={inputClass}
                required
                maxLength={500}
                value={reason}
                disabled={operations.busy || pending}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {pending && (
            <p className="text-sm text-muted">
              {c(
                "이 변경의 처리 결과를 먼저 확인해 주세요. 위의 결과 확인 또는 같은 요청 재시도를 사용할 수 있습니다.",
                "Confirm the pending change using Check result or Retry original request above.",
              )}
            </p>
          )}
          <button
            className={primaryClass}
            type="submit"
            disabled={
              operations.busy ||
              pending ||
              (mode === "permission" && !selectedPerson) ||
              (mode === "link" &&
                !data.projects?.some((p) => p.id === target)) ||
              (mode !== "link" && !reason.trim())
            }
          >
            {operations.busy ? c("결과 확인 중", "Confirming result") : title}
          </button>
        </form>
      )}
      <button className={secondaryClass} type="button" onClick={close}>
        {c("닫기", "Close")}
      </button>
    </ConfirmDialog>
  );
}
