import { apiClient } from "../client";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenExpires: number;
  user: {
    id: string;
    email: string;
    username?: string;
  };
}

export interface RegisterResponse {
  id: string;
  email: string;
  username?: string;
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post("/auth/email/login", data);
    return response.data.data;
  },

  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const response = await apiClient.post("/auth/register", data);
    return response.data.data;
  },

  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data.data;
  },

  logout: () => {
    localStorage.clear();
  },
};
