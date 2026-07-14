"use client";

import { useEffect, useRef } from "react";
import { authService } from "@/lib/api/services/auth.service";

type Props = {
  onSuccess: (user: unknown) => void;
  onError?: (message: string) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
};

/**
 * "Sign in with Google" via Google Identity Services. The browser obtains a
 * verified ID token client-side (using the public web client id) and we hand it
 * to the backend's /auth/google, which verifies it and returns app tokens.
 *
 * Renders nothing when NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset, so the button
 * simply doesn't appear in environments where Google login isn't configured.
 */
export function GoogleSignInButton({
  onSuccess,
  onError,
  text = "continue_with",
}: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  // Keep callbacks in refs so the init effect stays stable (it should run once,
  // not re-run and re-render the Google button every parent render).
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const gsi = window.google?.accounts?.id;
      if (!gsi || !divRef.current) {
        // GIS script still loading — retry shortly.
        window.setTimeout(init, 150);
        return;
      }

      gsi.initialize({
        client_id: clientId,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            onErrorRef.current?.("Google sign-in was cancelled.");
            return;
          }
          try {
            const data = await authService.googleLogin(response.credential);
            if (data.accessToken && data.refreshToken) {
              localStorage.setItem("accessToken", data.accessToken);
              localStorage.setItem("refreshToken", data.refreshToken);
            }
            if (data.user) {
              localStorage.setItem("userInfo", JSON.stringify(data.user));
            }
            onSuccessRef.current(data.user);
          } catch (err: unknown) {
            const axiosErr = err as {
              response?: { data?: { message?: string } };
            };
            onErrorRef.current?.(
              axiosErr.response?.data?.message || "Google sign-in failed.",
            );
          }
        },
      });

      gsi.renderButton(divRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text,
        shape: "rectangular",
        logo_alignment: "center",
        width: 320,
      });
    };

    init();
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  if (!clientId) return null;

  return <div ref={divRef} className="flex min-h-[40px] justify-center" />;
}
