import { apiClient } from "../client";

export const subscriptionService = {
  getCurrent: async () => {
    const response = await apiClient.get("/subscriptions/current");
    return response.data.data;
  },

  checkout: async (planId: string) => {
    const response = await apiClient.post("/subscriptions/checkout", {
      planId,
    });
    return response.data.data;
  },

  changePlan: async (newPlanId: string) => {
    const response = await apiClient.post("/subscriptions/change-plan", {
      newPlanId,
    });
    return response.data.data;
  },
};
