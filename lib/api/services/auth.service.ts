import { apiClient } from "../client";
import { clearSignedIn } from "@/lib/account-hint";
import { readAttributionId } from "@/lib/device-connect";
import { purgeReviewLocalData } from "@/lib/b2b-reviews/operations";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username?: string;
  /** Cloudflare Turnstile. Omitted when no site key is configured. */
  turnstileToken?: string;
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
  /**
   * Whether an address can still be registered, asked BEFORE the form spends
   * three more steps on it. `usesGoogle` is what lets the answer point at a
   * door rather than just refusing.
   */
  emailAvailable: async (email: string) =>
    (
      await apiClient.post<{
        data: { available: boolean; usesGoogle: boolean };
      }>("/auth/email/available", { email })
    ).data.data,
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await apiClient.post("/auth/email/login", data);
    return response.data.data;
  },

  /*
    `register` and `googleLogin` both carry the website's `px_aid` cookie when
    the browser has one, so the backend can record which web visit an account
    came from (`user_signed_up`). Read here rather than by each caller, so no
    sign-up door forgets it. A property only — never an alias or merge.
  */
  register: async (data: RegisterRequest): Promise<RegisterResponse> => {
    const attributionId = readAttributionId();
    const response = await apiClient.post("/auth/register", {
      ...data,
      ...(attributionId ? { attributionId } : {}),
    });
    return response.data.data;
  },

  getMe: async () => {
    const response = await apiClient.get("/auth/me");
    return response.data.data;
  },

  googleLogin: async (idToken: string): Promise<LoginResponse> => {
    const attributionId = readAttributionId();
    const response = await apiClient.post("/auth/google", {
      idToken,
      ...(attributionId ? { attributionId } : {}),
    });
    return response.data.data;
  },

  requestPasswordReset: async (
    email: string,
    turnstileToken?: string,
  ): Promise<{ success: true }> => {
    const response = await apiClient.post("/auth/password-reset/request", {
      email,
      ...(turnstileToken ? { turnstileToken } : {}),
    });
    return response.data.data;
  },

  /**
   * Mail a sign-up code to the signed-in account's own address. The address is
   * never a parameter — the server takes it from the session — so this cannot
   * be used to mail a stranger. `ensure` sends only when no usable code is out
   * (what the code page asks on open); without it, a new code (다시 보내기).
   * Rate limited; a 429 comes back in the house error shape.
   */
  requestEmailVerification: async (
    ensure = false,
  ): Promise<{ success: true; alreadyVerified: boolean }> => {
    const response = await apiClient.post(
      "/auth/email/verify/request",
      ensure ? { ensure: true } : {},
    );
    return response.data.data;
  },

  /** The six digits from that mail, for the signed-in account. */
  confirmEmailCode: async (code: string): Promise<{ success: true }> => {
    const response = await apiClient.post("/auth/email/verify/code", { code });
    return response.data.data;
  },

  resetPassword: async (
    token: string,
    password: string,
  ): Promise<{ success: true }> => {
    const response = await apiClient.post("/auth/password-reset/confirm", {
      token,
      password,
    });
    return response.data.data;
  },

  /**
   * Trade this browser session for a one-time code the desktop app can redeem.
   *
   * The app never sees a password. It generates a PKCE verifier, sends only the
   * S256 challenge here, and proves possession when it redeems — which is what
   * makes the code useless to anything else that can read the loopback URL it
   * travels on. See the backend's `device_auth_codes` schema.
   */
  authorizeDevice: async (params: {
    codeChallenge: string;
    attributionId?: string;
  }): Promise<{ code: string; expiresIn: number }> => {
    const response = await apiClient.post("/auth/device/authorize", {
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: "S256",
      ...(params.attributionId ? { attributionId: params.attributionId } : {}),
    });
    return response.data.data;
  },

  logout: () => {
    let userId: string | null = null;
    try {
      userId = JSON.parse(localStorage.getItem("userInfo") ?? "null")?.id ?? null;
    } catch {
      /* unreadable profile: purge every account's review data */
    }
    void purgeReviewLocalData(userId);
    localStorage.clear();
    // The hint prepix.ai reads to decide between "sign in" and "dashboard".
    // It is not in localStorage — clearing it is a separate act.
    clearSignedIn();
  },
};
