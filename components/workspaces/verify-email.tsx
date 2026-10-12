"use client";
import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { authService } from "@/lib/api/services/auth.service";
import { workspaceService } from "@/lib/api/services/workspace.service";
import { workspaceError } from "@/lib/workspaces/onboarding";
import { useWorkspaceCapabilities } from "./capabilities";
import { TeamError } from "./shared";
import { Button } from "@/components/ui";

/**
 * "Verify your email", for a signed-in account that has not.
 *
 * Whether to show it comes from the account's own `emailVerified`, so it can
 * live above every dashboard page. The waiting-invitation line is separate: an
 * unverified user is handed a COUNT in place of the invitation rows — no
 * workspace name, no id, no token — so this says an invitation is waiting and
 * deliberately does not claim to know which team. Repeating a name we were
 * never given would leak exactly what withholding the rows protects.
 *
 * The count is fetched here rather than passed in, because this renders above
 * every page and only for the rare unverified account.
 */
export function VerifyEmailNotice() {
  const { t } = useI18n();
  const { capabilities } = useWorkspaceCapabilities();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);
  const teamsEnabled = !!capabilities?.enabled;
  useEffect(() => {
    if (!teamsEnabled) return;
    let active = true;
    workspaceService
      .list()
      .then((list) => {
        if (active) setPending(list.pendingInvitationCount ?? 0);
      })
      // A count we could not fetch simply goes unmentioned. It never becomes a
      // claim, and it never suppresses the verification prompt itself.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [teamsEnabled]);
  // One line above the page, not a card that pushes everything down: every new
  // account sees it on every screen until the link is opened.
  return (
    <section
      // Named, so it is a real landmark a screen reader can jump to rather than
      // an anonymous <section> that exposes no role at all.
      aria-labelledby="verify-email-heading"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-[13px]"
    >
      <MailCheck size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-muted" />
      <p className="min-w-0 flex-1 leading-5">
        <span id="verify-email-heading" role="heading" aria-level={2} className="font-semibold">
          {t("team.verifyTitle")}
        </span>{" "}
        <span className="text-muted">{t("team.verifyBody")}</span>
        {pending > 0 && <span className="block">{t("team.verifyPending", { count: pending })}</span>}
        {state === "sent" && (
          <span role="status" className="block">
            {t("team.verifySent")}
          </span>
        )}
      </p>
      {error && <TeamError code={error} />}
      <Button
        variant="secondary"
        size="sm"
        disabled={state === "sending"}
        aria-busy={state === "sending"}
        onClick={async () => {
          setState("sending");
          setError("");
          try {
            await authService.requestEmailVerification();
            setState("sent");
          } catch (e) {
            // A 429 is the expected answer to an impatient second click, and
            // says "wait", not "failed".
            setError(workspaceError(e));
            setState("idle");
          }
        }}
      >
        {t(state === "sending" ? "team.verifySending" : "team.verifyResend")}
      </Button>
    </section>
  );
}
