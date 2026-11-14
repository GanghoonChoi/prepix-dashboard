"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { verifyEmailHref } from "@/lib/auth-entry";
import { workspaceService } from "@/lib/api/services/workspace.service";
import { useWorkspaceCapabilities } from "./capabilities";
import { buttonClass } from "@/components/ui";

/**
 * "Verify your email", for a signed-in email account that has not entered its
 * sign-up code. The button opens the code page, which mails a code if none is
 * out and comes back here.
 *
 * The waiting-invitation line is separate: an unverified user is handed a
 * COUNT in place of the invitation rows — no workspace name, no id, no token —
 * so this says an invitation is waiting and deliberately does not claim to
 * know which team. Repeating a name we were never given would leak exactly
 * what withholding the rows protects.
 *
 * The count is fetched here rather than passed in, because this renders above
 * every page and only for the rare unverified account.
 */
export function VerifyEmailNotice() {
  const { t, lang } = useI18n();
  const { capabilities } = useWorkspaceCapabilities();
  const [pending, setPending] = useState(0);
  const [here, setHere] = useState("/dashboard");
  const teamsEnabled = !!capabilities?.enabled;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHere(window.location.pathname + window.location.search);
  }, []);
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
  // account sees it on every screen until the code is in.
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
      </p>
      <Link
        href={verifyEmailHref(here, lang)}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {t("team.verifyEnterCode")}
      </Link>
    </section>
  );
}
