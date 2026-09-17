"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { workspaceService } from "@/lib/api/services/workspace.service";
import { useWorkspaceCapabilities } from "@/components/workspaces/capabilities";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";
import { workspaceError } from "@/lib/workspaces/onboarding";

export default function NewWorkspacePage() {
  const { t } = useI18n();
  const { capabilities, loaded } = useWorkspaceCapabilities();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      /*
        `resumed` here means a double-submit or a lost response landing on the
        same creator and the same name — the server handing back the row it
        already made rather than a duplicate. Either way the user asked for
        this workspace and it exists, so it is the same destination. A
        deliberate second team under a different name creates a new one, and
        running out of them is a 409, handled as its own message below.
      */
      const { workspace } = await workspaceService.create(name.trim());
      router.replace(`/dashboard/workspaces/${workspace.id}`);
    } catch (e) {
      setError(workspaceError(e));
      setBusy(false);
    }
  }
  return (
    <TeamShell title={t("team.newTitle")}>
      <ol
        aria-label={t("team.create")}
        className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted"
      >
        <li aria-current="step" className="font-medium text-foreground">
          {t("team.step1")}
        </li>
        <li>{t("team.step2")}</li>
        <li>{t("team.step3")}</li>
      </ol>
      {!loaded ? (
        <TeamLoading />
      ) : !capabilities?.enabled ? (
        <TeamError code="WORKSPACES_DISABLED" />
      ) : !capabilities.canCreate ? (
        <TeamError code="WORKSPACE_CREATION_UNAVAILABLE" />
      ) : (
        <form onSubmit={create} className="max-w-xl space-y-6">
          <div className="space-y-2">
            <label htmlFor="workspace-name" className="block text-sm font-medium">
              {t("team.name")}
            </label>
            <input
              id="workspace-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              autoComplete="organization"
              placeholder={t("team.placeholder")}
              aria-describedby="workspace-name-hint"
              disabled={busy}
            />
            <p id="workspace-name-hint" className="text-xs text-muted">
              {t("team.nameHint")}
            </p>
          </div>
          {/* One field does not need a panel of terms beside it. What a person
              weighs here is the seat count and whether this costs money; the
              rest described features that do not exist yet. */}
          <p className="text-xs leading-5 text-muted">
            {t("team.previewTerms", { seats: capabilities.previewSeats })}
            {typeof capabilities.remainingCreations === "number" &&
              ` · ${t("team.remaining", { count: capabilities.remainingCreations })}`}
          </p>
          {error && <TeamError code={error} />}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className={primaryClass}
              disabled={busy || !name.trim()}
            >
              {t(busy ? "team.creating" : "team.create")}
            </button>
            <Link href="/dashboard" className={secondaryClass}>
              {t("team.personal")}
            </Link>
          </div>
        </form>
      )}
    </TeamShell>
  );
}
