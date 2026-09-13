"use client";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import {
  workspaceService,
  type InviteRole,
  type InviteResult,
} from "@/lib/api/services/workspace.service";
import { parseInviteEmails, workspaceError } from "@/lib/workspaces/onboarding";
import { TeamError, inputClass, primaryClass } from "./shared";

export function InviteForm({
  workspaceId,
  isOwner,
  availableSeats,
  existingEmails,
  pendingEmails,
  onChange,
}: {
  workspaceId: string;
  isOwner: boolean;
  availableSeats: number;
  existingEmails: string[];
  pendingEmails: string[];
  onChange: () => Promise<void>;
}) {
  const { t } = useI18n();
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
        role
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
        <p role="alert" className="text-sm">
          {t("team.error.WORKSPACE_SEAT_LIMIT")}
        </p>
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
