"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { useTeamCreation } from "@/components/workspaces/use-team-creation";
import { useWorkspaceCapabilities } from "@/components/workspaces/capabilities";
import {
  TeamShell,
  TeamError,
  TeamLoading,
  inputClass,
  primaryClass,
  secondaryClass,
} from "@/components/workspaces/shared";

export default function NewWorkspacePage() {
  const { t } = useI18n();
  const { capabilities, loaded } = useWorkspaceCapabilities();
  const router = useRouter();
  const [name, setName] = useState("");
  const { submit, busy, pending, error } = useTeamCreation(capabilities);
  const b2b = capabilities?.newTeamPolicy === "b2b_v1";
  async function create(event: React.FormEvent) {
    event.preventDefault();
    await submit(name, (workspace) =>
      router.replace(`/dashboard/workspaces/${workspace.id}`),
    );
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
      ) : !capabilities.canCreate && !pending ? (
        <TeamError code="WORKSPACE_CREATION_UNAVAILABLE" />
      ) : (
        <form onSubmit={create} className="max-w-xl space-y-6">
          <div className="space-y-2">
            <label
              htmlFor="workspace-name"
              className="block text-sm font-medium"
            >
              {t("team.name")}
            </label>
            <input
              id="workspace-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={b2b ? 100 : 80}
              autoComplete="organization"
              placeholder={t("team.placeholder")}
              aria-describedby="workspace-name-hint"
              disabled={busy || pending}
            />
            <p id="workspace-name-hint" className="text-xs text-muted">
              {t(b2b ? "team.b2bNameHint" : "team.nameHint")}
            </p>
          </div>
          <p className="text-xs leading-5 text-muted">
            {b2b
              ? t("team.b2bCreationTerms")
              : t("team.previewTerms", { seats: capabilities.previewSeats })}
            {typeof capabilities.remainingCreations === "number" &&
              ` · ${t("team.remaining", { count: capabilities.remainingCreations })}`}
          </p>
          {error && <TeamError code={error} />}
          {pending && !busy && (
            <p role="status" className="text-sm leading-6 text-muted">
              {t("team.creationRetryHint")}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className={primaryClass}
              disabled={busy || !name.trim()}
            >
              {t(
                busy
                  ? "team.creating"
                  : pending
                    ? "team.creationRetry"
                    : "team.create",
              )}
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
