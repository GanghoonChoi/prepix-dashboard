"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { b2bService } from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  Block,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";
export function LeaveTeam() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const router = useRouter();
  // Folded behind one button: on the team home this is the last row, and an
  // open "why are you leaving" box is not something to scroll past daily.
  const [open, setOpen] = useState(false);
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
              "탈퇴하면 팀과 프로젝트 접근이 즉시 종료됩니다. 작성한 자료는 팀에 남습니다.",
              "Leaving ends team and project access at once. Your work stays with the team.",
            )
      }
      actions={
        data.role !== "owner" &&
        !open && (
          <button className={secondaryClass} onClick={() => setOpen(true)}>
            {c("팀 나가기", "Leave team")}
          </button>
        )
      }
    >
      {data.role !== "owner" && open && (
        <form
          className="max-w-xl space-y-4"
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
          <label className="block space-y-1.5 text-[13px]">
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
          <div className="flex flex-wrap gap-2">
            <button className={primaryClass} disabled={busy || !reason.trim()}>
              {busy
                ? c("탈퇴 처리 중…", "Leaving…")
                : c("팀 탈퇴 확인", "Confirm leaving team")}
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={busy || !!pending.current}
              onClick={() => setOpen(false)}
            >
              {c("취소", "Cancel")}
            </button>
          </div>
        </form>
      )}
    </Block>
  );
}
