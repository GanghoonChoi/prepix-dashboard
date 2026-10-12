"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { b2bService } from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { Block } from "@/components/workspaces/shared";
import { Button, buttonClass, DangerZone, Field, inputClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { B2bError, freeIntent, errorCode, useCopy } from "./shared";

const DAY = 86_400_000;

export function LeaveTeam() {
  const { data, b2b } = useWorkspace()!;
  const c = useCopy();
  const router = useRouter();
  // Two clicks: 팀 나가기, then 팀 탈퇴 확인. No reason to type.
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{
    requestKey: string;
    revision: number;
    reason: string;
  } | null>(null);
  if (!b2b?.enrolled) return null;
  const owner = data.role === "owner";
  return (
    <Block
      title={c("내 참여", "Your participation")}
      description={
        owner
          ? c(
              "소유자는 위 소유권에서 다른 멤버에게 넘긴 뒤 나갈 수 있어요.",
              "Hand ownership to another member above before you leave.",
            )
          : c(
              "탈퇴하면 팀과 프로젝트 접근이 즉시 종료됩니다. 작성한 자료는 팀에 남습니다.",
              "Leaving ends team and project access at once. Your work stays with the team.",
            )
      }
      actions={
        !owner &&
        !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {c("팀 나가기", "Leave team")}
          </Button>
        )
      }
    >
      {!owner && open && (
        <form
          className="max-w-xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            pending.current ??= {
              requestKey: crypto.randomUUID(),
              revision: b2b.member.revision,
              reason: "팀 나가기",
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
          {error && <B2bError code={error} />}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" aria-busy={busy} disabled={busy}>
              {busy
                ? c("탈퇴 처리 중…", "Leaving…")
                : c("팀 탈퇴 확인", "Confirm leaving team")}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !!pending.current}
              onClick={() => setOpen(false)}
            >
              {c("취소", "Cancel")}
            </Button>
          </div>
        </form>
      )}
    </Block>
  );
}

/**
 * Owner only. A team that never started is deleted on the spot; a paid team
 * ends through 플랜과 결제 (termination) and is erased by the lifecycle —
 * read-only for 30 days, restorable for 30 more, then deleted
 * (backend docs/b2b-team-lifecycle-deletion.md §1).
 */
export function DeleteTeam() {
  const { data, b2b } = useWorkspace()!;
  const { lang } = useI18n();
  const c = useCopy();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<{ requestKey: string; revision: number; reason: string } | null>(null);
  if (!b2b?.enrolled || data.role !== "owner") return null;
  const { team } = b2b;
  const base = `/dashboard/workspaces/${data.workspace.id}`;
  const title = c("팀 삭제", "Delete team");
  if (team.currentState === "deleting" || team.currentState === "deleted")
    return <DangerZone title={title} description={c("팀을 삭제하고 있어요.", "This team is being deleted.")} />;
  if (team.currentState !== "preparing" || team.periodEndsAt) {
    // Ended: read-only, recovery or due. Active or a paid future period: not yet.
    const ended = team.currentState !== "active" && team.currentState !== "preparing" && team.periodEndsAt;
    return (
      <DangerZone
        title={title}
        description={
          !ended
            ? c(
                "결제한 팀은 바로 삭제되지 않아요. 플랜과 결제에서 구독을 해지하면 이번 이용기간까지 쓰고, 그 뒤 30일 동안 읽기 전용, 30일 더 복구할 수 있고, 그다음 모든 자료가 삭제돼요.",
                "A paid team is not deleted at once. Cancel the subscription in Plan & billing: it works until the period ends, is read-only for 30 days, restorable for 30 more, and then everything is deleted.",
              )
            : c(
                `이용기간이 끝난 팀이에요. ${formatDate(new Date(Date.parse(ended) + 60 * DAY), lang)} 이후 모든 자료가 삭제돼요. 그 전에는 플랜과 결제에서 복구할 수 있어요.`,
                `This team's period has ended. Everything is deleted after ${formatDate(new Date(Date.parse(ended) + 60 * DAY), lang)}; until then you can restore it in Plan & billing.`,
              )
        }
      >
        <Link href={`${base}/plan`} className={buttonClass({ variant: "secondary" })}>
          {c("플랜과 결제로", "Go to Plan & billing")}
        </Link>
      </DangerZone>
    );
  }
  const workspaceName = data.workspace.name;
  return (
    <DangerZone
      title={title}
      description={c(
        "결제 전인 팀이라 바로 삭제돼요. 멤버와 보낸 초대도 모두 사라지고, 되돌릴 수 없어요.",
        "This team was never paid for, so it is deleted at once with its members and pending invitations. This cannot be undone.",
      )}
    >
      {!open ? (
        <Button variant="danger" onClick={() => setOpen(true)}>
          {title}
        </Button>
      ) : (
        <form
          className="max-w-xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || name !== workspaceName) return;
            pending.current ??= { requestKey: crypto.randomUUID(), revision: team.revision, reason: "팀 삭제" };
            setBusy(true);
            setError("");
            try {
              await b2bService.deleteTeam(data.workspace.id, pending.current);
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
          {error && <B2bError code={error} />}
          <Field
            htmlFor="delete-team-confirm"
            label={c(`확인하려면 ‘${workspaceName}’ 입력`, `Type “${workspaceName}” to confirm`)}
          >
            <input
              id="delete-team-confirm"
              className={inputClass}
              autoComplete="off"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" aria-busy={busy} disabled={busy || name !== workspaceName}>
              {busy ? c("삭제 중…", "Deleting…") : c("영구 삭제", "Delete permanently")}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !!pending.current}
              onClick={() => {
                setOpen(false);
                setName("");
              }}
            >
              {c("취소", "Cancel")}
            </Button>
          </div>
        </form>
      )}
    </DangerZone>
  );
}
