import { apiClient } from "../client";

export type BillingInterval = "month" | "year";

export interface PlanPrice {
  interval: BillingInterval;
  currency: string;
  unitAmount: number;
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

  checkout: async (planId: string, interval: BillingInterval = "month") => {
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
};
