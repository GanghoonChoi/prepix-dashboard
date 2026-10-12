"use client";
import { useId, useRef, useState } from "react";
import {
  b2bService,
  type ProjectLeadRecovery,
  type RecoverProjectLead,
  type TeamPerson,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  inputClass,
} from "@/components/workspaces/shared";
import { Button, Field, Select, textareaClass, InfoTip } from "@/components/ui";
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
  const field = useId();
  return (
    <Block
      title={c("담당자 지정 복구", "Restore project leadership")}
      description={c(
        "담당자가 없는 프로젝트의 주소를 입력해 후임을 지정합니다.",
        "Enter the address of a project without a lead to assign a successor.",
      )}
    >
      <form
        className="max-w-xl space-y-4"
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
        <Field
          label={c("복구할 프로젝트 주소", "Project address for recovery")}
          htmlFor={`${field}-url`}
        >
          <input
            id={`${field}-url`}
            type="url"
            required
            className={inputClass}
            value={url}
            disabled={busy || !!lookup || !!pending.current}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        {lookup && (
          <>
            <Field
              label={c("수락한 내부 후임", "Accepted internal successor")}
              htmlFor={`${field}-target`}
            >
              <Select
                id={`${field}-target`}
                aria-label={c(
                  "수락한 내부 후임",
                  "Accepted internal successor",
                )}
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
              </Select>
            </Field>
            <Field
              label={c("담당자 복구 사유", "Reason for leadership recovery")}
              htmlFor={`${field}-reason`}
            >
              <textarea
                id={`${field}-reason`}
                aria-label={c(
                  "담당자 복구 사유",
                  "Reason for leadership recovery",
                )}
                required
                maxLength={1000}
                className={textareaClass}
                value={reason}
                disabled={busy || !!pending.current}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </>
        )}
        {error && <B2bError code={error} />}
        {notice && (
          <p role="status" className="text-[13px]">
            {c(
              "후임을 지정했습니다. 프로젝트 접근은 기존 참여 권한을 따릅니다.",
              "The successor is assigned. Project access follows existing participation rights.",
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            aria-busy={busy}
            disabled={
              busy || (lookup ? !target || !reason.trim() : !url.trim())
            }
          >
            {busy
              ? c("확인 중…", "Checking…")
              : lookup
                ? c("후임 지정 확인", "Confirm successor")
                : c("담당자 공백 확인", "Check leadership vacancy")}
          </Button>
          {lookup && !pending.current && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setLookup(null)}
            >
              {c("주소 다시 선택", "Choose another address")}
            </Button>
          )}
        </div>
      </form>
      <InfoTip label={c("언제 지정할 수 있나요?", "When can I use this?")} text={c("언제 지정할 수 있나요?", "When can I use this?")}>
        <p>
          {c(
            "담당자 참여가 종료되었거나 계정이 정지된 프로젝트에만 지정할 수 있습니다. 이미 참여를 수락한 내부 참여자만 후임이 될 수 있고, 소유자에게 프로젝트 자료 접근이 추가되지 않습니다.",
            "Only for projects whose lead has left or is suspended. The successor must be an internal participant who already accepted. The owner gains no content access.",
          )}
        </p>
      </InfoTip>
    </Block>
  );
}
