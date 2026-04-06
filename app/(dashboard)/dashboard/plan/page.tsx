"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  Button,
  Chip,
} from "@heroui/react";
import {
  Modal,
  ModalBackdrop,
  ModalContainer,
  ModalDialog,
  ModalHeader,
  ModalHeading,
  ModalBody,
  ModalFooter,
} from "@heroui/react";
import { Skeleton } from "@heroui/react";
import { Check, X } from "lucide-react";
import { subscriptionService } from "@/lib/api/services/subscription.service";
import {
  PLAN_PRICES,
  PLAN_DESCRIPTIONS,
  PLAN_FEATURES,
  COMPARISON_ROWS,
} from "@/lib/constants/data";
import { useOverlayState } from "@heroui/react";

const PLANS = ["free", "standard", "pro", "ultra"] as const;
const PLAN_NAMES: Record<string, string> = {
  free: "Free", standard: "Standard", pro: "Pro", ultra: "Ultra",
};

export default function PlanPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [currentSub, setCurrentSub] = useState<Record<string, string> | null>(null);
  const cancelModal = useOverlayState();

  useEffect(() => {
    subscriptionService
      .getCurrent()
      .then(setCurrentSub)
      .catch(() => setCurrentSub({ plan: "free", status: "active" }))
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = async (planId: string) => {
    if (planId === "free") { cancelModal.open(); return; }
    setActionLoading(true);
    try {
      const result = await subscriptionService.checkout(planId);
      if (result.priceId && window.Paddle) {
        window.Paddle.Checkout.open({
          items: [{ priceId: result.priceId, quantity: 1 }],
          customer: result.email ? { email: result.email } : undefined,
          customData: result.userId ? { userId: result.userId } : undefined,
          settings: {
            displayMode: "overlay",
            theme: "dark",
            showAddDiscounts: true,
            successUrl: `${window.location.origin}/dashboard/plan?success=true`,
          },
        });
      } else if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      alert(axiosErr.response?.data?.message || "Failed to start checkout");
    }
    setActionLoading(false);
  };

  const confirmCancel = async () => {
    setActionLoading(true);
    try {
      await subscriptionService.changePlan("free");
      const data = await subscriptionService.getCurrent();
      setCurrentSub(data);
      cancelModal.close();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      alert(axiosErr.response?.data?.message || "Failed to cancel");
    }
    setActionLoading(false);
  };

  const currentPlan = currentSub?.plan || "free";
  const price = PLAN_PRICES[currentPlan]?.[billingCycle] ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Plan</h1>
        <p className="mt-1 text-sm text-muted">Manage your subscription.</p>
      </div>

      {/* Current plan */}
      <Card>
        <CardContent className="pt-5 pb-5">
          {loading ? (
            <Skeleton className="h-16 w-full rounded" />
          ) : (
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {PLAN_NAMES[currentPlan]}
                  </h2>
                  <Chip size="sm" color={currentSub?.status === "active" ? "success" : "danger"} variant="soft">
                    {currentSub?.status === "active" ? "Active" : "Cancelled"}
                  </Chip>
                </div>
                <p className="mt-1 text-sm text-muted">
                  ${price}/month &middot; Billed {billingCycle}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onPress={() => cancelModal.open()}
              >
                Cancel
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Billing toggle + plans */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Available plans</h2>
          <div className="flex rounded-md border border-border text-xs">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                billingCycle === "monthly" ? "bg-surface text-foreground" : "text-muted"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                billingCycle === "yearly" ? "bg-surface text-foreground" : "text-muted"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((planId) => {
            const isCurrent = currentPlan === planId;
            const planPrice = PLAN_PRICES[planId][billingCycle];

            return (
              <div
                key={planId}
                className={`flex flex-col rounded-lg border p-5 ${
                  isCurrent ? "border-foreground" : "border-border"
                }`}
              >
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">
                    {PLAN_NAMES[planId]}
                  </p>
                  <p className="mt-1 text-xs text-muted leading-relaxed">
                    {PLAN_DESCRIPTIONS[planId]}
                  </p>
                  <p className="mt-3">
                    <span className="text-2xl font-semibold tabular-nums text-foreground">
                      ${planPrice}
                    </span>
                    <span className="text-xs text-muted">/mo</span>
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {PLAN_FEATURES[planId].map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-muted">
                        <span className="mt-0.5 text-foreground">·</span>
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className="mt-5 w-full"
                  variant={isCurrent ? "outline" : "primary"}
                  size="sm"
                  isDisabled={isCurrent || actionLoading}
                  onPress={() => handleUpgrade(planId)}
                >
                  {isCurrent ? "Current" : "Select"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Comparison table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compare Plans</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left font-medium text-muted">Feature</th>
                {PLANS.map((p) => (
                  <th key={p} className="px-4 py-3 text-center font-medium text-muted">
                    {PLAN_NAMES[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {COMPARISON_ROWS.map((row) => (
                <tr key={row.feature}>
                  <td className="px-4 py-3 text-foreground">{row.feature}</td>
                  {PLANS.map((p) => {
                    const val = row[p];
                    return (
                      <td key={p} className="px-4 py-3 text-center text-muted">
                        {typeof val === "boolean" ? (
                          val ? <Check className="mx-auto h-3.5 w-3.5 text-foreground" /> : <X className="mx-auto h-3.5 w-3.5 text-muted/40" />
                        ) : (
                          val
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </CardContent>
      </Card>

      {/* Cancel modal */}
      <Modal state={cancelModal}>
        <ModalBackdrop />
        <ModalContainer>
          <ModalDialog>
            <ModalHeader>
              <ModalHeading>Cancel subscription</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <p className="text-sm text-muted">
                Are you sure? You&apos;ll lose access to premium features at the end of your billing period.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button variant="outline" size="sm" onPress={() => cancelModal.close()} isDisabled={actionLoading}>
                Keep plan
              </Button>
              <Button variant="danger" size="sm" onPress={confirmCancel} isDisabled={actionLoading}>
                {actionLoading ? "Cancelling..." : "Cancel subscription"}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </Modal>
    </div>
  );
}
