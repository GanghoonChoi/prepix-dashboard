"use client";
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
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

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
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userInfo");
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
        <section className="max-w-xl space-y-6 rounded-xl border border-border p-6">
          <dl className="space-y-4">
            {[
              [t("team.invitedTo"), invite.workspaceName],
              [t("team.invitedEmail"), invite.email],
              [t("team.invitedAs"), t(`team.role.${invite.role}`)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="mt-1 break-all font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            {invite.accepted
              ? t("team.alreadyAccepted")
              : t("team.expires", {
                  date: new Date(invite.expiresAt).toLocaleDateString(lang),
                })}
          </p>
          {invite.accepted ? (
            // Nothing left to accept: this is navigation, so render it as
            // navigation instead of a POST that happens to be idempotent.
            <Link
              className={primaryClass}
              href={`/dashboard/workspaces${
                invite.workspaceId ? `/${invite.workspaceId}` : ""
              }`}
            >
              {t("team.open")}
            </Link>
          ) : (
            <button className={primaryClass} onClick={accept} disabled={busy}>
              {t(busy ? "team.accepting" : "team.accept")}
            </button>
          )}
        </section>
      )}
      <div className="flex flex-wrap gap-3">
        <button onClick={switchAccount} className={secondaryClass}>
          {t("team.switchAccount")}
        </button>
        <Link href="/dashboard" className={secondaryClass}>
          {t("team.personal")}
        </Link>
      </div>
    </TeamShell>
  );
}
