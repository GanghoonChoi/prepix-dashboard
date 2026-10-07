# Dashboard redesign — phase 1 (2026-10-07)

Direction chosen: **A. 미니멀 모노** (Linear/Vercel family) — white canvas, near-black
accent, hairline borders, compact density. Light and dark, user-switchable.

## Why

- Navigation vanished when the team capability probe was off or loading — no way to
  reach settings or plan.
- Two overviews for the personal space; home / usage / plan repeated the same numbers.
- Two pages called "설정"; language set in two places; notifications under a
  workspace menu although they are account-wide.
- 297 hand-rolled buttons, 77 distinct card class strings, two loading styles, no type
  or icon scale, a single 896px column with no page header or location.

## Information architecture

```
[space switcher ▾]              personal space · teams · manage workspaces
작업   홈 · 아카이브 / 폴더 · 보관함 · 기존 아카이브
팀     멤버 · 편집 이용권 · 이용 상태                 (teams only)
관리   플랜 · 결제 · 월 이용명세서 · 설정
[account menu]                  계정 설정 · 언어 · 테마 · 약관 · 로그아웃
top bar                         location (space / page) · ⌘K · 알림
```

- Who sees which entry is unchanged: `workspaceLinks()` still decides (reviewers get no
  archive, personal spaces no team chrome, B2B entries by `allowedActions`).
  `workspaceSections()` only groups, renames and adds icons.
- The nav never disappears: without the team capability (or before it loads) the
  personal sections render from static routes.
- The personal row in the switcher opens `/dashboard`, the one personal home.
- 사용량 leaves the nav and becomes a tab of 플랜 · 결제 (`/dashboard/plan`,
  `/dashboard/usage`).
- Account settings move to the account menu; the sidebar's 설정 is the space's.
  For the personal space they are the same page.
- Notifications move to a bell in the top bar.

## Tokens

Neutral greys (no warm hue), one accent (#111 light / #fafafa dark). Muted ink #737373
(4.7:1 on white). Radii 6 control / 8 card. Base text 14px, secondary 13px, labels 12px.
Icons: lucide, 16px, stroke 1.75. Theme order: `?theme=` → saved choice → OS → dark.

## Components

`components/ui`: `PageHeader`, `PageTabs`, `Card`, `Stat`. The shared class strings in
`workspaces/shared.tsx` (`primaryClass`, `secondaryClass`, `inputClass`, `TeamShell`)
take the new style so team pages follow without being rewritten.

## Phase 2 (not in this change)

Team/B2B page internals onto the components; B2B billing (plan, statements, plan
settings, orders) as tabs of one page; storage naming (아카이브 / 보관함 / 폴더 / 자료).
