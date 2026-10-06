"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { b2bService } from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  inputClass,
  primaryClass,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";
export function LeaveTeam() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{
    requestKey: string;
    revision: number;
    reason: string;
  } | null>(null);
  if (!b2b?.enrolled) return null;
  return (
    <Block
      title={c("내 참여", "Your participation")}
      description={
        data.role === "owner"
          ? c(
              "소유자는 내부 후임이 소유권 이전을 수락한 뒤 탈퇴할 수 있습니다.",
              "An owner can leave after an internal successor accepts ownership transfer.",
            )
          : c(
              "탈퇴하면 팀과 프로젝트 접근이 즉시 종료됩니다. 작성한 자료는 팀에 남고 재참여에는 새 초대가 필요합니다.",
              "Leaving immediately ends team and project access. Your work stays with the team. Rejoining requires a new invitation.",
            )
      }
    >
      {data.role !== "owner" && (
        <form
          className="max-w-2xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            pending.current ??= {
              requestKey: crypto.randomUUID(),
              revision: b2b.member.revision,
              reason: reason.trim(),
            };
            setBusy(true);
            setError("");
            try {
              await b2bService.leave(data.workspace.id, pending.current);
              pending.current = null;
              router.replace("/dashboard/workspaces");
            } catch (e) {
              setError(errorCode(e));
              if (freeIntent(pending.current, e)) pending.current = null;
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>{c("탈퇴 사유", "Reason for leaving")}</span>
            <textarea
              aria-label={c("탈퇴 사유", "Reason for leaving")}
              className={inputClass}
              required
              maxLength={1000}
              value={reason}
              disabled={busy || !!pending.current}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {error && <B2bError code={error} />}
          <button className={primaryClass} disabled={busy || !reason.trim()}>
            {busy
              ? c("탈퇴 처리 중…", "Leaving…")
              : c("팀 탈퇴 확인", "Confirm leaving team")}
          </button>
        </form>
      )}
    </Block>
  );
}
