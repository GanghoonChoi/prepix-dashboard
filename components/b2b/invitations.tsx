"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  b2bService,
  type Invitation,
  type ParticipationKind,
} from "@/lib/api/services/b2b.service";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import {
  inputClass,
  primaryClass,
  secondaryClass,
  SpaceBadge,
} from "@/components/workspaces/shared";
import { B2bError, definitivelyRejected, errorCode, useCopy } from "./shared";

export function InvitationPanel({
  projectId,
  editable,
}: {
  projectId?: string;
  editable: boolean;
}) {
  const { data } = useWorkspace()!;
  const c = useCopy();
  const id = data.workspace.id;
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [kind, setKind] = useState<ParticipationKind>(
    projectId ? "external" : "internal",
  );
  const [role, setRole] = useState<"producer" | "reviewer">("producer");
  const [admin, setAdmin] = useState(false);
  const [download, setDownload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const pending = useRef<{ hash: string; key: string } | null>(null);
  const pendingChange = useRef<{
    invitationId: string;
    action: "resend" | "revoke";
    input: { requestKey: string; revision: number; reason: string };
  } | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await b2bService.invitations(id, projectId);
      if (request === sequence.current) setRows(result.invitations);
    } catch (e) {
      if (request === sequence.current) {
        setRows([]);
        setError(errorCode(e));
      }
    }
  }, [id, projectId]);
  useEffect(() => {
    const requests = sequence;
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 10000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      requests.current++;
    };
  }, [load]);
  const live = rows.filter((row) => !row.acceptedAt && !row.revokedAt);
  async function change(
    row: Pick<Invitation, "id" | "revision">,
    action: "resend" | "revoke",
  ) {
    if (busy || !reason.trim()) return;
    if (
      pendingChange.current &&
      (pendingChange.current.invitationId !== row.id ||
        pendingChange.current.action !== action)
    )
      return;
    pendingChange.current ??= {
      invitationId: row.id,
      action,
      input: {
        requestKey: crypto.randomUUID(),
        revision: row.revision,
        reason: reason.trim(),
      },
    };
    setBusy(true);
    setError("");
    try {
      await b2bService.changeInvitation(
        id,
        row.id,
        action,
        pendingChange.current.input,
      );
      pendingChange.current = null;
      await load();
    } catch (e) {
      setError(errorCode(e));
      if (definitivelyRejected(e)) pendingChange.current = null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-5 border-t border-border pt-8">
      <h2 className="font-medium">
        {projectId
          ? c("프로젝트 초대", "Project invitations")
          : c("내부 팀 참여자 초대", "Invite internal team participants")}
      </h2>
      <p className="max-w-2xl text-sm leading-6 text-muted">
        {c(
          "수락한 뒤 참여 권한이 생깁니다. 초대는 편집 이용권이나 AI를 지급하지 않습니다.",
          "Participation starts after acceptance. Invitations grant no editing licence or AI allowance.",
        )}
      </p>
      {editable && (
        <form
          className="max-w-2xl space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const input = {
              email: email.trim(),
              kind,
              teamRole:
                !projectId && admin
                  ? ("admin" as const)
                  : role === "reviewer"
                    ? ("reviewer" as const)
                    : ("editor" as const),
              projectId,
              projectRole: projectId ? role : undefined,
              canDownload: projectId ? download : false,
            };
            const hash = JSON.stringify(input);
            if (pending.current && pending.current.hash !== hash) {
              setError("B2B_REQUEST_KEY_CONFLICT");
              return;
            }
            pending.current ??= { hash, key: crypto.randomUUID() };
            setBusy(true);
            setError("");
            try {
              await b2bService.issueInvitation(id, {
                ...input,
                requestKey: pending.current.key,
              });
              pending.current = null;
              setEmail("");
              await load();
            } catch (e) {
              setError(errorCode(e));
              if (definitivelyRejected(e)) pending.current = null;
            } finally {
              setBusy(false);
            }
          }}
        >
          <SpaceBadge workspace={data.workspace} />
          <label className="block space-y-2 text-sm">
            <span>{c("초대 이메일", "Invitation email")}</span>
            <input
              className={inputClass}
              type="email"
              required
              maxLength={254}
              disabled={busy || !!pending.current || !!pendingChange.current}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {projectId && (
            <>
              <label className="block space-y-2 text-sm">
                <span>{c("참여 구분", "Affiliation")}</span>
                <select
                  aria-label={c("참여 구분", "Affiliation")}
                  className={inputClass}
                  disabled={
                    busy || !!pending.current || !!pendingChange.current
                  }
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ParticipationKind)}
                >
                  <option value="external">
                    {c("외부 참여자", "External collaborator")}
                  </option>
                  <option value="internal">
                    {c("내부 참여자", "Internal participant")}
                  </option>
                </select>
              </label>
              <label className="block space-y-2 text-sm">
                <span>{c("초대 역할", "Invitation role")}</span>
                <select
                  aria-label={c("초대 역할", "Invitation role")}
                  className={inputClass}
                  disabled={
                    busy || !!pending.current || !!pendingChange.current
                  }
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "producer" | "reviewer")
                  }
                >
                  <option value="producer">{c("제작자", "Producer")}</option>
                  <option value="reviewer">{c("검토자", "Reviewer")}</option>
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={download}
                  disabled={
                    busy || !!pending.current || !!pendingChange.current
                  }
                  onChange={(e) => setDownload(e.target.checked)}
                />
                {c(
                  "초대받은 사람의 다운로드 허용",
                  "Allow downloads for this invitee",
                )}
              </label>
            </>
          )}
          {!projectId && data.role === "owner" && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={admin}
                disabled={busy || !!pending.current || !!pendingChange.current}
                onChange={(e) => setAdmin(e.target.checked)}
              />
              {c("팀 관리자로 초대", "Invite as team administrator")}
            </label>
          )}
          <button
            className={primaryClass}
            disabled={busy || !!pendingChange.current || !email.trim()}
          >
            {busy
              ? c("기록 중…", "Saving…")
              : c("초대 보내기", "Send invitation")}
          </button>
        </form>
      )}
      {error && (
        <B2bError
          code={error}
          retry={
            pendingChange.current
              ? () => {
                  const intent = pendingChange.current;
                  if (intent)
                    void change(
                      {
                        id: intent.invitationId,
                        revision: intent.input.revision,
                      },
                      intent.action,
                    );
                }
              : undefined
          }
        />
      )}
      {live.length > 0 && (
        <>
          <label className="block max-w-2xl space-y-2 text-sm">
            <span>
              {c("초대 재전송·취소 사유", "Reason for resending or cancelling")}
            </span>
            <textarea
              aria-label={c(
                "초대 재전송·취소 사유",
                "Reason for resending or cancelling",
              )}
              className={inputClass}
              disabled={busy || !!pendingChange.current}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <ul className="divide-y divide-border">
            {live.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm">{row.email}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(row.expiresAt).getTime() <= Date.now()
                      ? c("초대 만료", "Expired")
                      : row.deliveryState === "sent"
                        ? c(
                            "메일 발송 완료 · 수락 대기",
                            "Email sent · Awaiting acceptance",
                          )
                        : row.deliveryState === "failed"
                          ? c(
                              "메일 발송 실패 · 재전송 가능",
                              "Email failed · Can resend",
                            )
                          : c("메일 발송 대기", "Email queued")}
                  </p>
                </div>
                {editable && (
                  <div className="flex gap-2">
                    <button
                      className={secondaryClass}
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!!pendingChange.current &&
                          (pendingChange.current.invitationId !== row.id ||
                            pendingChange.current.action !== "resend"))
                      }
                      onClick={() => void change(row, "resend")}
                    >
                      {c("재전송", "Resend")}
                    </button>
                    <button
                      className={secondaryClass}
                      disabled={
                        busy ||
                        !reason.trim() ||
                        (!!pendingChange.current &&
                          (pendingChange.current.invitationId !== row.id ||
                            pendingChange.current.action !== "revoke"))
                      }
                      onClick={() => void change(row, "revoke")}
                    >
                      {c("초대 취소", "Cancel invitation")}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
