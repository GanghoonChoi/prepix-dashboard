import type { ReviewSummary } from "../api/generated/b2b";

/** A folder's published item (P, decision 2026-10-07): one review series a
 * teammate published from the app. The line under its title says who, which
 * version, when and how much talk — numbers, not adjectives. */
export function itemMeta(
  r: ReviewSummary,
  c: (ko: string, en: string) => string,
  when: (iso: string) => string,
) {
  return [
    r.publisher.name ?? c("이름 없음", "unnamed"),
    `v${r.ordinal}`,
    when(r.updatedAt),
    `${c("코멘트", "comments")} ${r.commentCount}`,
  ].join(" · ");
}
