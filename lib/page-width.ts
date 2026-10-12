/**
 * How wide a dashboard page reads (docs/design/2026-10-12-design-system.md §1).
 * One table here instead of a prop on every page: lists and grids get the room,
 * forms and single-column pages keep a reading measure, review takes it all.
 */
export type PageWidth = "wide" | "narrow" | "full";

const team = String.raw`^/dashboard/workspaces/[^/]+`;
const RULES: [RegExp, PageWidth][] = [
  [new RegExp(`${team}/projects/[^/]+/reviews/[^/]+`), "full"],
  [/^\/dashboard\/review-shares\//, "full"],
  [/^\/dashboard\/(settings|notifications)(\/|$)/, "narrow"],
  [/^\/dashboard\/(b2b-)?invitations\//, "narrow"],
  [/^\/dashboard\/workspaces\/new(\/|$)/, "narrow"],
  [new RegExp(`${team}/settings(/|$)`), "narrow"],
  [new RegExp(`${team}/(plan|statements)(/|$)`), "narrow"],
];

export function pageWidth(pathname: string): PageWidth {
  return RULES.find(([pattern]) => pattern.test(pathname))?.[1] ?? "wide";
}
