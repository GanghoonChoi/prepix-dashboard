"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { userService } from "@/lib/api/services/user.service";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");
    if (!accessToken && !refreshToken) {
      window.location.replace("/login");
      return;
    }

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
              eventCallback: (data: { name: string }) => {
                if (data.name === "checkout.completed") {
                  setTimeout(() => window.location.reload(), 2000);
                }
              },
              checkout: {
                settings: { displayMode: "overlay", theme: "dark", showAddDiscounts: true },
              },
            });
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
    window.location.href = "/login";
  };

  return (
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
        className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:hidden ${
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
        <main className="px-6 py-8 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
