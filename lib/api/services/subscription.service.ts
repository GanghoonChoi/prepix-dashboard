import { apiClient } from "../client";

export type BillingInterval = "month" | "year";

export interface PlanPrice {
  interval: BillingInterval;
  currency: string;
  unitAmount: number;
  launchDiscountPercent?: number | null;
}

export interface CatalogPlan {
  id: string;
  displayName: string;
  status: "active" | "coming_soon";
  displayOrder: number;
  inferenceSecondsPerMonth: number;
  videosPerMonth: number;
  storageLimitBytes: number;
  prices: PlanPrice[];
}

export interface CheckoutResult {
  // Server-created Paddle transaction the overlay opens (client-side creation
  // is blocked for this vendor, so the backend always pre-creates it).
  transactionId: string;
  checkoutUrl: string;
  priceId: string;
  email: string;
  userId: string;
  plan: string;
  interval: BillingInterval;
  discountId?: string;
}

export const subscriptionService = {
  getCurrent: async () => {
    const response = await apiClient.get("/subscriptions/current");
    return response.data.data;
  },

  // The public catalog — single source of truth for tiers, prices and status.
  getPlans: async (): Promise<CatalogPlan[]> => {
    const response = await apiClient.get("/subscriptions/plans");
    return response.data.data;
  },

  checkout: async (
    planId: string,
    interval: BillingInterval = "month",
  ): Promise<CheckoutResult> => {
    const response = await apiClient.post("/subscriptions/checkout", {
      planId,
      interval,
    });
    return response.data.data;
  },

  changePlan: async (newPlanId: string, interval: BillingInterval = "month") => {
    const response = await apiClient.post("/subscriptions/change-plan", {
      newPlanId,
      interval,
    });
    return response.data.data;
  },

  cancel: async () => {
    const response = await apiClient.post("/subscriptions/cancel");
    return response.data.data;
  },

  refund: async (): Promise<{ message: string }> => {
    const response = await apiClient.post("/subscriptions/refund");
    return response.data.data;
  },
};
