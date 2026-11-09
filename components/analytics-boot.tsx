"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { startAnalytics, trackPage } from "@/lib/analytics";

/** Starts PostHog after mount and reports each route, the first one included. */
export function AnalyticsBoot() {
  const pathname = usePathname();

  useEffect(() => {
    startAnalytics();
    trackPage();
  }, [pathname]);

  return null;
}
