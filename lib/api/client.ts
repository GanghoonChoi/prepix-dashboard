import axios from "axios";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/v2`,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Single-flight refresh. The backend rotates (and revokes) the refresh token on
// every /auth/refresh call, so if two requests 401 at the same time and each
// fires its own refresh, the first rotates the token and the second gets a 401
// on the now-revoked token — logging a perfectly valid session out. We share a
// single in-flight refresh promise across all concurrent 401s instead: the
// first starts the refresh, the rest await the same promise and retry with the
// resulting access token.
let refreshPromise: Promise<string> | null = null;

function handleAuthFailure() {
  if (typeof window !== "undefined") {
    localStorage.clear();
    window.location.replace("/login");
  }
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken =
    typeof window !== "undefined"
      ? localStorage.getItem("refreshToken")
      : null;
  if (!refreshToken) {
    throw new Error("No refresh token");
  }

  const { data } = await axios.post(`${API_BASE_URL}/v2/auth/refresh`, {
    refreshToken,
  });

  localStorage.setItem("accessToken", data.data.accessToken);
  localStorage.setItem("refreshToken", data.data.refreshToken);
  return data.data.accessToken as string;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      // No refresh token at all → nothing to try, go straight to login.
      if (
        typeof window === "undefined" ||
        !localStorage.getItem("refreshToken")
      ) {
        handleAuthFailure();
        return Promise.reject(error);
      }

      try {
        // Start a refresh only if one isn't already running; concurrent 401s
        // all await the same promise. Cleared once settled so the next expiry
        // starts fresh.
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null;
          });
        }
        const newAccessToken = await refreshPromise;

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        handleAuthFailure();
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
