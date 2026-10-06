"use client";
import { Suspense } from "react";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { B2bError } from "@/components/b2b/shared";
import { BillingSettings } from "@/components/b2b/billing-settings";

/** S24 billing details. Billing authority only; never project content. */
export default function Page() {
  const { data, b2b } = useWorkspace()!;
  if (!b2b?.enrolled || !b2b.allowedActions.billing)
    return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <Suspense>
      <BillingSettings workspaceId={data.workspace.id} />
    </Suspense>
  );
}
