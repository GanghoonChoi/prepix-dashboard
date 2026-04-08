import { apiClient } from "../client";

export const userService = {
  getProfile: async () => {
    const response = await apiClient.get("/users/profile");
    return response.data.data;
  },

  updateProfile: async (data: Record<string, unknown>) => {
    const response = await apiClient.patch("/users/profile", data);
    return response.data.data;
  },

  changePassword: async (data: {
    currentPassword: string;
    newPassword: string;
  }) => {
    const response = await apiClient.post("/users/change-password", data);
    return response.data.data;
  },

  // Notifications - not yet implemented in backend
  getNotifications: async () => {
    return {
      emailNotifications: true,
      marketingEmails: false,
      productUpdates: true,
      usageAlerts: true,
    };
  },

  updateNotifications: async (_data: Record<string, boolean>) => {
    // no-op until backend implements this
  },
};
