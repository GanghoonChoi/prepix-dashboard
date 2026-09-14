import { apiClient } from "../client";

export type Profile = {
  id?: string;
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  /**
   * The account's verified state, aliased onto the profile from
   * `isEmailVerified`. Optional on purpose: a server older than the field
   * sends nothing, and `undefined` must never be read as "not verified" — we
   * only ever act on an explicit `false`.
   */
  emailVerified?: boolean;
  [key: string]: unknown;
};

export const userService = {
  getProfile: async (): Promise<Profile> => {
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
};
