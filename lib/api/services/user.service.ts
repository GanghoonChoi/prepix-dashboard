import { apiClient } from "../client";

// Note: The backend only has GET /auth/me for user profile.
// Profile update, notifications, and password change are not yet implemented in the backend.
// These functions are stubs that will work once backend endpoints are added.

export const userService = {
  getProfile: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data.data;
  },

  // Stub - backend endpoint not yet implemented
  updateProfile: async (_data: Record<string, unknown>) => {
    throw new Error("Profile update not yet implemented in backend");
  },

  // Stub - backend endpoint not yet implemented
  getNotifications: async () => {
    return {
      emailNotifications: true,
      marketingEmails: false,
      productUpdates: true,
      usageAlerts: true,
    };
  },

  // Stub - backend endpoint not yet implemented
  updateNotifications: async (_data: Record<string, boolean>) => {
    throw new Error("Notification settings not yet implemented in backend");
  },

  // Stub - backend endpoint not yet implemented
  changePassword: async (_data: {
    currentPassword: string;
    newPassword: string;
  }) => {
    throw new Error("Password change not yet implemented in backend");
  },
};
