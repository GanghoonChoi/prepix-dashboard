import { apiClient } from "../client";

export const usageService = {
  getUsage: async () => {
    const response = await apiClient.get("/usage");
    return response.data.data;
  },
};
