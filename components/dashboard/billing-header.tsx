"use client";

import type { ReactNode } from "react";
import { PageHeader, PageTabs } from "@/components/ui";
import { useT } from "@/lib/i18n/context";

/** 플랜과 결제 — one page with two tabs, so plan and usage stop repeating each other's numbers from two sidebar entries. */
export function BillingHeader({ actions }: { actions?: ReactNode }) {
  const t = useT();
  return (
    <>
      <PageHeader title={t("plan.sectionTitle")} actions={actions} />
      <PageTabs
        tabs={[
          { href: "/dashboard/plan", label: t("plan.title") },
          { href: "/dashboard/usage", label: t("usage.title") },
        ]}
      />
    </>
  );
}
