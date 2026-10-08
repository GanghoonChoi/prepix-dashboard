"use client";
import { endSession } from "@/lib/api/session";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  b2bService,
  type InvitationPreview,
} from "@/lib/api/services/b2b.service";
import { clearSignedIn } from "@/lib/account-hint";
import { loginHref } from "@/lib/auth-entry";
import {
  Details,
  KeyValues,
  primaryClass,
  secondaryClass,
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { B2bError, errorCode, useCopy } from "./shared";

export function AcceptInvitation({ token }: { token: string }) {
  const c = useCopy();
  const router = useRouter();
  const [invite, setInvite] = useState<InvitationPreview | null>(null);
  const [emailHint, setEmailHint] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const result = await b2bService.invitation(token);
      if (request !== sequence.current) return;
      setInvite(result);
      setEmailHint("");
      setError("");
    } catch (e) {
      if (request !== sequence.current) return;
      setInvite(null);
      setError(errorCode(e));
      setEmailHint(
        (e as { response?: { data?: { invitedEmailHint?: string } } }).response
          ?.data?.invitedEmailHint ?? "",
      );
    }
  }, [token]);
  useEffect(() => {
    const requests = sequence;
    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      requests.current++;
    };
  }, [load]);
  const href = invite
    ? `/dashboard/workspaces/${invite.workspaceId}${invite.projectId ? `/projects/${invite.projectId}` : ""}`
    : "";
  return (
    <TeamShell
      title={c("참여 초대", "Participation invitation")}
      description={
        invite
          ? invite.kind === "external"
            ? c(
                "외부 참여자로 이 프로젝트에만 참여합니다.",
                "You join this project only, as an external collaborator.",
              )
            : c(
                "내부 참여자로 초대되었습니다.",
                "You are invited as an internal participant.",
              )
          : undefined
      }
    >
      {error ? (
        <>
          <B2bError code={error} retry={() => void load()} />
          {emailHint && (
            <p className="text-sm text-muted">
              {c("초대 이메일", "Invited email")}: {emailHint}
            </p>
          )}
          {error === "INVITATION_EMAIL_MISMATCH" && (
            <button
              className={secondaryClass}
              onClick={() => {
                endSession();
                clearSignedIn();
                window.location.assign(
                  loginHref({
                    returnTo: `/dashboard/b2b-invitations/${token}`,
                  }),
                );
              }}
            >
              {c(
                "초대받은 계정으로 로그인",
                "Sign in with the invited account",
              )}
            </button>
          )}
        </>
      ) : !invite ? (
        <TeamLoading />
      ) : (
        <section className="max-w-xl space-y-6 rounded-lg border border-border p-6">
          <KeyValues
            items={[
              [c("팀", "Team"), invite.workspaceName],
              ...(invite.projectName
                ? [[c("초대 프로젝트", "Invited project"), invite.projectName] as [string, string]]
                : []),
              [
                c("초대 역할", "Invitation role"),
                invite.projectRole === "producer"
                  ? c("프로젝트 제작자", "Project producer")
                  : invite.projectRole === "reviewer"
                    ? c("프로젝트 검토자", "Project reviewer")
                    : invite.teamRole === "admin"
                      ? c("팀 관리자", "Team administrator")
                      : c("팀 참여자", "Team participant"),
              ],
              ...(invite.projectId
                ? [
                    [
                      c("다운로드", "Downloads"),
                      invite.canDownload
                        ? c("허용", "Allowed")
                        : c("허용되지 않음", "Not allowed"),
                    ] as [string, string],
                  ]
                : []),
            ]}
          />
          <p className="text-xs text-muted">
            {c("초대 만료", "Expires")}:{" "}
            {new Date(invite.expiresAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            (KST)
          </p>
          <Details>
            <p>
              {c(
                "이 초대는 편집 이용권이나 AI 제공량을 지급하지 않습니다. 웹 검토와 허용된 자료 업로드·다운로드는 참여 권한에 따릅니다.",
                "This invitation grants no editing licence or AI allowance. Web review and permitted uploads and downloads follow your participation rights.",
              )}
            </p>
          </Details>
          {invite.accepted ? (
            <Link className={primaryClass} href={href}>
              {c("참여한 업무 열기", "Open joined work")}
            </Link>
          ) : (
            <button
              className={primaryClass}
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  const result = await b2bService.acceptInvitation(token);
                  router.replace(
                    `/dashboard/workspaces/${result.workspaceId}${result.projectId ? `/projects/${result.projectId}` : ""}`,
                  );
                } catch (e) {
                  setError(errorCode(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy
                ? c("수락 중…", "Accepting…")
                : c("초대 수락", "Accept invitation")}
            </button>
          )}
        </section>
      )}
    </TeamShell>
  );
}
