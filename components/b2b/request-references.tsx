"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProjectRequestReferenceFile,
  TeamFileVersion,
} from "@/lib/api/generated/b2b";
import type { RequestScope } from "@/lib/b2b-requests/operations";
import { fileApi } from "@/lib/b2b-files/api";
import { useFileDownloads } from "@/lib/b2b-files/use-downloads";
import { bytes } from "@/lib/workspaces/upload";
import {
  inputClass,
  secondaryClass,
  TeamLoading,
} from "@/components/workspaces/shared";
import { B2bError, errorCode, useCopy } from "./shared";
import { FileDownloads } from "./file-downloads";

export function ReferenceList({
  files,
}: { files: ProjectRequestReferenceFile[] }) {
  const c = useCopy();
  return (
    <ul className="space-y-2 text-sm">
      {files.map((f) => (
        <li className="break-all" key={f.position}>
          {f.access === "available"
            ? `${f.name} · ${c("버전", "Version")} ${f.ordinal} · ${bytes(f.size)}`
            : c("접근 제한된 참고 자료", "Restricted reference file")}
        </li>
      ))}
    </ul>
  );
}

export function RequestReferencePicker({
  scope,
  value,
  onChange,
  existing = [],
  disabled,
}: {
  scope: RequestScope;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
  existing?: ProjectRequestReferenceFile[];
  disabled: boolean;
}) {
  const c = useCopy(),
    api = useMemo(() => fileApi(scope), [scope]);
  const [search, setSearch] = useState(""),
    [cursor, setCursor] = useState<string>();
  const [versions, setVersions] = useState<TeamFileVersion[] | null>(null),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState("");
  const selecting = value !== undefined;
  const reader = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    reader.current?.abort();
    const abort = new AbortController();
    reader.current = abort;
    try {
      const data = await api.versions(search, cursor, abort.signal);
      abort.signal.throwIfAborted();
      setVersions(data.versions);
      setNext(data.nextCursor);
      setError("");
    } catch (e) {
      if (!abort.signal.aborted) {
        setVersions([]);
        setNext(null);
        setError(errorCode(e));
      }
    }
  }, [api, search, cursor]);
  useEffect(() => {
    if (!selecting) return;
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      reader.current?.abort();
    };
  }, [load, selecting]);
  return (
    <section
      className="space-y-3"
      aria-label={c("요청 참고 자료", "Request reference files")}
    >
      <h3 className="text-sm font-medium">
        {c("참고 자료와 영상 버전", "Reference files and video versions")}
      </h3>
      <p className="text-sm text-muted">
        {c(
          "첨부는 참고용이며 제출이나 전달 확인을 대신하지 않습니다. 요청 공개가 자료 접근 권한을 늘리지 않습니다.",
          "References do not replace a submission or delivery confirmation. Sharing a request does not grant file access.",
        )}
      </p>
      {value === undefined ? (
        <>
          <ReferenceList files={existing} />
          <button
            type="button"
            className={secondaryClass}
            disabled={disabled}
            onClick={() =>
              onChange(
                existing.flatMap((f) =>
                  f.access === "available" ? [f.versionId] : [],
                ),
              )
            }
          >
            {c("참고 첨부 변경", "Change reference files")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            {c(
              "선택한 목록으로 첨부를 대체합니다. 접근 제한된 자료는 자동으로 추가하지 않습니다.",
              "The selection replaces the references. Restricted files are not added automatically.",
            )}
          </p>
          <label className="block space-y-2 text-sm">
            <span>{c("참고 자료 검색", "Search reference files")}</span>
            <input
              className={inputClass}
              value={search}
              maxLength={100}
              disabled={disabled}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor(undefined);
              }}
            />
          </label>
          {error && <B2bError code={error} retry={() => void load()} />}
          <fieldset className="space-y-2 text-sm">
            <legend>{c("참고할 자료 버전", "Reference versions")}</legend>
            {versions === null ? (
              <TeamLoading />
            ) : !versions.length ? (
              <p className="text-muted">
                {c(
                  "이 폴더에서 열 수 있는 자료가 없습니다.",
                  "No files you can open in this folder.",
                )}
              </p>
            ) : (
              versions.map((v) => (
                <label key={v.id} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    disabled={
                      disabled || (value.length >= 20 && !value.includes(v.id))
                    }
                    checked={value.includes(v.id)}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...value, v.id]
                          : value.filter((id) => id !== v.id),
                      )
                    }
                  />
                  <span className="break-all">
                    {c("참고 첨부", "Reference")} {v.name} ·{" "}
                    {c("버전", "Version")} {v.ordinal} · {bytes(v.size)}
                  </span>
                </label>
              ))
            )}
          </fieldset>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              {c(
                `참고 버전 ${value.length}개 선택`,
                `${value.length} reference versions selected`,
              )}
            </span>
            {!!value.length && (
              <button
                type="button"
                className={secondaryClass}
                disabled={disabled}
                onClick={() => onChange([])}
              >
                {c("참고 첨부 모두 해제", "Clear references")}
              </button>
            )}
            {cursor && (
              <button
                type="button"
                className={secondaryClass}
                disabled={disabled}
                onClick={() => setCursor(undefined)}
              >
                {c("참고 자료 처음으로", "First reference page")}
              </button>
            )}
            {next && (
              <button
                type="button"
                className={secondaryClass}
                disabled={disabled}
                onClick={() => setCursor(next!)}
              >
                {c("다음 참고 자료", "More reference files")}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function RequestReferenceFiles({
  files,
  scope,
  invalidate,
}: {
  files: ProjectRequestReferenceFile[];
  scope: RequestScope;
  invalidate: () => void;
}) {
  const c = useCopy(),
    downloads = useFileDownloads(scope, true, invalidate);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const reader = useRef<AbortController | null>(null);
  useEffect(() => () => reader.current?.abort(), []);
  const receive = async (
    f: Extract<ProjectRequestReferenceFile, { access: "available" }>,
  ) => {
    if (busy) return;
    const abort = new AbortController();
    reader.current = abort;
    setBusy(true);
    setError("");
    try {
      const { version } = await fileApi(scope).version(
        f.versionId,
        abort.signal,
      );
      abort.signal.throwIfAborted();
      if (
        version.id !== f.versionId ||
        version.sha256 !== f.sha256 ||
        version.size !== f.size
      )
        throw new Error("B2B_FILE_DOWNLOAD_INTEGRITY");
      if (!version.allowedActions.download)
        throw new Error("B2B_FILE_DOWNLOAD_DENIED");
      await downloads.start(version);
    } catch (e) {
      if (!abort.signal.aborted) {
        setError(errorCode(e));
        invalidate();
      }
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3"
      aria-label={c("현재 요청 참고 자료", "Current request references")}
    >
      <h2 className="font-medium">
        {c("참고 자료와 영상 버전", "Reference files and video versions")}
      </h2>
      {!files.length ? (
        <p className="text-sm text-muted">
          {c("참고 첨부가 없습니다.", "No reference files.")}
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {files.map((f) => (
            <li key={f.position} className="flex flex-wrap items-center gap-3">
              <span className="break-all">
                {f.access === "available"
                  ? `${f.name} · ${c("버전", "Version")} ${f.ordinal} · ${bytes(f.size)}`
                  : c("접근 제한된 참고 자료", "Restricted reference file")}
              </span>
              {f.access === "available" && f.canDownload && (
                <button
                  type="button"
                  className={secondaryClass}
                  disabled={busy}
                  onClick={() => void receive(f)}
                >
                  {c("참고 자료 원본 받기", "Receive reference original")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <B2bError code={error} />}
      <FileDownloads downloads={downloads} />
    </section>
  );
}
