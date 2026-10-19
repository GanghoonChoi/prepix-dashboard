"use client";

import { PageHeader, PageTabs } from "@/components/ui";
import { PaymentHistory, planTabs } from "@/components/dashboard/payment-history";
import { useT } from "@/lib/i18n/context";
import { usePageTitle } from "@/lib/hooks/use-page-title";

/** 플랜과 결제's second tab: every payment, with its receipts. */
export default function PaymentsPage() {
  const t = useT();
  usePageTitle(t("plan.tabPayments"));
  return (
    <div>
      <PageHeader title={t("plan.sectionTitle")} />
      <PageTabs tabs={planTabs(t)} />
      <PaymentHistory />
    </div>
  );
}
