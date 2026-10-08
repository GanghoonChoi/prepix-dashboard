/**
 * Where someone is in first-run, and the small sums its screens show.
 *
 * Personal and team share one container — a workspace — and one sequence; the
 * first answer only decides which steps follow (spec:
 * docs/plans/onboarding-renewal-design-2026-10-08.md):
 *
 *   join      offered only when there is something to join. Skippable.
 *   use       "how will you use Prepix" — the one required answer.
 *   profile   role, kind of video, how they found us. Skippable.
 *   workspace the name, for both kinds; a team is created here.
 *   invite    team only: addresses, held until the team is paid for.
 *   pay       team only: the seat summary, then the team plan page pays.
 *   app       the desktop app — where the work happens.
 *   edit      the first-edit guide.
 */
export type StartStep =
  | "join"
  | "use"
  | "profile"
  | "workspace"
  | "invite"
  | "pay"
  | "app"
  | "edit";
export type Intent = "personal" | "team";

const STEPS: StartStep[] = [
  "join",
  "use",
  "profile",
  "workspace",
  "invite",
  "pay",
  "app",
  "edit",
];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type StartState = {
  step: StartStep;
  workspace: string | null;
  intent: Intent | null;
  next: "plan" | null;
};

/** URLs only carry navigation intent. Membership always comes from the API. */
export function readStartState(search: string): StartState {
  const params = new URLSearchParams(search);
  const workspace = params.get("workspace");
  const intent = params.get("intent");
  return {
    step: STEPS.find((known) => known === params.get("step")) ?? "join",
    workspace: workspace && UUID.test(workspace) ? workspace : null,
    intent: intent === "personal" || intent === "team" ? intent : null,
    next: params.get("next") === "plan" ? "plan" : null,
  };
}

export function startHref(state: StartState, locale: string): string {
  const params = new URLSearchParams({ locale });
  if (state.step !== "join") params.set("step", state.step);
  if (state.workspace) params.set("workspace", state.workspace);
  if (state.intent) params.set("intent", state.intent);
  if (state.next) params.set("next", state.next);
  return `/start?${params}`;
}

type SeatProduct = {
  base: { seats: number; supplyKrw: number };
  extraSeat: { supplyKrw: number };
  settlement: { vatBasisPoints: number };
};

/**
 * You plus everyone you invited is the seat count, and the base bundle is the
 * floor (Business: 3). VAT rounds half-up once on the supply total, the way
 * the server's quote engine does; the quote it returns is still the price.
 */
export function seatPlan(product: SeatProduct, invitees: number) {
  const seats = Math.max(product.base.seats, 1 + invitees);
  const extraSeats = seats - product.base.seats;
  const supplyKrw =
    product.base.supplyKrw + product.extraSeat.supplyKrw * extraSeats;
  const vatKrw = Math.round(
    (supplyKrw * product.settlement.vatBasisPoints) / 10000,
  );
  return { seats, extraSeats, supplyKrw, vatKrw, totalKrw: supplyKrw + vatKrw };
}

// One dot-separated domain with a real TLD — the shape the server's isEmail
// accepts; anything looser inflates the seat count and then fails to invite.
const EMAIL = /^[^\s@<>()"',;]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

/**
 * A pasted list: commas, semicolons, spaces or lines, including what mail
 * clients copy ("Kim <kim@co.kr>"). Words without an @ are display names and
 * are skipped; yourself, repeats and people already invited are dropped
 * quietly; malformed addresses come back so the screen can point at them.
 */
export function parseEmails(
  text: string,
  self: string,
  taken: readonly string[],
) {
  const skip = new Set([self, ...taken].map((value) => value.toLowerCase()));
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const value = raw
      .replace(/^[<("']+|[>)"'.]+$/g, "")
      .toLowerCase();
    if (!value.includes("@")) continue;
    if (!EMAIL.test(value)) invalid.push(raw.trim());
    else if (!skip.has(value)) {
      skip.add(value);
      emails.push(value);
    }
  }
  return { emails, invalid };
}
