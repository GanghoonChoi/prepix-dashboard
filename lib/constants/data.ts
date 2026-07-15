// Display names for every plan id, including hidden/grandfathered ones (used to
// label a user's current plan). Prices, quotas, and which tiers are offered come
// from the backend catalog (/subscriptions/plans) — the single source of truth.
export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  student: "Student",
  creator: "Creator",
  premium: "Premium",
  pro: "Pro",
};

// Marketing copy per tier. The backend owns prices/quotas/status; the frontend
// owns the localized feature bullets, keyed by plan id.
export const PLAN_COPY: Record<string, { description: string; features: string[] }> = {
  free: {
    description: "Get started with AI video editing.",
    features: [
      "60 min of AI processing / month",
      "Rough cut generation",
      "Outputs up to 5 min · 720p",
      "2 projects",
      "Community support",
    ],
  },
  student: {
    description: "Full features at a student price.",
    features: [
      "180 min of AI processing / month",
      "Outputs up to 15 min · 1080p, no watermark",
      "5 projects / month",
      "Requires student verification",
    ],
  },
  creator: {
    description: "Everything you need to edit at full speed.",
    features: [
      "600 min of AI processing / month",
      "Outputs up to 2 hours · 4K, no watermark",
      "Multi-angle editing",
      "Natural language search",
      "Premiere Pro & Final Cut export",
      "Priority processing",
    ],
  },
  premium: {
    description: "Done-for-you editing with a dedicated director.",
    features: [
      "Unlimited AI processing",
      "Source-to-final delivery",
      "Dedicated directing",
      "2–3 revision rounds",
      "Custom SLA",
    ],
  },
};

// Format a catalog price. KRW is zero-decimal (amount is whole won); other
// currencies use the standard locale currency format.
export function formatPrice(currency: string, amount: number): string {
  if (currency === "KRW") return "₩" + amount.toLocaleString("ko-KR");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
