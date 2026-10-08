"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TeamFileTrashEntry,
  TeamFileTrashImpact,
  TeamFileTrashList,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import {
  fileError,
  isDirectLibrary,
  type FileScope,
} from "@/lib/b2b-files/api";
import type { TrashScope } from "@/lib/b2b-files/trash";
import { useTrashOperations } from "@/lib/b2b-files/use-trash";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  ConfirmDialog,
  Details,
  inputClass,
  Notice,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";
import { textAction } from "./file-management";
type Operations = ReturnType<typeof useTrashOperations>;
function PendingTrash({ operations }: { operations: Operations }) {
  const c = useCopy();
  if (!operations.error && !operations.confirmed && !operations.pending.length)
    return null;
  return (
    <div className="space-y-2">
      {operations.error && (
        <B2bError
          code={operations.error}
          retry={() => void operations.refresh()}
        />
      )}
      {operations.confirmed && (
        <Notice role="status">
          {c(
            "휴지통 변경 결과를 확인했습니다.",
            "The trash operation was confirmed.",
          )}
        </Notice>
      )}
      {operations.pending.map((r) => (
        <Notice key={r.input.requestKey}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="mr-auto">
              {c(
                "응답을 확인하지 못한 휴지통 변경이 있습니다.",
                "A trash reply is unconfirmed.",
              )}
            </span>
            <button
              className={secondaryClass}
              disabled={operations.busy}
              onClick={() => void operations.run(r)}
            >
              {c("휴지통 원요청 확인·재시도", "Check or retry trash request")}
            </button>
          </div>
        </Notice>
      ))}
    </div>
  );
}
function Reason({
  value,
  setValue,
}: {
  value: string;
  setValue: (value: string) => void;
}) {
  const c = useCopy();
  return (
    <label className="block space-y-2 text-sm">
      <span>{c("변경 사유", "Reason for change")}</span>
      <textarea
        className={inputClass}
        required
        maxLength={500}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  );
}
export function TrashVersion({
  scope,
  version,
  changed,
}: {
  scope: FileScope;
  version: TeamFileVersion;
  changed: () => void;
}) {
  const c = useCopy(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button className={textAction} onClick={() => setOpen(true)}>
        {c("휴지통으로 이동", "Move to trash")}
      </button>
      {/* Opens inside a row's action line: its own full-width line. */}
      {open && (
        <div className="basis-full py-2 text-foreground">
          <TrashForm
            scope={scope}
            version={version}
            changed={changed}
            close={() => setOpen(false)}
          />
        </div>
      )}
    </>
  );
}
function TrashForm({
  scope,
  version,
  changed,
  close,
}: {
  scope: FileScope;
  version: TeamFileVersion;
  changed: () => void;
  close: () => void;
}) {
  const c = useCopy(),
    operations = useTrashOperations(scope, changed),
    [reason, setReason] = useState("");
  return (
    <ConfirmDialog
      label={c("버전을 휴지통으로 이동", "Move version to trash")}
      onClose={close}
    >
      <p className="break-all font-medium">
        {version.name} · {c("버전", "Version")} {version.ordinal}
      </p>
      <p className="text-sm text-muted">
        {c(
          "이 버전만 휴지통으로 옮깁니다. 30일(팀 삭제 예정일이 더 빠르면 그날)까지 복원할 수 있고, 그동안 팀 저장 용량에 포함됩니다.",
          "Only this version moves to trash. It can be restored for 30 days (or until team deletion, if sooner) and counts toward team storage meanwhile.",
        )}
      </p>
      <PendingTrash operations={operations} />
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await operations.run({
              schema: 1,
              scope: operations.scope,
              versionId: version.id,
              attempts: 0,
              action: "trash",
              input: {
                requestKey: crypto.randomUUID(),
                versionId: version.id,
                revision: version.assetRevision,
                reason: reason.trim(),
                fromLibrary: !!scope.library,
                ...(!isDirectLibrary(scope)
                  ? { sourceProjectId: scope.projectId }
                  : {}),
              },
            })
          )
            close();
        }}
      >
        <Reason value={reason} setValue={setReason} />
        <div className="flex flex-wrap gap-3">
          <button
            className={primaryClass}
            disabled={
              operations.busy || !!operations.pending.length || !reason.trim()
            }
          >
            {c("이 버전을 휴지통으로 이동", "Move this version to trash")}
          </button>
          <button type="button" className={secondaryClass} onClick={close}>
            {c("닫기", "Close")}
          </button>
        </div>
      </form>
    </ConfirmDialog>
  );
}
export function TrashPanel({
  scope,
  changed,
}: {
  scope: TrashScope;
  changed: () => void;
}) {
  const c = useCopy(),
    context = useWorkspace()!,
    operations = useTrashOperations(scope, changed);
  const [data, setData] = useState<TeamFileTrashList | null>(null),
    [error, setError] = useState(""),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<TeamFileTrashEntry | null>(null),
    [reason, setReason] = useState("");
  const serial = useRef(0),
    reader = useRef<AbortController | null>(null),
    api = operations.api;
  const reload = useCallback(async () => {
    const sequence = ++serial.current,
      abort = new AbortController();
    reader.current?.abort();
    reader.current = abort;
    try {
      const result = await api.list(abort.signal, cursor);
      if (sequence === serial.current) {
        setData(result);
        setError("");
        setSelected((prior) =>
          prior
            ? (result.entries.find(
                (r) => r.id === prior.id && r.allowedActions.restore,
              ) ?? null)
            : null,
        );
      }
    } catch (e) {
      if (!abort.signal.aborted && sequence === serial.current) {
        setData(null);
        setSelected(null);
        setError(fileError(e));
      }
    }
  }, [api, cursor]);
  useEffect(() => {
    const current = serial,
      active = reader;
    const start = window.setTimeout(() => void reload(), 0),
      timer = window.setInterval(() => void reload(), 15000);
    const refresh = () => void reload();
    window.addEventListener("prepix-b2b-file-trash-changed", refresh);
    return () => {
      ++current.current;
      active.current?.abort();
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("prepix-b2b-file-trash-changed", refresh);
    };
  }, [reload]);
  const update = () => {
    void reload();
    changed();
  };
  return (
    <Block
      title={c("휴지통", "Trash")}
      description={
        data && !data.entries.length
          ? c("휴지통이 비어 있습니다.", "Trash is empty.")
          : undefined
      }
      actions={
        !!data?.entries.length && (
          <button className={secondaryClass} onClick={() => void reload()}>
            {c("휴지통 새로고침", "Refresh trash")}
          </button>
        )
      }
    >
      <PendingTrash operations={operations} />
      {error ? (
        <B2bError code={error} retry={() => void reload()} />
      ) : !data ? (
        <TeamLoading />
      ) : (
        <>
          {!!data.entries.length && (
            <ul className="divide-y divide-border border-y border-border">
              {data.entries.map((row) => (
                <li
                  key={row.id}
                  data-testid={`trash-file-${row.version.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">
                      {row.version.name} · {c("버전", "Version")}{" "}
                      {row.version.ordinal}
                    </p>
                    <p className="text-[13px] text-muted tabular-nums">
                      {c("복원 기한", "Restore until")}:{" "}
                      {new Date(row.restoreUntil).toLocaleString(
                        c("ko-KR", "en-US"),
                        { timeZone: "Asia/Seoul" },
                      )}{" "}
                      ·{" "}
                      {row.state === "recoverable"
                        ? c("복원 가능", "Recoverable")
                        : row.state === "expired"
                          ? c("복원 기한 만료", "Restoration expired")
                          : c(
                              "영구 삭제 요청됨",
                              "Permanent deletion requested",
                            )}
                    </p>
                  </div>
                  {row.allowedActions.restore && (
                    <button
                      className={secondaryClass}
                      disabled={operations.busy}
                      onClick={() => {
                        setReason("");
                        setSelected(row);
                      }}
                    >
                      {c("버전 복원", "Restore version")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {(cursor || data.nextCursor) && (
            <div className="flex flex-wrap gap-3">
              {cursor && (
                <button
                  className={secondaryClass}
                  onClick={() => setCursor(undefined)}
                >
                  {c("휴지통 처음으로", "First trash page")}
                </button>
              )}
              {data.nextCursor && (
                <button
                  className={secondaryClass}
                  onClick={() => setCursor(data.nextCursor!)}
                >
                  {c("다음 휴지통 버전", "More trash versions")}
                </button>
              )}
            </div>
          )}
          {!!data.entries.length && (
            <Details>
              {c(
                "현재 접근이 허용된 버전만 표시합니다. 복원해도 해제된 프로젝트 연결이나 회수된 권한은 되살리지 않습니다.",
                "Only currently accessible versions are listed. Restoring does not revive removed project links or permissions.",
              )}
            </Details>
          )}
        </>
      )}
      {selected && (
        <ConfirmDialog
          label={c("휴지통 버전 복원", "Restore trash version")}
          onClose={() => setSelected(null)}
        >
          <p className="break-all font-medium">
            {selected.version.name} · {c("버전", "Version")}{" "}
            {selected.version.ordinal}
          </p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await operations.run({
                  schema: 1,
                  scope: operations.scope,
                  versionId: selected.version.id,
                  attempts: 0,
                  action: "restore",
                  input: {
                    requestKey: crypto.randomUUID(),
                    trashId: selected.id,
                    revision: selected.revision,
                    reason: reason.trim(),
                    fromLibrary: true,
                    ...(selected.version.projectId
                      ? { sourceProjectId: selected.version.projectId }
                      : {}),
                  },
                })
              ) {
                setSelected(null);
                update();
              }
            }}
          >
            <Reason value={reason} setValue={setReason} />
            <button
              className={primaryClass}
              disabled={
                operations.busy || !!operations.pending.length || !reason.trim()
              }
            >
              {c("이 버전 복원", "Restore this version")}
            </button>
          </form>
        </ConfirmDialog>
      )}
      {context.data.role === "owner" &&
        context.b2b?.enrolled &&
        context.b2b.team.currentState === "active" && (
          <OwnerPurge operations={operations} changed={update} />
        )}
    </Block>
  );
}
function OwnerPurge({
  operations,
  changed,
}: {
  operations: Operations;
  changed: () => void;
}) {
  const c = useCopy(),
    [address, setAddress] = useState(""),
    [impact, setImpact] = useState<TeamFileTrashImpact | null>(null),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    reader = useRef<AbortController | null>(null);
  useEffect(() => () => reader.current?.abort(), []);
  const query = async () => {
    reader.current?.abort();
    const abort = new AbortController();
    reader.current = abort;
    setBusy(true);
    setImpact(null);
    setConfirmed(false);
    setError("");
    try {
      let version = address.trim();
      const uuid =
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
      if (!uuid.test(version)) {
        const url = new URL(version);
        if (
          url.origin !== window.location.origin ||
          url.pathname !==
            `/dashboard/workspaces/${operations.scope.workspaceId}/library`
        )
          throw new Error("B2B_FILE_TRASH_NOT_FOUND");
        version = url.searchParams.get("version") ?? "";
      }
      if (!uuid.test(version)) throw new Error("B2B_FILE_TRASH_NOT_FOUND");
      const value = await operations.api.impact(version, abort.signal);
      abort.signal.throwIfAborted();
      setImpact(value);
    } catch (e) {
      if (!abort.signal.aborted) setError(fileError(e));
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <div className="space-y-3 pt-2">
      <div>
        <h3 className="text-sm font-medium">
          {c("소유자 영구 삭제", "Owner permanent deletion")}
        </h3>
        <p className="mt-1 text-[13px] text-muted">
          {c(
            "참여자가 전달한 버전 주소로 삭제 영향을 확인합니다.",
            "Check deletion impact using a version address supplied by a participant.",
          )}
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void query();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">
            {c(
              "영구 삭제할 버전 주소",
              "Version address for permanent deletion",
            )}
          </span>
          <input
            className={inputClass}
            value={address}
            onChange={(e) => {
              reader.current?.abort();
              setBusy(false);
              setAddress(e.target.value);
              setImpact(null);
              setConfirmed(false);
            }}
            required
            maxLength={2000}
            placeholder={c("자료 버전 주소", "Version address")}
          />
        </label>
        <button className={secondaryClass} disabled={busy || operations.busy}>
          {c("삭제 영향 확인", "Check deletion impact")}
        </button>
      </form>
      {error && <B2bError code={error} />}
      <Details>
        {c(
          "이 조회는 파일 내용이나 다른 사용 위치를 공개하지 않습니다. 다른 버전에서 공유하는 실제 파일은 사용 근거가 남아 있는 동안 유지됩니다.",
          "This lookup reveals no file content or private locations. Physical files shared by other versions remain while still in use.",
        )}
      </Details>
      {impact && (
        <ConfirmDialog
          label={c("영구 삭제 확인", "Confirm permanent deletion")}
          onClose={() => setImpact(null)}
        >
          <p className="text-sm text-muted">
            {c(
              "이 버전의 영구 삭제를 요청하면 즉시 복원이 차단됩니다. 실제 파일 삭제가 확인된 뒤 용량이 반환됩니다.",
              "Requesting permanent deletion immediately prevents restoration. Storage is released after physical deletion is confirmed.",
            )}
          </p>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await operations.run({
                  schema: 1,
                  scope: operations.scope,
                  versionId: impact.versionId,
                  attempts: 0,
                  action: "purge",
                  input: {
                    requestKey: crypto.randomUUID(),
                    trashId: impact.trashId,
                    revision: impact.revision,
                    reason: reason.trim(),
                    confirmIrreversible: true,
                  },
                })
              ) {
                setImpact(null);
                setAddress("");
                setReason("");
                changed();
              }
            }}
          >
            <Reason value={reason} setValue={setReason} />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {c(
                "삭제 요청 후 복원할 수 없음을 확인했습니다.",
                "I understand this deletion request cannot be undone.",
              )}
            </label>
            <button
              className={primaryClass}
              disabled={
                !confirmed ||
                !reason.trim() ||
                operations.busy ||
                !!operations.pending.length
              }
            >
              {c("복원 불가 영구 삭제 요청", "Request irreversible deletion")}
            </button>
          </form>
        </ConfirmDialog>
      )}
    </div>
  );
}
