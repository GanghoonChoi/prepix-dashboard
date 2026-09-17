"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { cloudService } from "@/lib/api/services/cloud.service";
import { useI18n } from "@/lib/i18n/context";
import { primaryClass } from "./shared";
export function CloudEntry({ workspaceId }: { workspaceId: string }) {
  const { lang, t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void cloudService
      .capabilities(workspaceId)
      .then((c) => {
        if (active) setEnabled(c.enabled);
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);
  return (
    <section className="flex gap-4 rounded-xl border border-border bg-surface p-5">
      <Cloud
        size={22}
        strokeWidth={1.5}
        className="shrink-0"
        aria-hidden="true"
      />
      <div className="space-y-3">
        <h2 className="text-sm font-medium">
          {enabled
            ? lang === "ko"
              ? "팀 아카이브"
              : "Team archive"
            : t("team.cloudTitle")}
        </h2>
        {/* Only the disabled card has something to say. Enabled, the title
            and the button already say it, and a sentence between them is a
            sentence the reader steps over on the way to the click. */}
        {!enabled && (
          <p className="text-sm leading-6 text-muted">{t("team.cloudDesc")}</p>
        )}
        {enabled && (
          <Link
            className={primaryClass}
            href={`/dashboard/workspaces/${workspaceId}/media`}
          >
            {lang === "ko" ? "아카이브 열기" : "Open the archive"}
          </Link>
        )}
      </div>
    </section>
  );
}
