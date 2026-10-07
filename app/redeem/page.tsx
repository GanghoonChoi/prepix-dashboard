import { redirect } from "next/navigation";

/**
 * The address a coupon is shared as: `dashboard.prepix.ai/redeem?code=…`.
 *
 * It only forwards. The plan page opens the coupon dialog with the code, and
 * because that page sits behind sign-in, someone without a session is sent
 * through sign-in or sign-up with this destination kept as `returnTo` — the
 * code survives the detour and is checked the moment they land.
 */
export default async function RedeemPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const clean = (code ?? "").toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  redirect(clean ? `/dashboard/plan?coupon=${clean}` : "/dashboard/plan");
}
