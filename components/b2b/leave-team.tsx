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
  // The owner hands over first (설정 → 소유권); there is nothing to leave yet.
  if (!b2b?.enrolled || data.role === "owner") return null;
  return (
    <Block
      title={c("팀 나가기", "Leave team")}
      description={c(
        "팀을 나가면 이 팀의 프로젝트와 파일에 더 이상 접근할 수 없어요. 올린 파일은 팀에 남아요.",
        "You lose access to this team's projects and files. Files you added stay with the team.",
      )}
      actions={
        !open && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {c("팀 나가기", "Leave team")}
          </Button>
        )
      }
    >
      {open && (
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
                "구독 중인 팀은 바로 삭제할 수 없어요. 구독을 해지하면 이용기간이 끝나고 60일 뒤에 모든 데이터가 삭제돼요.",
                "A subscribed team can't be deleted right away. Cancel the subscription and all data is deleted 60 days after the period ends.",
              )
            : c(
                `${formatDate(new Date(Date.parse(ended) + 60 * DAY), lang)}에 모든 데이터가 영구 삭제돼요. 그 전에 다시 구독하면 그대로 복구돼요.`,
                `All data is deleted on ${formatDate(new Date(Date.parse(ended) + 60 * DAY), lang)}. Subscribe again before then to restore it.`,
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
        "팀과 멤버, 보낸 초대가 영구 삭제돼요. 삭제한 팀은 되돌릴 수 없어요.",
        "The team, its members and pending invitations are deleted. This can't be undone.",
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
