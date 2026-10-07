import { apiClient } from "../client";

/** Why the server refused a code — worded by the dashboard, never by the API. */
export type CouponRefusal =
  | "not_found"
  | "expired"
  | "used_up"
  | "already_redeemed"
  | "not_for_this_account"
  | "new_accounts_only"
  | "already_on_plan"
  | "already_subscribed";

export type CouponBenefit =
  | { kind: "plan_pass"; plan: string; planName: string; days: number; startsAt: string; endsAt: string }
  | { kind: "minutes"; minutes: number; validDays: number; expiresAt: string }
  | { kind: "discount"; plan: string; planName: string; percent: number; validDays: number; expiresAt: string };

export type CouponPreview =
  | { valid: true; benefit: CouponBenefit }
  | { valid: false; reason: CouponRefusal; detail?: string };

export interface CouponBenefits {
  pass: { plan: string; endsAt: string } | null;
  credits: { remainingSeconds: number; items: { remainingSeconds: number; expiresAt: string }[] };
  discounts: { plan: string; percent: number; expiresAt: string }[];
}

const REFUSALS: readonly CouponRefusal[] = [
  "not_found", "expired", "used_up", "already_redeemed",
  "not_for_this_account", "new_accounts_only", "already_on_plan", "already_subscribed",
];

/** A refusal from redeem arrives as a 400 whose message is the same key preview uses. */
export function refusalOf(err: unknown): CouponRefusal | null {
  const message = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return REFUSALS.find((r) => r === message) ?? null;
}

export const couponService = {
  preview: async (code: string): Promise<CouponPreview> => {
    const res = await apiClient.post("/coupons/preview", { code });
    return res.data.data;
  },
  redeem: async (code: string): Promise<CouponBenefit> => {
    const res = await apiClient.post("/coupons/redeem", { code });
    return res.data.data;
  },
  benefits: async (): Promise<CouponBenefits> => {
    const res = await apiClient.get("/coupons/benefits");
    return res.data.data;
  },
};
