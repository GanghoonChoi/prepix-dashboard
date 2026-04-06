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

export const PLAN_PRICE_IDS: Record<
  string,
  { monthly: string; yearly: string }
> = {
  standard: {
    monthly: "pri_01kdthkpyb53xptj3j9fs4b7dz",
    yearly: "pri_01kdthqz3r774jdnyzb5ytxrjr",
  },
  pro: {
    monthly: "pri_01kc0tyfe10k22pfr8e5z4ef1b",
    yearly: "pri_01kdthpskwt47m2jqbdbmf3854",
  },
  ultra: {
    monthly: "pri_01kdthnbpkvt6vs6wvtstss3vv",
    yearly: "pri_01kdthrvwmysbmme1c3ywzw0gf",
  },
};

export const PLAN_PRICES: Record<
  string,
  { monthly: number; yearly: number }
> = {
  free: { monthly: 0, yearly: 0 },
  standard: { monthly: 16, yearly: 12 },
  pro: { monthly: 56, yearly: 48 },
  ultra: { monthly: 96, yearly: 79 },
};

export const PLAN_DESCRIPTIONS: Record<string, string> = {
  free: "Perfect for getting started with basic features.",
  standard: "Essential tools for small, fast-moving teams.",
  pro: "Advanced AI models, integrations, and priority support.",
  ultra: "Custom solutions, dedicated infrastructure, and strategic guidance.",
};

export const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "60 minutes of AI processing",
    "Basic features",
    "1 GB storage",
    "Community support",
  ],
  standard: [
    "250 minutes of AI processing",
    "Core AI tools",
    "10 GB storage",
    "Email support",
  ],
  pro: [
    "1000 minutes of AI processing",
    "Full access to all features",
    "100 GB storage",
    "Priority support",
    "Fast video processing",
  ],
  ultra: [
    "2000 minutes of AI processing",
    "Custom AI models",
    "Unlimited storage",
    "Dedicated account manager",
    "API access",
  ],
};

export const COMPARISON_ROWS = [
  {
    feature: "AI Processing Time",
    free: "60 min",
    standard: "250 min",
    pro: "1000 min",
    ultra: "2000 min",
  },
  {
    feature: "Storage",
    free: "1 GB",
    standard: "10 GB",
    pro: "100 GB",
    ultra: "Unlimited",
  },
  {
    feature: "Max Video Length",
    free: "10 min",
    standard: "30 min",
    pro: "2 hours",
    ultra: "Unlimited",
  },
  {
    feature: "Videos per Month",
    free: "3",
    standard: "10",
    pro: "100",
    ultra: "Unlimited",
  },
  {
    feature: "AI Features",
    free: "Basic",
    standard: "Standard",
    pro: "Advanced",
    ultra: "Custom AI",
  },
  {
    feature: "API Access",
    free: false,
    standard: false,
    pro: false,
    ultra: true,
  },
  {
    feature: "Support",
    free: "Community",
    standard: "Email",
    pro: "Priority",
    ultra: "Dedicated",
  },
];
