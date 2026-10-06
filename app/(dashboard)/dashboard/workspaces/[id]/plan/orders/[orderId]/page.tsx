"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useWorkspace } from "@/components/workspaces/workspace-context";
import { B2bError } from "@/components/b2b/shared";
import { BillingOrder } from "@/components/b2b/billing-order";

/** S23 payment result. Billing authority only; never project content. */
export default function Page() {
  const { data, b2b } = useWorkspace()!;
  const { orderId } = useParams<{ orderId: string }>();
  if (!b2b?.enrolled || !b2b.allowedActions.billing)
    return <B2bError code="B2B_BILLING_PERMISSION_REQUIRED" />;
  return (
    <Suspense>
      <BillingOrder workspaceId={data.workspace.id} orderId={orderId} />
    </Suspense>
  );
}
