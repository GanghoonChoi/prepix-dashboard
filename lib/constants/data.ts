export const JOB_ROLES = [
  "video_editor",
  "content_creator",
  "filmmaker",
  "motion_designer",
  "social_media_manager",
  "marketing_manager",
  "photographer",
  "producer",
  "student",
  "other",
];

export const INDUSTRIES = [
  "media_entertainment",
  "advertising_marketing",
  "education",
  "technology",
  "ecommerce",
  "healthcare",
  "real_estate",
  "gaming",
  "sports",
  "other",
];

export const PLANS = ["free", "pro"] as const;

export const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  pro: "Pro",
};

export const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: "Get started with basic AI video editing features.",
  pro: "Full power of the AI editing agent. $1/mo for your first 2 months.",
};

export const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "60 minutes of AI processing",
    "Rough cut generation",
    "NG take removal",
    "Community support",
  ],
  pro: [
    "Unlimited AI processing",
    "Rough cut generation",
    "NG take removal",
    "Natural language search",
    "Premiere Pro & DaVinci export",
    "Priority support",
  ],
};

export const PLAN_PRICES: Record<string, { monthly: number; label: string }> = {
  free: { monthly: 0, label: "Free forever" },
  pro: { monthly: 1, label: "$1/mo for first 2 months, then $56/mo" },
};

export const COMPARISON_ROWS = [
  { feature: "AI Processing", free: "60 min", pro: "Unlimited" },
  { feature: "Rough cut generation", free: true, pro: true },
  { feature: "NG take removal", free: true, pro: true },
  { feature: "Natural language search", free: false, pro: true },
  { feature: "Premiere Pro & DaVinci export", free: false, pro: true },
  { feature: "Support", free: "Community", pro: "Priority" },
];
