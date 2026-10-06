"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import type {
  TeamFileStewardLookup,
  TeamFileStewardRecovery,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import {
  isDirectLibrary,
  type FileScope,
  fileError,
} from "@/lib/b2b-files/api";
import {
  type StewardRecord,
  type StewardScope,
} from "@/lib/b2b-files/stewards";
import { useStewardOperations } from "@/lib/b2b-files/use-stewards";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  ConfirmDialog,
  inputClass,
  primaryClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, useCopy } from "./shared";
type Operations = ReturnType<typeof useStewardOperations>;
export function PendingStewards({ operations }: { operations: Operations }) {
  const c = useCopy();
  return (
    <div className="space-y-3">
      {operations.error && (
        <B2bError
          code={operations.error}
          retry={() => void operations.refresh()}
        />
      )}
      {operations.confirmed && (
        <p role="status" className="text-sm">
          {c(
            "자료 인계 변경을 확인했습니다. 현재 자료와 권한을 다시 조회합니다.",
            "The handoff change was confirmed. Refreshing current files and access.",
          )}
        </p>
      )}
      {operations.pending.map((r) => (
        <div
          key={r.input.requestKey}
          className="space-y-2 rounded-lg border border-border p-4"
        >
          <p className="text-sm text-muted">
            {c(
              "응답을 확인하지 못한 인계 변경이 있습니다. 새 변경 전에 원래 요청의 결과를 확인해 주세요.",
              "A handoff reply is unconfirmed. Check the original request before making another change.",
            )}
          </p>
          <button
            className={secondaryClass}
            disabled={operations.busy}
            onClick={() => void operations.run(r)}
          >
            {c("원요청 확인·재시도", "Check or retry original request")}
          </button>
        </div>
      ))}
    </div>
  );
}
function SuccessorFields({
  lookup,
  target,
  setTarget,
  reason,
  setReason,
  download,
  setDownload,
  disabled,
}: {
  lookup: TeamFileStewardLookup;
  target: string;
  setTarget: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  download: boolean;
  setDownload: (v: boolean) => void;
  disabled: boolean;
}) {
  const c = useCopy();
  return (
    <>
      <label className="block space-y-2 text-sm">
        <span>{c("내부 후임", "Internal successor")}</span>
        <select
          className={inputClass}
          aria-label={c("내부 후임", "Internal successor")}
          required
          value={target}
          disabled={disabled}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="">{c("후임 선택", "Choose a successor")}</option>
          {lookup.eligiblePeople.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.name ? `${p.name} · ${p.email}` : p.email}
            </option>
          ))}
        </select>
      </label>
      {!lookup.eligiblePeople.length && (
        <p className="text-sm text-muted">
          {c(
            "현재 지정할 수 있는 내부 후임이 없습니다. 팀 참여 상태를 먼저 확인해 주세요.",
            "No eligible internal successor is available. Check team participation first.",
          )}
        </p>
      )}
      <label className="block space-y-2 text-sm">
        <span>{c("인계 사유", "Handoff reason")}</span>
        <textarea
          className={inputClass}
          required
          maxLength={500}
          value={reason}
          disabled={disabled}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={download}
          disabled={disabled}
          onChange={(e) => setDownload(e.target.checked)}
        />
        <span>
          {c(
            "후임에게 선택한 버전의 원본 다운로드도 허용",
            "Also allow the successor to download this version's original",
          )}
        </span>
      </label>
    </>
  );
}
export function TransferSteward({
  scope,
  version,
  changed,
}: { scope: FileScope; version: TeamFileVersion; changed: () => void }) {
  const c = useCopy(),
    [open, setOpen] = useState(false);
  return (
    <>
      <button className={secondaryClass} onClick={() => setOpen(true)}>
        {c("자료 담당자 인계", "Transfer file stewardship")}
      </button>
      {open && (
        <TransferForm
          scope={scope}
          version={version}
          changed={changed}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}
function TransferForm({
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
    operations = useStewardOperations(scope, changed),
    [lookup, setLookup] = useState<TeamFileStewardLookup | null>(null),
    [error, setError] = useState("");
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [download, setDownload] = useState(false);
  const sourceProjectId = isDirectLibrary(scope) ? undefined : scope.projectId,
    fromLibrary = scope.library === true;
  useEffect(() => {
    const abort = new AbortController();
    void operations.api
      .lookup(version.id, { sourceProjectId, fromLibrary }, abort.signal)
      .then(setLookup)
      .catch((e) => {
        if (!abort.signal.aborted) setError(fileError(e));
      });
    return () => abort.abort();
  }, [operations.api, version.id, sourceProjectId, fromLibrary]);
  return (
    <ConfirmDialog
      label={c("자료 담당자 인계", "Transfer file stewardship")}
      onClose={close}
    >
      <h3 className="break-all font-medium">
        {version.name} · {c("버전", "Version")} {version.ordinal}
      </h3>
      <p className="text-sm leading-6 text-muted">
        {c(
          "자료 계열의 관리 책임을 후임에게 넘깁니다. 후임의 새 보관함 열람은 지금 선택한 버전에만 추가되며, 다른 비공개 버전과 프로젝트 참여는 함께 부여하지 않습니다. 기존 담당자의 열람 허용은 유지됩니다. 진행 중인 이 자료의 새 버전 전송은 중단됩니다.",
          "Transfer responsibility for this file series. New library access is granted only to the selected version. Other private versions and project participation remain separately controlled. Existing read access is retained; pending new-version uploads for this series are stopped.",
        )}
      </p>
      <PendingStewards operations={operations} />
      {error ? (
        <B2bError code={error} />
      ) : !lookup ? (
        <TeamLoading />
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const record: StewardRecord = {
              schema: 1,
              scope: operations.scope,
              attempts: 0,
              action: "transfer",
              input: {
                requestKey: crypto.randomUUID(),
                versionId: version.id,
                revision: lookup.revision,
                targetId: target,
                reason: reason.trim(),
                canDownload: download,
                fromLibrary,
                ...(sourceProjectId ? { sourceProjectId } : {}),
              },
            };
            if (await operations.run(record)) close();
          }}
        >
          <SuccessorFields
            lookup={lookup}
            target={target}
            setTarget={setTarget}
            reason={reason}
            setReason={setReason}
            download={download}
            setDownload={setDownload}
            disabled={operations.busy || !!operations.pending.length}
          />
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryClass}
              disabled={
                operations.busy ||
                !!operations.pending.length ||
                !target ||
                !reason.trim()
              }
            >
              {c("이 버전으로 인계", "Transfer using this version")}
            </button>
            <button type="button" className={secondaryClass} onClick={close}>
              {c("닫기", "Close")}
            </button>
          </div>
        </form>
      )}
    </ConfirmDialog>
  );
}
export function VersionAddress({
  scope,
  versionId,
}: { scope: FileScope; versionId: string }) {
  const c = useCopy(),
    [address, setAddress] = useState(""),
    [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <button
        className={secondaryClass}
        onClick={async () => {
          const url = new URL(
            `/dashboard/workspaces/${scope.workspaceId}/library`,
            window.location.origin,
          );
          url.searchParams.set("version", versionId);
          if (!isDirectLibrary(scope))
            url.searchParams.set("sourceProject", scope.projectId);
          setAddress(url.toString());
          try {
            await navigator.clipboard.writeText(url.toString());
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied
          ? c("버전 주소 복사됨", "Version address copied")
          : c("버전 주소 복사", "Copy version address")}
      </button>
      {address && (
        <label className="block space-y-1 text-sm">
          <span className="text-muted">
            {c(
              "주소로 접근 권한이 추가되지는 않습니다. 담당자 복구에도 이 주소를 사용할 수 있습니다.",
              "This address adds no access. It can also identify the version for stewardship recovery.",
            )}
          </span>
          <input
            className={inputClass}
            aria-label={c("자료 버전 주소", "File version address")}
            readOnly
            value={address}
            onFocus={(e) => e.target.select()}
          />
        </label>
      )}
    </div>
  );
}
export function RecoverSteward() {
  const { data, b2b } = useWorkspace()!;
  const scope = useMemo<StewardScope>(
    () => ({
      origin: new URL(apiClient.defaults.baseURL!).origin,
      userId: data.currentUserId ?? "",
      workspaceId: data.workspace.id,
    }),
    [data.currentUserId, data.workspace.id],
  );
  return data.currentUserId &&
    data.role === "owner" &&
    b2b?.enrolled &&
    b2b.team.currentState === "active" ? (
    <RecoveryForm key={JSON.stringify(scope)} scope={scope} />
  ) : null;
}
function RecoveryForm({ scope }: { scope: StewardScope }) {
  const c = useCopy();
  const [address, setAddress] = useState(""),
    [lookup, setLookup] = useState<TeamFileStewardLookup | null>(null),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [download, setDownload] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const operations = useStewardOperations(scope, () => {
    setLookup(null);
    setAddress("");
    setReason("");
  });
  const reader = useRef<AbortController | null>(null);
  useEffect(() => () => reader.current?.abort(), []);
  return (
    <section className="space-y-4 border-t border-border pt-8">
      <h2 className="font-medium">
        {c("자료 담당자 복구", "Recover file stewardship")}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {c(
          "기존 담당자의 팀 참여 종료·정지 또는 계정 정지·파기가 확인된 자료에만 복구를 요청할 수 있습니다. 참여자로부터 받은 자료 버전 주소를 입력하고 내부 후임을 지정하세요. 지정된 후임이 7일 안에 수락하면 선택한 버전의 열람과 관리 책임을 넘깁니다. 소유자 본인은 후임으로 지정할 수 없으며, 이 요청으로 소유자의 콘텐츠 접근을 추가하지 않습니다.",
          "Request recovery only when the previous steward has left, is suspended, or has a suspended or purged account. Enter a version address supplied by a participant and designate an internal successor. Separate acceptance within seven days recovers this version and responsibility. The owner cannot designate themselves or gain content access through this request.",
        )}
      </p>
      <PendingStewards operations={operations} />
      {error && <B2bError code={error} />}
      <form
        className="max-w-2xl space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || operations.busy) return;
          setBusy(true);
          setError("");
          try {
            if (!lookup) {
              const url = new URL(address),
                match = url.pathname.match(
                  /^\/dashboard\/workspaces\/([a-f0-9-]{36})\/library\/?$/i,
                ),
                versionId = url.searchParams.get("version") ?? "";
              if (
                url.origin !== window.location.origin ||
                match?.[1] !== scope.workspaceId ||
                !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
                  versionId,
                )
              ) {
                setError("B2B_FILE_NOT_FOUND");
                return;
              }
              const abort = new AbortController();
              reader.current?.abort();
              reader.current = abort;
              const found = await operations.api.recovery(
                versionId,
                abort.signal,
              );
              abort.signal.throwIfAborted();
              setLookup(found);
              setTarget("");
            } else
              await operations.run({
                schema: 1,
                scope,
                attempts: 0,
                action: "request",
                input: {
                  requestKey: crypto.randomUUID(),
                  versionId: lookup.versionId,
                  revision: lookup.revision,
                  targetId: target,
                  reason: reason.trim(),
                  canDownload: download,
                },
              });
          } catch (e) {
            if (!reader.current?.signal.aborted) setError(fileError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>
            {c("복구할 자료 버전 주소", "Version address for recovery")}
          </span>
          <input
            className={inputClass}
            type="url"
            required
            value={address}
            disabled={
              busy || operations.busy || !!lookup || !!operations.pending.length
            }
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        {lookup && (
          <>
            <p className="text-sm text-muted">
              {c(
                "서버가 복구 사유를 확인했습니다. 파일명과 비공개 사용 위치는 표시하지 않습니다.",
                "The server verified the recovery condition. Private filenames and locations remain undisclosed.",
              )}
            </p>
            <SuccessorFields
              lookup={lookup}
              target={target}
              setTarget={setTarget}
              reason={reason}
              setReason={setReason}
              download={download}
              setDownload={setDownload}
              disabled={busy || operations.busy || !!operations.pending.length}
            />
          </>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className={primaryClass}
            disabled={
              busy ||
              operations.busy ||
              !!operations.pending.length ||
              (!!lookup && (!target || !reason.trim()))
            }
          >
            {lookup
              ? c("후임에게 복구 수락 요청", "Request successor acceptance")
              : c("복구 가능 여부 확인", "Check recovery eligibility")}
          </button>
          {lookup && (
            <button
              type="button"
              className={secondaryClass}
              disabled={busy || operations.busy || !!operations.pending.length}
              onClick={() => setLookup(null)}
            >
              {c("다른 버전 확인", "Check another version")}
            </button>
          )}
        </div>
      </form>
      <StewardInbox scope={scope} />
    </section>
  );
}
export function StewardInbox({
  scope,
  changed,
}: { scope: StewardScope; changed?: () => void }) {
  const c = useCopy(),
    [rows, setRows] = useState<TeamFileStewardRecovery[]>([]),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<TeamFileStewardRecovery | null>(null),
    [reason, setReason] = useState(""),
    [cancelling, setCancelling] = useState(false),
    [cursor, setCursor] = useState<string | undefined>(),
    [nextCursor, setNextCursor] = useState<string | null>(null),
    [generation, setGeneration] = useState(0);
  const request = useRef<AbortController | null>(null),
    serial = useRef(0),
    changedRef = useRef(changed);
  useEffect(() => {
    changedRef.current = changed;
  }, [changed]);
  const operations = useStewardOperations(scope, () => {
    setSelected(null);
    setReason("");
    setCancelling(false);
    setGeneration((v) => v + 1);
    changedRef.current?.();
  });
  const reload = useCallback(async () => {
    const sequence = ++serial.current,
      abort = new AbortController();
    request.current?.abort();
    request.current = abort;
    try {
      const result = await operations.api.list(abort.signal, cursor);
      if (sequence === serial.current) {
        setRows(result.recoveries);
        setNextCursor(result.nextCursor);
        setError("");
      }
    } catch (e) {
      if (!abort.signal.aborted && sequence === serial.current) {
        setRows([]);
        setNextCursor(null);
        setError(fileError(e));
      }
    }
  }, [operations.api, cursor]);
  useEffect(() => {
    const sequence = serial;
    const initial = window.setTimeout(() => void reload(), 0),
      timer = window.setInterval(() => void reload(), 15000);
    return () => {
      ++sequence.current;
      request.current?.abort();
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [reload, generation]);
  return (
    <section
      className="space-y-4"
      aria-label={c(
        "자료 복구 수락과 요청",
        "File recovery requests and acceptance",
      )}
    >
      <PendingStewards operations={operations} />
      {error && <B2bError code={error} retry={() => void reload()} />}
      {rows.length > 0 && (
        <>
          <h3 className="font-medium">
            {c("자료 담당자 복구 요청", "File stewardship recovery requests")}
          </h3>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li
                key={r.id}
                data-testid={`steward-recovery-${r.id}`}
                className="space-y-3 py-4"
              >
                <p className="break-words text-sm">{r.reason}</p>
                <p className="text-sm text-muted">
                  {r.state === "pending"
                    ? c("후임 수락 대기", "Awaiting successor acceptance")
                    : r.state === "accepted"
                      ? c("복구 완료", "Recovered")
                      : r.state === "expired"
                        ? c("수락 기한 만료", "Acceptance expired")
                        : c("요청 취소", "Request cancelled")}{" "}
                  · {c("수락 기한", "Accept before")}{" "}
                  {new Date(r.expiresAt).toLocaleString(c("ko-KR", "en-US"), {
                    timeZone: "Asia/Seoul",
                  })}
                </p>
                {r.state === "pending" && (
                  <div className="flex flex-wrap gap-3">
                    {r.incoming && (
                      <button
                        className={primaryClass}
                        disabled={
                          operations.busy || !!operations.pending.length
                        }
                        onClick={() => {
                          setSelected(r);
                          setCancelling(false);
                          setReason("");
                        }}
                      >
                        {c("복구 내용 확인", "Review recovery")}
                      </button>
                    )}
                    <button
                      className={secondaryClass}
                      disabled={operations.busy || !!operations.pending.length}
                      onClick={() => {
                        setSelected(r);
                        setReason("");
                        setCancelling(true);
                      }}
                    >
                      {r.incoming
                        ? c("복구 거절", "Decline recovery")
                        : c("복구 요청 취소", "Cancel recovery request")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {(cursor || nextCursor) && (
        <div className="flex flex-wrap gap-3">
          {cursor && (
            <button
              className={secondaryClass}
              disabled={operations.busy}
              onClick={() => {
                setRows([]);
                setNextCursor(null);
                setCursor(undefined);
              }}
            >
              {c("첫 요청 목록", "First requests")}
            </button>
          )}
          {nextCursor && (
            <button
              className={secondaryClass}
              disabled={operations.busy}
              onClick={() => {
                setRows([]);
                setCursor(nextCursor);
                setNextCursor(null);
              }}
            >
              {c("다음 복구 요청", "Next recovery requests")}
            </button>
          )}
        </div>
      )}
      {selected && (
        <ConfirmDialog
          label={
            cancelling
              ? c("복구 요청 취소", "Cancel recovery request")
              : c("자료 복구 수락", "Accept file recovery")
          }
          onClose={() => {
            setSelected(null);
            setReason("");
          }}
        >
          <p className="text-sm leading-6">
            {cancelling
              ? c(
                  "취소 사유를 기록합니다. 수락 후에는 요청 취소로 인계를 되돌릴 수 없습니다.",
                  "Record why this request is cancelled. Accepted stewardship cannot be undone by cancelling the request.",
                )
              : c(
                  "지정된 버전의 보관함 열람과 자료 계열의 관리 책임을 수락합니다. 다른 비공개 버전과 프로젝트 참여는 추가되지 않습니다.",
                  "Accept access to the named immutable version and responsibility for its file series. Other private versions and project participation remain separate.",
                )}
          </p>
          {!cancelling && (
            <p className="text-sm text-muted">
              {selected.canDownload
                ? c(
                    "이 버전의 원본 다운로드 포함",
                    "Includes this version's original download",
                  )
                : c(
                    "원본 다운로드 허용 없음",
                    "Original download is not permitted",
                  )}
            </p>
          )}
          {cancelling && (
            <label className="block space-y-2 text-sm">
              <span>{c("취소 사유", "Cancellation reason")}</span>
              <textarea
                className={inputClass}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={primaryClass}
              disabled={
                operations.busy ||
                !!operations.pending.length ||
                (cancelling && !reason.trim())
              }
              onClick={() =>
                void operations.run(
                  cancelling
                    ? {
                        schema: 1,
                        scope: operations.scope,
                        attempts: 0,
                        action: "cancel",
                        input: {
                          requestKey: crypto.randomUUID(),
                          recoveryId: selected.id,
                          reason: reason.trim(),
                        },
                      }
                    : {
                        schema: 1,
                        scope: operations.scope,
                        attempts: 0,
                        action: "accept",
                        input: {
                          requestKey: crypto.randomUUID(),
                          recoveryId: selected.id,
                          acceptVersionAccess: true,
                        },
                      },
                )
              }
            >
              {cancelling
                ? c("사유 기록 후 취소", "Record reason and cancel")
                : c("이 버전의 복구 수락", "Accept recovery of this version")}
            </button>
            <button
              className={secondaryClass}
              onClick={() => {
                setSelected(null);
                setReason("");
              }}
            >
              {c("닫기", "Close")}
            </button>
          </div>
        </ConfirmDialog>
      )}
    </section>
  );
}
