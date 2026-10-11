# Dashboard design system v2 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 2026-10-07 "minimal mono" direction into a component kit and rules, then move every dashboard page onto them.

**Architecture:** Own kit in `components/ui/` (Tailwind v4 classes on the existing tokens, no new deps). The widely-used shared helpers (`TeamShell` ×76, `Block` ×31, `Notice` ×18, `KeyValues` ×17, `ConfirmDialog` ×16, `EmptyState` ×13, `primaryClass` ×88, `secondaryClass` ×171) are re-implemented on top of the kit first. That restyles most screens in one move. Pages are then cleaned up group by group. Content width comes from one route→width function in the layout, not from each page.

**Tech Stack:** Next.js 16 (app router, all client pages), React 19, Tailwind v4, HeroUI v3 (overlay state, Skeleton only), lucide-react, Playwright e2e, `tsx --test` unit tests.

**Spec:** `docs/design/2026-10-12-design-system.md`

## Global Constraints

- No new dependencies.
- Do not change user-facing copy, ARIA roles, labels or `data-*` attributes. e2e selectors depend on them.
  - The exceptions are duration units and dates, which the spec changes. Update the affected specs in the same commit.
- Keep `@/components/ui` and `@/components/workspaces/shared` import paths working.
- Colours come only from tokens: `background`, `foreground`, `surface*`, `muted`, `border`, `accent`, `success|warning|danger` and the new `*-ink`. No raw Tailwind palette colours (`red-500`, `amber-…`) in components. Avatar tones are the one exception.
- No blue anywhere in product UI.
- Type scale (only these): page title `text-2xl font-semibold tracking-tight`, section/card title `text-base font-semibold`, body `text-sm`, secondary `text-[13px]`, meta `text-xs`, badge/kbd `text-[11px]`.
- Radius: controls/badges `rounded-md` (6), cards/menus/posters/dialogs `rounded-lg` (8).
- Control heights: md 36 (`h-9`, `min-h-11 sm:min-h-9` for touch), sm 32 (`h-8`), xs 28 (`h-7`).
- Primary disabled = `disabled:opacity-40`, never a grey fill.
- Shadows only on popovers, menus, dialogs, Sheet and the review composer.
- Widths: `wide` = `max-w-[1200px]`, `narrow` = `max-w-3xl` (768), `full` = no max.
- Work only in worktree `design/system-v2` (or a fresh per-phase branch from `origin/main`). Run `git branch --show-current` before every commit.
- Personal plan page and `coupon-dialog.tsx` are off-limits until `feat/pricing-2026-10` is on `origin/main`.

## Review Focus

1. **Dark theme.** Every new surface must be visible in dark: placeholder posters, badges, the selected state and the meter track. Check the `/kit` page in dark.
2. **390px viewport.** Toolbars wrap without horizontal page scroll, StatStrip goes to 2 columns, tables scroll inside their own box, and touch targets stay ≥44px.
3. **Long Korean strings and long names.** Team names, project names and emails truncate rather than push actions off-screen. Use `min-w-0` and `truncate` on title rows.
4. **Keyboard.** `Segmented` is a radiogroup with arrow keys. Menus close on Escape and return focus. `IconButton` always has an accessible name.
5. **Disabled vs loading.** A primary button that is disabled because a form is unchanged must still read as a button (`opacity-40`), and a busy button keeps `cursor-wait`.

---

## Execution

- **Phases 1–2 (kit, shell):** native, in this session. Every later task consumes these interfaces.
- **Phases 3–6:** one subagent per phase, each in its own worktree from `origin/main` after phases 1–2 merge. Each subagent gets the spec, this plan and its own task section. I review each diff and its screenshots before the PR merges.
- Every phase ends with: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, the phase's e2e specs against the harness, before/after screenshots, then a PR → CI → merge (merging deploys prod, see the dashboard-deploy memory).

## File structure

```
components/ui/index.ts          re-exports everything below (keeps "@/components/ui")
components/ui/button.tsx        buttonClass, Button, IconButton
components/ui/badge.tsx         Badge, Kbd
components/ui/card.tsx          Card, CardHeader, CardFooter, cardClass
components/ui/page.tsx          Page, PageHeader (alias), PageTabs, Toolbar
components/ui/controls.tsx      Segmented, SegmentTabs (alias), SearchField, SelectField, FilterSelect, Field, inputClass, textareaClass
components/ui/data.tsx          StatStrip, Stat (alias), Meter, MeterRow, PropertyList, SummaryRows, Timeline, table classes
components/ui/feedback.tsx      Notice, EmptyState
components/ui/settings.tsx      SettingsSection, SettingRow, DangerZone
components/ui/media.tsx         Poster, Avatar, AvatarStack, Tag (alias → Badge)
components/ui/overlay.tsx       useDismiss, menuClass, menuItemClass, Sheet
lib/format.ts (+ format.spec.ts) formatDate, formatDay, formatPeriod, formatTime, formatDuration, formatClock, formatMoney, ago
lib/page-width.ts (+ spec)      pageWidth(pathname): "wide" | "narrow" | "full"
app/kit/page.tsx                dev-only catalogue
```

`components/workspaces/shared.tsx` keeps its exports. The visual ones become thin wrappers over the kit:

| Export | Becomes |
|---|---|
| `inputClass` / `primaryClass` / `secondaryClass` | re-exports of the kit |
| `Block` | `SettingsSection` without a card |
| `EmptyState` / `Notice` / `KeyValues` / `BackLink` | the kit |

---

## Phase 1 — Foundation, kit, `/kit` (PR 1)

### Task 1.1: Status ink tokens

**Files:**
- Modify: `app/globals.css`

- [ ] Add `--success-ink`, `--warning-ink` and `--danger-ink` to the light and dark blocks.
  - Light: `#15803d`, `#a16207`, `#b91c1c`.
  - Dark: `#4ade80`, `#facc15`, `#f87171`.
- [ ] Expose them to Tailwind with `@theme inline { --color-success-ink: var(--success-ink); … }` so `text-success-ink` works.
- [ ] Verify: `pnpm exec tsc --noEmit` is unaffected; `/kit` shows them (Task 1.6).

### Task 1.2: `lib/format.ts`

**Files:**
- Create: `lib/format.ts`, `lib/format.spec.ts`

**Interfaces (produces):**
```ts
type Lang = "ko" | "en";
formatDate(iso: string | Date, lang: Lang): string        // "2026. 10. 12." | "Oct 12, 2026"
formatDay(iso: string | Date, lang: Lang): string         // "10월 12일" | "Oct 12"
formatPeriod(from: string | Date, to: string | Date, lang: Lang): string // "10월 12일 – 11월 11일" (year added when the years differ)
formatTime(iso: string | Date, lang: Lang): string        // "오전 9:30" | "9:30 AM" (never seconds)
formatDuration(seconds: number, lang: Lang): string       // ko "38분", "1시간 5분", "1시간"; en "38m", "1h 5m", "1h"; <60s → ko "1분 미만" / en "<1m"
formatClock(seconds: number): string                     // "0:06", "12:04", "1:02:03"
formatMoney(amount: number, lang: Lang): string           // ko "129,000원", en "₩129,000"
ago(iso: string | null | undefined, lang: string): string // moved from components/ui.tsx, same behaviour
```

- [ ] **Step 1: write `lib/format.spec.ts`** with `node:test` + `assert`. Cover:
  - `formatDuration(2280,"ko")==="38분"`, `formatDuration(3900,"ko")==="1시간 5분"`, `formatDuration(3600,"ko")==="1시간"`, `formatDuration(3900,"en")==="1h 5m"`, `formatDuration(20,"ko")==="1분 미만"`.
  - `formatClock(6)==="0:06"`, `formatClock(3723)==="1:02:03"`.
  - `formatMoney(129000,"ko")==="129,000원"`, `formatMoney(129000,"en")==="₩129,000"`.
  - `formatDate("2026-10-12T03:00:00Z","ko")` matches `/^2026\. 10\. 12\.$/`.
  - `formatTime` never contains `:` twice.
  - `formatPeriod` across a year boundary includes both years.
- [ ] **Step 2:** `pnpm test`. Expected: the format spec fails because the module is missing.
- [ ] **Step 3:** implement with `Intl.DateTimeFormat`, using `timeZone: "Asia/Seoul"` for ko so server and client agree. Export `ago` from here and re-export it from `components/ui`.
- [ ] **Step 4:** `pnpm test` passes.

### Task 1.3: `lib/page-width.ts`

**Files:**
- Create: `lib/page-width.ts`, `lib/page-width.spec.ts`

**Interfaces (produces):** `pageWidth(pathname: string): "wide" | "narrow" | "full"`.

Rules, first match wins:

| Width | Paths |
|---|---|
| `full` | `/reviews/[id]` under a project; `/dashboard/review-shares/…` |
| `narrow` | `/dashboard/settings`; `/dashboard/notifications`; `/dashboard/(b2b-)?invitations/…`; `/workspaces/[id]/settings`; `/workspaces/[id]/plan/settings`; `/workspaces/[id]/plan/orders/…`; `/workspaces/[id]/statements/[month]`; `/dashboard/workspaces/new` |
| `wide` | everything else |

- [ ] Write the spec first, with one assertion per rule plus `/dashboard` → wide.
- [ ] Implement as an ordered regex table.
- [ ] Run the tests.

### Task 1.4: Kit components

**Files:**
- Create: `components/ui/{index,button,badge,card,page,controls,data,feedback,settings,media,overlay}.tsx|ts`
- Delete: `components/ui.tsx` (its contents move; the import path stays the same through `index.ts`)

**Interfaces (produces):**
```ts
// button.tsx
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "md" | "sm" | "xs";
buttonClass(opts?: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean }): string
Button(props: ButtonHTMLAttributes & { variant?; size? })              // type="button" default
IconButton(props: ButtonHTMLAttributes & { label: string; variant?: "ghost"|"secondary"; size?: "md"|"sm" }) // aria-label + title = label
// badge.tsx
type Tone = "neutral" | "success" | "warning" | "danger";
Badge({ tone = "neutral", dot?: boolean, children, className? })      // h-5 rounded-md px-1.5 text-[11px] font-medium
Kbd({ children })                                                      // h-[18px] rounded bg-surface-tertiary px-1 font-mono text-[10px] text-muted
// card.tsx
cardClass = "rounded-lg border border-border bg-background"
Card({ className?, padded = true, children, as?: "section" | "div" })
CardHeader({ title, count?, description?, action?, divider?: boolean })  // h3 text-base font-semibold; count text-muted font-normal
CardFooter({ children, className? })                                     // border-t bg-surface px-5 py-3 flex items-center justify-between gap-3
// page.tsx
Page({ title?, description?, back?: { href; label }, badge?: ReactNode, meta?: ReactNode[], actions?, tabs?, children })
PageHeader = props => <Page …/> header only (kept for existing callers)
PageTabs({ tabs: { href; label; match?; count?: number }[] })            // unchanged behaviour, adds count
Toolbar({ title?, count?, children?, className? })   // list header: title text-sm font-semibold + muted count left, controls right; wraps on mobile
// controls.tsx
Segmented<T>({ options: { value: T; label: ReactNode; icon?: LucideIcon }[], value, onChange, label, size?: "sm" | "md", iconOnly?: boolean })
SegmentTabs = Segmented (alias, same props as today: tabs→options)
SearchField({ value, onChange, placeholder, label, className? })
SelectField<T>({ value, onChange, options: { value: T; label: string }[], label, hideLabel?: boolean, size?: "sm" | "md" })  // native select + chevron
FilterSelect (unchanged API, restyled)
Field({ label, help?, error?, htmlFor?, children, aside?: ReactNode })    // aside = right of the label (e.g. "비밀번호를 잊으셨나요?")
inputClass, textareaClass, selectClass
// data.tsx
StatStrip({ items: { label: string; value: ReactNode; unit?: string; foot?: ReactNode }[], className? })
Stat (kept; renders a single-cell StatStrip)
Meter({ value: number, tone?: "auto" | "neutral" })   // auto: ≥90 → warning fill
MeterRow({ label, value: ReactNode, percent: number, foot?: ReactNode })
PropertyList({ items: [ReactNode, ReactNode][], divided?: boolean })
SummaryRows({ rows: [ReactNode, ReactNode][], total?: [ReactNode, ReactNode] })
Timeline({ items: { title: ReactNode; time?: ReactNode; body?: ReactNode; tone?: Tone }[] })
tableClass, thClass, tdClass, rowClass, numClass ("text-right tabular-nums")
// feedback.tsx
Notice({ tone?: "neutral" | Tone, title?, children, action?, role? })
EmptyState({ icon?: LucideIcon, title, description?, action?, dashed?: boolean, className? })
// settings.tsx
SettingsSection({ title, description?, action?, footer?, children, id?, label?, flush?: boolean })  // flush = no card (Block)
SettingRow({ label, description?, children, htmlFor? })
DangerZone({ title?, children })   // border-danger/30 card, rows inside use SettingRow + Button variant="danger"
// media.tsx
Poster({ src?: string | null, alt?: string, duration?: number | null, badge?: ReactNode, children?: ReactNode, className? })  // 16:9 frame only; title/meta are the caller's
Avatar (unchanged API), AvatarStack({ people: { id; name }[], max = 4, size = 24 })
Tag({ children, tone?: "muted" | "danger" }) → Badge (alias kept)
// overlay.tsx
useDismiss, menuClass, menuItemClass, Sheet (moved unchanged; restyled tokens)
```

- [ ] Move `components/ui.tsx` into the folder and split it by the table above. `index.ts` does `export * from "./button"` and so on.
- [ ] Implement each component to the spec's section 2 table (sizes listed above).
- [ ] `Segmented`:
  - Renders `role="radiogroup"` with `role="radio"` children and `aria-checked`. Left/Right move the selection and focus.
  - **Exception:** when existing callers rely on `aria-pressed` (theme/language switchers, checked in e2e?), keep their markup. Grep `aria-pressed` in `e2e/` first and preserve what is asserted.
- [ ] `SegmentTabs` keeps `role="tablist"` / `role="tab"` / `aria-selected`, because existing callers and e2e use tabs. Restyle it to the segmented track look.
- [ ] Verify: `pnpm exec tsc --noEmit && pnpm lint`.

### Task 1.5: Re-point the shared helpers

**Files:**
- Modify: `components/workspaces/shared.tsx`, `components/b2b/shared.tsx` (`StateBadge`, `VisibilityBadge`, `AccessDenied`, `B2bError`), `components/dialog.tsx`, `components/workspaces/shared.tsx` `TeamError`/`TeamLoading`

- [ ] `inputClass` / `primaryClass` / `secondaryClass` → `export { inputClass } from "@/components/ui"`, `primaryClass = buttonClass()`, `secondaryClass = buttonClass({ variant: "secondary" })`. Keep the `min-h-11 sm:min-h-9` touch rule inside `buttonClass` md.
- [ ] `TeamShell` → `Page` (same props).
- [ ] `Block` → `SettingsSection flush`.
- [ ] `EmptyState`, `Notice`, `KeyValues`, `BackLink` → the kit.
  - `Notice` keeps its `role` prop.
  - `KeyValues` keeps its `items` prop and maps to `PropertyList`.
- [ ] `ConfirmDialog` panel: `rounded-lg border bg-background p-5 shadow-lg`.
- [ ] `StateBadge`/`VisibilityBadge` → `Badge`. State tone map:
  - `active` → success
  - `preparing` / `grace` / `read_only` → warning
  - `terminated` / `closed` → danger
  - else neutral
  - Visibility is always neutral.
- [ ] `AccessDenied` → `EmptyState` (icon Lock/SearchX), keeping `role="alert"` and `data-testid="access-denied"` on the wrapper.
- [ ] `B2bError` / `TeamError` → `Notice tone="danger"` with a retry `Button variant="secondary" size="sm"`, keeping `role="alert"`.
- [ ] `Dialog` title `text-base font-semibold`; panel `shadow-lg` stays.
- [ ] Verify: `tsc`, `lint`, then the full e2e suite on the harness (this is the change most likely to move selectors).

### Task 1.6: `/kit` catalogue

**Files:**
- Create: `app/kit/page.tsx` (client), guarded by `if (process.env.NODE_ENV === "production") notFound()`.

- [ ] One section per component, with every variant and size, rendered twice: inside `.light` and inside `.dark` wrappers side by side. The token blocks are class-scoped, so this works.
- [ ] Screenshot `/kit` at 1440 as the visual baseline.

### Task 1.7: PR 1

- [ ] `tsc`, `lint`, `test`, full e2e. Capture before/after for the screens touched indirectly: team home, members, project, plan and settings.
- [ ] Commit, push `design/system-v2-1-kit`, open the PR, wait for CI, merge, and verify prod loads.

---

## Phase 2 — Shell (PR 2)

### Task 2.1: Width from the route

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] Replace the `wide` boolean with `pageWidth(pathname)`. The `main` class becomes:

```ts
const widths = {
  full: "px-4 py-6 sm:px-6",
  wide: "mx-auto max-w-[1248px] px-4 py-6 sm:px-6 lg:py-8",
  narrow: "mx-auto max-w-[816px] px-4 py-6 sm:px-6 lg:py-8",
};
```

  The max-w values are content width + 2×24 gutter.

### Task 2.2: Sidebar, switcher, account menu, top bar

**Files:**
- Modify: `components/dashboard/sidebar.tsx`, `components/workspaces/workspace-switcher.tsx`, `components/dashboard/dashboard-header.tsx`, `components/theme-switcher.tsx`, `components/language-switcher.tsx`, `components/b2b/notifications.tsx` (`NotificationEntry` badge only)

- [ ] **Switcher row:**
  - 32px tile (`size-8 rounded-lg border bg-background`).
  - Name `text-[13px] font-semibold`.
  - Sub-line `text-[11px] text-muted`: `개인 공간` / team kind from the `team.kind.*` strings. No new copy.
  - Keep `aria-*` and `data-space`.
- [ ] **Sidebar:**
  - The nav already scrolls. The footer loses `border-t`.
  - Active item `bg-surface-tertiary` → `bg-surface-secondary font-medium`.
  - Inactive items `text-foreground/70`.
- [ ] **Account menu:**
  - Header block with name and email.
  - Groups split by dividers: 계정 설정 | 언어 + 테마 rows | terms | 로그아웃.
  - Language and theme switchers become the `Segmented` look while keeping their `aria-pressed` buttons (check e2e).
- [ ] **Header:**
  - Search button: `bg-surface-secondary` fill, no border, `Kbd`.
  - Height stays 48.
  - Notification count badge: `min-w-4 h-4 rounded-full bg-foreground text-background text-[10px] font-semibold`.
- [ ] Verify: screenshots of the shell (personal home, team home), light and dark at 390 and 1440; the e2e suite.

### Task 2.3: PR 2

- [ ] Same gate as 1.7.

---

## Phase 3 — Personal (PR 3; plan page as PR 3b once pricing has merged)

Files and what each gets (spec §4 "개인"):

- [ ] **`app/(dashboard)/dashboard/page.tsx`**
  - `StatStrip` for the three stats, keeping the meter inside the first cell.
  - Action cards use `Card` + `CardHeader` styling.
  - Recent uploads use `Poster` or `EmptyState`.
  - Durations go through `formatDuration`.
- [ ] **`app/(dashboard)/dashboard/usage/page.tsx`:** `MeterRow` list, `formatDuration`.
- [ ] **`app/(dashboard)/dashboard/settings/page.tsx`**
  - `SettingsSection` cards with `SettingRow`s; language and theme rows use the existing switchers.
  - Account deletion goes in `DangerZone`.
  - Fix the "미설정" name: render `profile.username` when it is present.
- [ ] **`app/(dashboard)/dashboard/notifications/page.tsx` + `components/b2b/notifications.tsx` (list)**
  - `Segmented` filter; rows per the spec (unread fill + dot).
  - `EmptyState`; the native select becomes `SelectField`.
- [ ] **`app/(dashboard)/dashboard/workspaces/[id]/media/page.tsx` + `components/workspaces/archive/*`**
  - `Toolbar`, storage `MeterRow`, `Poster` grid, `Table` list.
  - `EmptyState dashed` for the drop zone.
  - One `SearchField`; `Segmented` view switch.
- [ ] **`app/(dashboard)/dashboard/workspaces/page.tsx`:** table with the space tile, a kind `Badge` and the row menu.
- [ ] **PR 3b (after pricing merges): `app/(dashboard)/dashboard/plan/page.tsx`, `components/dashboard/coupon-dialog.tsx`, `refund-request-card.tsx`**
  - Summary strip, selectable plan cards, coupon `SettingRow`, refund `SettingsSection`.
- [ ] e2e to run: `onboarding-first-run`, `workspace-kinds`, `archive-preview`, `upload-queue`, `verify-email`, `b2b-notifications`.

## Phase 4 — Team (PR 4)

- [ ] **`components/b2b/home.tsx`**
  - `Page` header with `AvatarStack` + 초대 `Button variant="secondary"`.
  - 확인할 영상 uses `Poster` + a `Badge` (tone by reason: approval → warning; version / comment → neutral).
  - Project grid uses `Poster` (lock and unread dot overlays).
  - Seat line uses `PropertyList` inside `Details`.
- [ ] **`components/b2b/projects.tsx`:** `Toolbar` + `Table` (64×36 `Poster` thumb). The empty state text stays the existing copy.
- [ ] **`components/b2b/project.tsx` + project tab pages**
  - `Page` with the project name as the fixed title on every tab, a visibility `Badge`, a ` · ` meta line, and `PageTabs` with counts when known.
  - The tab pages stop passing their own titles (`files` / `people` / `reviews`).
  - Check e2e headings first: if a spec asserts "프로젝트 자료" as a heading, keep that text as the tab's section title (`CardHeader`) instead.
- [ ] **`components/b2b/reviews.tsx` (list part only):** rows with thumb, title, status `Badge`, version, comment count and updated time.
- [ ] **`components/b2b/files.tsx`, `file-transfers.tsx`:** file `Table` with type tile, size via `numClass`, and a download `IconButton`. The upload area is `EmptyState dashed`.
- [ ] **`components/b2b/members.tsx`, `invitations.tsx`, `components/workspaces/members-*.tsx`**
  - `Toolbar`, `Table`, role `SelectField size="sm"`, invite rows with a `Badge`.
  - 좌석 대기 is a warning `Badge` + `Notice`.
- [ ] **`components/b2b/billing-*.tsx`, `statements.tsx`, `add-seats.tsx`, `ownership.tsx`**
  - Summary `StatStrip`, orders `Table` with `Badge`, `SummaryRows` for add-seats and statement totals, `PropertyList` for business info.
  - Termination goes in `DangerZone`.
  - Dates and money via `lib/format`; no seconds.
- [ ] **`app/(dashboard)/dashboard/workspaces/[id]/settings/page.tsx`**
  - The title uses the nav's 설정 string (`nav` strings).
  - `SettingsSection` with a save `CardFooter`; ownership and leave/delete go in `DangerZone`.
- [ ] **`components/b2b/accept-invitation.tsx`, `app/(dashboard)/dashboard/invitations/[token]/page.tsx`:** a single `Card`.
- [ ] e2e to run: every `b2b-*` spec the harness supports (see the b2b-verification-setup memory for flags), plus `workspace-onboarding`.

## Phase 5 — Review detail (PR 5)

- [ ] **`components/b2b/review-detail.tsx`.** Visual only, no logic moves.
  - **Header:** `Page` (back, title, status `Badge`, ` · ` meta, actions).
  - **Side panel:**
    - Approval card with buttons from the kit.
    - Comments `CardHeader` with `Segmented` (전체 / 남은 것).
    - Comment rows: `Avatar` 24.
    - Timecode chip → `Badge tone="neutral"` with `font-mono`.
    - Resolve uses `IconButton`.
  - **Composer:** card + `shadow-sm`, `Kbd` hint, send `Button` (disabled = opacity).
  - **Player markers:** `bg-white` / `bg-white/40` instead of amber/orange.
  - **Shortcut paragraph:** one line of `Kbd`s, with the playback-URL policy moved into `Details`.
- [ ] **`app/(dashboard)/dashboard/review-shares/[shareId]/page.tsx`:** same pieces.
- [ ] e2e to run: `b2b-reviews`, `b2b-review-exact-target`, `b2b-audience`, `b2b-viewer`.

## Phase 6 — Auth, onboarding, errors (PR 6) and cleanup (PR 7)

- [ ] **`app/(auth)/*/page.tsx` + `app/(auth)/layout.tsx`**
  - Keep the brand panel.
  - Buttons become `buttonClass()` (square), inputs become `Field` + `inputClass`, and the forgot link sits in `Field aside`.
- [ ] **`components/onboarding/*`**
  - Choice cards: border, with the selected one using `border-foreground ring-1 ring-foreground`.
  - Checkout uses `SummaryRows`; drop the card shadow.
- [ ] **`app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`**
  - Code `text-7xl font-bold`, title, description, then [뒤로] secondary + [홈으로 / 다시 시도] primary.
  - `global-error` stays inline bilingual with inline styles (no provider).
- [ ] **PR 7 cleanup**
  - Delete the aliases nobody imports any more: `primaryClass`, `secondaryClass`, `Tag`, `SegmentTabs`, `PageHeader` if unused.
  - `grep -rn "<button" components app | wc -l` should drop to the buttons that legitimately need custom markup (tiles, player controls).
  - Update `docs/design/2026-10-12-design-system.md` with a "status" line.
- [ ] e2e to run: `verify-email`, `onboarding-first-run`, `workspace-onboarding`, `b2b-team-creation`.
