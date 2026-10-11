"use client";
import { endSession } from "@/lib/api/session";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { loginHref } from "@/lib/auth-entry";
import { clearSignedIn } from "@/lib/account-hint";
import {
  workspaceService,
  type InvitePreview,
} from "@/lib/api/services/workspace.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import {
  TeamShell,
  TeamError,
  TeamLoading,
} from "@/components/workspaces/shared";
import { Button, buttonClass, Card, PropertyList } from "@/components/ui";
import { formatDate } from "@/lib/format";

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <InvitationContent key={token} token={token} />;
}

function InvitationContent({ token }: { token: string }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    () =>
      workspaceService
        .preview(token)
        .then((next) => {
          setInvite(next);
          setError("");
        })
        .catch((e) => {
          setError(workspaceError(e));
        }),
    [token]
  );
  useEffect(() => {
    void load();
  }, [load]);
  function switchAccount() {
    endSession();
    clearSignedIn();
    window.location.assign(
      loginHref({ returnTo: `/dashboard/invitations/${token}`, lang })
    );
  }
  async function accept() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { workspaceId } = await workspaceService.accept(token);
      router.replace(`/dashboard/workspaces/${workspaceId}`);
    } catch (e) {
      setError(workspaceError(e));
      setBusy(false);
    }
  }
  return (
    <TeamShell title={t("team.acceptTitle")} description={t("team.acceptDesc")}>
      {error && (
        <TeamError
          code={error}
          retry={error === "REQUEST_FAILED" ? load : undefined}
        />
      )}
      {!invite && !error && <TeamLoading />}
      {invite && (
        <Card className="space-y-5">
          <PropertyList
            divided
            items={[
              [t("team.invitedTo"), invite.workspaceName],
              [t("team.invitedEmail"), invite.email],
              [t("team.invitedAs"), t(`team.role.${invite.role}`)],
            ]}
          />
          <p className="text-xs text-muted">
            {invite.accepted
              ? t("team.alreadyAccepted")
              : t("team.expires", {
                  date: formatDate(invite.expiresAt, lang),
                })}
          </p>
          {invite.accepted ? (
            // Nothing left to accept: this is navigation, so render it as
            // navigation instead of a POST that happens to be idempotent.
            <Link
              className={buttonClass()}
              href={`/dashboard/workspaces${
                invite.workspaceId ? `/${invite.workspaceId}` : ""
              }`}
            >
              {t("team.open")}
            </Link>
          ) : (
            <Button onClick={accept} aria-busy={busy} disabled={busy}>
              {t(busy ? "team.accepting" : "team.accept")}
            </Button>
          )}
        </Card>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={switchAccount}>
          {t("team.switchAccount")}
        </Button>
        <Link href="/dashboard" className={buttonClass({ variant: "secondary" })}>
          {t("team.personal")}
        </Link>
      </div>
    </TeamShell>
  );
}
