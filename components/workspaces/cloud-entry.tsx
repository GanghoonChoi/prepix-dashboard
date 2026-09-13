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
              ? "팀 프로젝트와 클라우드"
              : "Team projects and cloud"
            : t("team.cloudTitle")}
        </h2>
        <p className="text-sm leading-6 text-muted">
          {enabled
            ? lang === "ko"
              ? "프로젝트별로 함께할 멤버를 정하고, 팀 파일과 저장 용량을 관리하세요."
              : "Choose the people for each project and manage team files and storage."
            : t("team.cloudDesc")}
        </p>
        {enabled && (
          <Link
            className={primaryClass}
            href={`/dashboard/workspaces/${workspaceId}/projects`}
          >
            {lang === "ko" ? "팀 프로젝트 열기" : "Open team projects"}
          </Link>
        )}
      </div>
    </section>
  );
}
