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
  TeamLoading,
  TeamShell,
} from "@/components/workspaces/shared";
import { Button, buttonClass, Card, PropertyList, InfoTip } from "@/components/ui";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, formatTime } from "@/lib/format";
import { B2bError, errorCode, useCopy } from "./shared";

export function AcceptInvitation({ token }: { token: string }) {
  const c = useCopy();
  const { lang } = useI18n();
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
  // The same names the invite form offers: 편집자, 뷰어, 관리자.
  const role = invite && (invite.projectRole ?? invite.teamRole);
  return (
    <TeamShell
      title={c("참여 초대", "Participation invitation")}
      description={
        invite
          ? invite.kind === "external"
            ? c(
                "외부 게스트로 이 프로젝트에만 참여합니다.",
                "You join this project only, as an external collaborator.",
              )
            : c(
                "팀 멤버로 초대되었습니다.",
                "You are invited as a teammate.",
              )
          : undefined
      }
    >
      {error ? (
        <>
          <B2bError code={error} retry={() => void load()} />
          {emailHint && (
            <p className="text-[13px] text-muted">
              {c("초대 이메일", "Invited email")}: {emailHint}
            </p>
          )}
          {error === "INVITATION_EMAIL_MISMATCH" && (
            <Button
              variant="secondary"
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
            </Button>
          )}
        </>
      ) : !invite ? (
        <TeamLoading />
      ) : (
        <Card className="space-y-5">
          <PropertyList
            divided
            items={[
              [c("팀", "Team"), invite.workspaceName],
              ...(invite.projectName
                ? [[c("초대 프로젝트", "Invited project"), invite.projectName] as [string, string]]
                : []),
              [
                c("초대 역할", "Invitation role"),
                role === "admin"
                  ? c("관리자", "Admin")
                  : role === "reviewer"
                    ? c("뷰어", "Viewer")
                    : c("편집자", "Editor"),
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
              [
                c("초대 만료", "Expires"),
                `${formatDate(invite.expiresAt, lang)} ${formatTime(invite.expiresAt, lang)}`,
              ],
            ]}
          />
          {/* A team editor or admin invite comes with an editing seat. The
              div keeps the inline tip off the button's line. */}
          {(invite.projectId || role === "reviewer") && (
          <div>
          <InfoTip label={c("이 초대로 받는 것", "What this invitation gives")} text={c("이 초대로 받는 것", "What this invitation gives")}>
            <p>
              {c(
                "이 초대는 편집 이용권이나 AI 제공량을 지급하지 않습니다. 웹 검토와 허용된 자료 업로드·다운로드는 참여 권한에 따릅니다.",
                "This invitation grants no editing licence or AI allowance. Web review and permitted uploads and downloads follow your participation rights.",
              )}
            </p>
          </InfoTip>
          </div>
          )}
          {invite.accepted ? (
            <Link className={buttonClass()} href={href}>
              {invite.projectId
                ? c("프로젝트 열기", "Open project")
                : c("팀 열기", "Open team")}
            </Link>
          ) : (
            <Button
              aria-busy={busy}
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
            </Button>
          )}
        </Card>
      )}
    </TeamShell>
  );
}
