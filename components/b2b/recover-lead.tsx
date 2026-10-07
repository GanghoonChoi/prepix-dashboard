"use client";
import { useRef, useState } from "react";
import {
  b2bService,
  type ProjectLeadRecovery,
  type RecoverProjectLead,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";
export function RecoverLead({ people }: { people: TeamPerson[] }) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const [url, setUrl] = useState("");
  const [lookup, setLookup] = useState<ProjectLeadRecovery | null>(null);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(false);
  const pending = useRef<{
    projectId: string;
    input: RecoverProjectLead;
  } | null>(null);
  return (
    <section className="space-y-4 border-t border-border pt-8">
      <h2 className="font-medium">
        {c("담당자 지정 복구", "Restore folder leadership")}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {c(
          "담당자 참여가 종료되었거나 계정이 정지된 폴더에만 후임을 지정할 수 있습니다. 참여자로부터 전달받은 폴더 주소를 입력하세요. 이미 참여를 수락한 내부 참여자 중에서 지정하며, 이 작업은 소유자에게 폴더 자료 접근을 추가하지 않습니다.",
          "A successor can be assigned only when a lead's participation has ended or the account is suspended. Enter a folder address supplied by a participant. Choose an internal participant who already accepted participation. This action adds no content access for the owner.",
        )}
      </p>
      <form
        className="max-w-2xl space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          setNotice(false);
          try {
            if (!lookup) {
              const address = new URL(url);
              const match = address.pathname.match(
                /^\/dashboard\/workspaces\/([a-f0-9-]{36})\/projects\/([a-f0-9-]{36})(?:\/|$)/i,
              );
              if (!match || match[1] !== data.workspace.id) {
                setError("B2B_PROJECT_NOT_FOUND");
                return;
              }
              const result = await b2bService.leadRecovery(
                data.workspace.id,
                match[2],
              );
              setLookup(result);
              setTarget(result.eligibleUserIds[0] ?? "");
            } else {
              pending.current ??= {
                projectId: lookup.projectId,
                input: {
                  requestKey: crypto.randomUUID(),
                  revision: lookup.revision,
                  targetId: target,
                  reason: reason.trim(),
                },
              };
              await b2bService.recoverLead(
                data.workspace.id,
                pending.current.projectId,
                pending.current.input,
              );
              pending.current = null;
              setLookup(null);
              setUrl("");
              setReason("");
              setNotice(true);
            }
          } catch (e) {
            setError(errorCode(e));
            if (freeIntent(pending.current, e)) {
              pending.current = null;
              setLookup(null);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="block space-y-2 text-sm">
          <span>
            {c("복구할 폴더 주소", "Folder address for recovery")}
          </span>
          <input
            type="url"
            required
            className={inputClass}
            value={url}
            disabled={busy || !!lookup || !!pending.current}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        {lookup && (
          <>
            <label className="block space-y-2 text-sm">
              <span>
                {c("수락한 내부 후임", "Accepted internal successor")}
              </span>
              <select
                aria-label={c(
                  "수락한 내부 후임",
                  "Accepted internal successor",
                )}
                className={inputClass}
                required
                value={target}
                disabled={busy || !!pending.current}
                onChange={(e) => setTarget(e.target.value)}
              >
                {!lookup.eligibleUserIds.length && (
                  <option value="">
                    {c(
                      "지정 가능한 참여자가 없습니다",
                      "No eligible participant",
                    )}
                  </option>
                )}
                {people
                  .filter((p) => lookup.eligibleUserIds.includes(p.userId))
                  .map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.name || p.email}
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm">
              <span>
                {c("담당자 복구 사유", "Reason for leadership recovery")}
              </span>
              <textarea
                aria-label={c(
                  "담당자 복구 사유",
                  "Reason for leadership recovery",
                )}
                required
                maxLength={1000}
                className={inputClass}
                value={reason}
                disabled={busy || !!pending.current}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </>
        )}
        {error && <B2bError code={error} />}
        {notice && (
          <p role="status" className="text-sm">
            {c(
              "후임을 지정했습니다. 폴더 접근은 기존 참여 권한을 따릅니다.",
              "The successor is assigned. Folder access follows existing participation rights.",
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className={primaryClass}
            disabled={
              busy || (lookup ? !target || !reason.trim() : !url.trim())
            }
          >
            {busy
              ? c("확인 중…", "Checking…")
              : lookup
                ? c("후임 지정 확인", "Confirm successor")
                : c("담당자 공백 확인", "Check leadership vacancy")}
          </button>
          {lookup && !pending.current && (
            <button
              type="button"
              className={secondaryClass}
              disabled={busy}
              onClick={() => setLookup(null)}
            >
              {c("주소 다시 선택", "Choose another address")}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
