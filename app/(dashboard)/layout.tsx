"use client";

import { useState, useEffect } from "react";
import { WorkspaceCapabilities } from "@/components/workspaces/capabilities";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { LoadingScreen } from "@/components/loading-screen";
import { ToastProvider, useToast } from "@/components/toast";
import { userService, type Profile } from "@/lib/api/services/user.service";
import { VerifyEmailNotice } from "@/components/workspaces/verify-email";
import { clearSignedIn } from "@/lib/account-hint";
import { loginHref, signupHref } from "@/lib/auth-entry";

// Paddle's eventCallback is registered in the layout effect, which lives ABOVE
// ToastProvider — so it can't call useToast directly. It dispatches a window
// event on checkout failure; this listener (rendered inside ToastProvider)
// turns that into a user-visible toast so a failed checkout is never silent.
function CheckoutErrorListener() {
  const toast = useToast();
  useEffect(() => {
    const handler = () =>
      toast(
        "We couldn't complete checkout. You have not been charged — please try again.",
        "error",
      );
    window.addEventListener("prepix:checkout-error", handler);
    return () => window.removeEventListener("prepix:checkout-error", handler);
  }, [toast]);
  return null;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // "checking" until we've confirmed a token client-side. We render only a
  // spinner while checking so protected content never flashes for an
  // unauthenticated visitor (tokens live in localStorage, so this can't be
  // gated server-side / in middleware).
  const [authState, setAuthState] = useState<"checking" | "authed">(
    "checking",
  );

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!accessToken && !refreshToken) {
      // Arriving here with no session means any hint left on `.prepix.ai` is
      // stale — drop it, or the marketing site keeps offering a dashboard this
      // browser cannot open.
      clearSignedIn();
      const returnTo = window.location.pathname + window.location.search;
      /**
       * An invitation link is the one route here that a person without an
       * account is SUPPOSED to arrive at, so it must not bounce them to a
       * sign-in form they cannot pass. But it must not do the reverse either:
       * this used to send EVERY unauthenticated invitee to sign-up, so an
       * email that correctly said "초대 수락하기" to somebody who already has
       * an account landed them on a registration form. The two halves of one
       * invitation told them different things.
       *
       * The server knows which it is — it decided the wording of that same
       * email — and says so with `?signup=1`. No flag means they have an
       * account and belong on sign-in. Both screens carry `returnTo` on to the
       * other, so a wrong guess would cost one click rather than the journey.
       */
      const invited = window.location.pathname.startsWith(
        "/dashboard/invitations/",
      );
      const needsAccount =
        new URLSearchParams(window.location.search).get("signup") === "1";
      window.location.replace(
        invited && needsAccount
          ? signupHref({ returnTo })
          : loginHref({ returnTo }),
      );
      return;
    }
    // Token confirmed synchronously from localStorage on mount — flip the render gate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthState("authed");

    // Init Paddle
    const initPaddle = () => {
      if (window.Paddle) {
        const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
        const env = process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT || "sandbox";
        if (token) {
          try {
            if (env === "sandbox") window.Paddle.Environment.set("sandbox");
            window.Paddle.Initialize({
              token,
              eventCallback: (data: { name: string; [key: string]: unknown }) => {
                if (data.name === "checkout.completed") {
                  setTimeout(() => window.location.reload(), 2000);
                }
                // Surface Paddle-side failures to the user instead of leaving a
                // silent/blank overlay. Relayed via a window event so the toast
                // fires from inside ToastProvider (see CheckoutErrorListener).
                // Log a bare message only — the event object may carry PII.
                if (data.name === "checkout.error") {
                  console.error("Paddle checkout error");
                  window.dispatchEvent(new CustomEvent("prepix:checkout-error"));
                }
              },
              checkout: {
                settings: { displayMode: "overlay", theme: "dark", showAddDiscounts: true },
              },
            });
            window.__paddleReady = true;
          } catch { /* ignore */ }
        }
      } else {
        setTimeout(initPaddle, 200);
      }
    };
    initPaddle();

    const cached = localStorage.getItem("userInfo");
    if (cached) {
      try { setProfile(JSON.parse(cached)); } catch { /* ignore */ }
    }

    userService.getProfile().then((data) => {
      setProfile(data);
      localStorage.setItem("userInfo", JSON.stringify(data));
    }).catch(() => {});
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userInfo");
    clearSignedIn();
    window.location.href = loginHref();
  };

  // Gate: don't render the shell until auth is confirmed (prevents flash of
  // protected content and matches the prerendered HTML to avoid hydration drift).
  if (authState === "checking") {
    return <LoadingScreen />;
  }

  return (
    <ToastProvider>
      <WorkspaceCapabilities>
        <CheckoutErrorListener />
        <div className="min-h-dvh bg-background">
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* Desktop sidebar */}
          <div className="hidden lg:block">
            <Sidebar profile={profile} onLogout={handleLogout} />
          </div>

          {/* Mobile sidebar */}
          <div
            id="mobile-navigation"
            inert={!mobileOpen}
            aria-hidden={!mobileOpen}
            className={`fixed inset-y-0 left-0 z-50 w-[220px] transform transition-transform duration-200 lg:hidden ${
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <Sidebar
              profile={profile}
              onLogout={handleLogout}
              onClose={() => setMobileOpen(false)}
            />
          </div>

          {/* Content */}
          <div className="lg:pl-[220px]">
            <DashboardHeader onMobileMenuToggle={() => setMobileOpen(!mobileOpen)} />
            {/* One content column for the whole dashboard. The workspace pages
                carried `mx-auto max-w-4xl` themselves and the personal pages
                carried nothing, so the app had two different measures
                depending on which entry in the sidebar you clicked. */}
            <main className="mx-auto max-w-4xl px-6 py-8 lg:px-10 lg:py-10">
              {/*
                Every signed-in page, not just the team one: verification gates
                accepting invitations, and `emailVerified` is now a real field
                rather than something inferred from a team-only response.
                Strictly `=== false` — an older server omits it entirely.
              */}
              {profile?.emailVerified === false && (
                <div className="mb-8">
                  <VerifyEmailNotice />
                </div>
              )}
              {children}
            </main>
          </div>
        </div>
      </WorkspaceCapabilities>
    </ToastProvider>
  );
}
