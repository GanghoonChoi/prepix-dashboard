"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type InviteRole,
  type InviteResult,
  type Workspace,
} from "@/lib/api/services/workspace.service";
import { parseInviteEmails, workspaceError } from "@/lib/workspaces/onboarding";
import {
  RoleCapabilities,
  SpaceBadge,
  TeamError,
  inputClass,
  primaryClass,
} from "./shared";

export function InviteForm({
  workspaceId,
  workspace,
  isOwner,
  availableSeats,
  existingEmails,
  pendingEmails,
  ownerEmail,
  onChange,
}: {
  workspaceId: string;
  /**
   * The space these people are about to be let into, named on the form itself.
   * A Figma user added an editor to a draft that turned out to live in a
   * client's team space and put that person on the client's payroll; the switcher
   * at the top of the page is not where anybody looks while typing addresses.
   */
  workspace: Pick<Workspace, "name" | "type">;
  isOwner: boolean;
  availableSeats: number;
  existingEmails: string[];
  pendingEmails: string[];
  ownerEmail?: string;
  onChange: () => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [raw, setRaw] = useState("");
  const [role, setRole] = useState<InviteRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<InviteResult[] | null>(null);
  const parsed = parseInviteEmails(raw).map((row) => {
    if (row.status !== "ready") return row;
    if (existingEmails.includes(row.email))
      return { ...row, status: "already_member" };
    if (pendingEmails.includes(row.email))
      return { ...row, status: "already_invited" };
    return row;
  });
  const ready = parsed.filter((row) => row.status === "ready");
  const overLimit = ready.length > 20;
  const seatsExceeded = role !== "reviewer" && ready.length > availableSeats;
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (busy || overLimit || seatsExceeded || !ready.length) return;
    setBusy(true);
    setError("");
    try {
      const { results } = await workspaceService.invite(
        workspaceId,
        ready.map((row) => row.email),
        role,
        lang
      );
      setResults([
        ...results,
        ...parsed.filter((row) => row.status !== "ready"),
      ]);
      // Preserve the draft on network failure. Successful responses stay visible
      // per address; failed delivery is retried from its persisted invitation row.
      setRaw(
        [
          ...results.filter(
            (row) =>
              row.status === "seat_limit" || row.status === "invalid_email"
          ),
          ...parsed.filter((row) => row.status === "invalid_email"),
        ]
          .map((row) => row.email)
          .join("\n")
      );
      await onChange();
    } catch (e) {
      setError(workspaceError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="space-y-4">
      <SpaceBadge workspace={workspace} />
      <div className="space-y-2">
        <label className="block text-sm font-medium" htmlFor="invite-emails">
          {t("team.emails")}
        </label>
        <textarea
          id="invite-emails"
          rows={3}
          className={inputClass}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={busy}
          aria-describedby="invite-hint"
          placeholder="name@company.com"
        />
        <p id="invite-hint" className="text-xs leading-5 text-muted">
          {t("team.emailsHint")}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="invite-role" className="block text-sm font-medium">
          {t("team.role")}
        </label>
        <select
          id="invite-role"
          className={`${inputClass} max-w-xs`}
          value={role}
          onChange={(e) => setRole(e.target.value as InviteRole)}
          disabled={busy}
        >
          <option value="editor">{t("team.role.editor")}</option>
          <option value="reviewer">{t("team.role.reviewer")}</option>
          {isOwner && <option value="admin">{t("team.role.admin")}</option>}
        </select>
        <p className="text-xs leading-5 text-muted">{t("team.roleHelp")}</p>
      </div>
      {/*
        Slack publishes a role-capability table; Figma, Linear and Descript show
        nothing at the moment a role is assigned, which is why "I made someone
        an admin by accident" is a named failure class. Static, next to the
        select, and it states the rule the server enforces silently: an admin
        cannot make anyone an owner.
      */}
      <RoleCapabilities />
      {parsed.length > 0 && (
        <div className="space-y-1 text-xs" aria-live="polite">
          <p className="text-muted">
            {t("team.validCount", { count: ready.length })}
          </p>
          {parsed
            .filter((row) => row.status !== "ready")
            .map((row, index) => (
              <p key={index} className="break-all">
                {row.email} · {t(`team.status.${row.status}`)}
              </p>
            ))}
        </div>
      )}
      {overLimit && (
        <p role="alert" className="text-sm">
          {t("team.batchLimit")}
        </p>
      )}
      {seatsExceeded && !overLimit && (
        <div role="alert" className="space-y-2 text-sm">
          <p>{t("team.error.WORKSPACE_SEAT_LIMIT")}</p>
          {/*
            F02.5 asks for a way to ASK for seats, not just to be told who can
            add them. There is no seat-request endpoint, so this uses the one
            channel that certainly exists rather than inventing an API. The
            draft above is untouched either way.
          */}
          {!isOwner && ownerEmail && (
            <p>
              {t("team.seatRequest", { email: ownerEmail })}{" "}
              <a
                className="underline underline-offset-4"
                href={`mailto:${encodeURIComponent(ownerEmail)}?subject=${encodeURIComponent(
                  t("team.seatRequestAction"),
                )}`}
              >
                {t("team.seatRequestAction")}
              </a>
            </p>
          )}
        </div>
      )}
      {error && <TeamError code={error} />}
      <button
        type="submit"
        disabled={busy || !ready.length || overLimit || seatsExceeded}
        className={primaryClass}
      >
        {t(busy ? "team.sending" : "team.send")}
      </button>
      {results && (
        <ul
          aria-live="polite"
          className="divide-y divide-border rounded-lg border border-border px-4"
        >
          {results.map((row, index) => (
            <li
              key={index}
              className="flex flex-wrap justify-between gap-2 py-3 text-xs"
            >
              <span className="break-all">{row.email}</span>
              <span className="text-muted">
                {t(`team.status.${row.status}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
