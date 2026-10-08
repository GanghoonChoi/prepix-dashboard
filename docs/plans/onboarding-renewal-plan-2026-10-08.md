# 온보딩 리뉴얼 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 가입 직후 모든 사람이 대시보드 `/start` 하나로 개인 또는 Business(팀) 사용 상태까지 간다.

**Architecture:** 서버는 결제 전 팀의 초대를 `held`로 보관하고 활성화 순간 발송하며, 사용자 프로필에 온보딩 코드 3개를 더한다. 대시보드 `/start`는 URL 상태 기반 단계(use → profile → workspace → invite → pay → app)로 다시 짜고, 결제는 기존 팀 플랜 화면에 좌석 수를 넘겨 맡긴다. 사이트는 가격표에 Business 카드를 더하고 `intent`를 실어 가입으로 보낸다.

**Tech Stack:** NestJS + drizzle (Postgres), `node:test` + tsx · Next.js App Router + React, `tsx --test` 단위 테스트, Playwright e2e · Next.js 사이트

**Spec:** `docs/plans/onboarding-renewal-design-2026-10-08.md`

## Global Constraints

- Business = 1석 공급가 129,000원(부가세 별도), 최소 3석, 좌석당 AI 36000초(600분), 저장 3TB(3e12 바이트). 상품 버전 문자열 `business-2026-10-v1`.
- 대시보드에서 가격 숫자를 하드코딩하지 않는다 — `b2bService.commerce(id)`의 `product`에서 읽는다(사이트 가격표 문구만 예외).
- 온보딩 초대는 `kind: "internal"`, `teamRole: "editor"`, `assignSeat: true`만 발행한다.
- 프로필 코드 허용값 — `useType`: `personal|team` · `jobRole`: `editor|producer|marketer|lead|other` · `industry`: `youtube|ads|internal|broadcast|other` · `teamSize`: `3-5|6-20|21-100|100+` · `acquisitionSource`: `search|youtube|referral|social|other`.
- 대시보드 문구는 KO/EN 둘 다(`useI18n`의 `lang`으로 고르는 기존 `copy(en, ko)` 패턴 또는 `lib/i18n/strings/*.ts`).
- URL은 이동 의도만 담는다. 멤버십·팀 상태는 언제나 API에서 읽는다.
- 운영 env·배포는 이 계획 범위 밖(출시 단계는 사용자 확인 후 별도 진행).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. 준비 중 팀에서 관리자가 `held` 초대에 "재발송"을 누름 → 결제 전 메일이 나가면 안 된다(거절). → Task B1 테스트.
2. 7일 넘게 결제를 미루다 결제 → 예약 초대가 "만료"로 남으면 안 되고, 활성화 시점부터 7일이 새로 시작돼야 한다. → Task B1 테스트 + Task D2 라벨(`held`가 만료보다 먼저).
3. 팀원 이메일 붙여넣기에 본인 주소·중복·대소문자 차이·잘못된 주소가 섞임 → 본인/중복 제거, 잘못된 주소는 표시만 하고 나머지는 진행. → Task D1 테스트.
4. 새로고침·뒤로가기로 ④/⑤에 다시 옴 → 이미 예약한 명단을 서버에서 다시 읽어 좌석 수가 맞아야 하고, 같은 주소를 또 발행하지 않는다. → Task D3(예약 명단 재조회, 이미 있는 주소 건너뜀).
5. `useType`이 `team`인데 팀이 없음(③에서 "개인으로 계속") → 기본 진입은 개인 홈이어야 한다. → Task D2 `pickHome` 테스트.

---

## 저장소와 작업 위치

| 저장소 | 경로 | 브랜치 |
|---|---|---|
| 백엔드 | worktree `/Users/spagettimaker/My/Lasker/prepix-backend-onboarding` (`git -C ~/My/Lasker/prepix-backend worktree add ../prepix-backend-onboarding -b feat/onboarding-renewal main`, `backend/node_modules`는 원본으로 symlink) | `feat/onboarding-renewal` |
| 대시보드 | `/Users/spagettimaker/My/Lasker/prepix-dashboard` | `feat/onboarding-renewal` (이미 있음) |
| 사이트 | `/Users/spagettimaker/My/Lasker/prepix-site-deploy/apps/site` | `site/dashboard-prepix` (로컬 커밋만) |

백엔드 통합 테스트 DB: `b2b-verification-setup` 메모리대로 Homebrew `postgresql@16` 클러스터(DB 이름 `prepix_onboarding`, localhost). 명령 예: `WORKSPACES_TEST_DATABASE_URL=postgres://prepix_test@127.0.0.1:55470/prepix_onboarding node --import tsx --test src/b2b/invitations.integration.spec.ts`

---

### Task 1 (B1): 결제 전 초대 예약 (`held`)

**Files:**
- Modify: `backend/src/b2b/contracts.ts:148`
- Modify: `backend/src/database/schema/b2b.ts:281-283`
- Modify: `backend/src/b2b/invitations.service.ts` (`authorizeIssuer` ~L86-121, `issue` insert ~L222-240, `change` ~L571, 새 export)
- Modify: `backend/src/b2b/entitlement-application.service.ts` (~L295-305 팀 활성화 직후)
- Test: `backend/src/b2b/invitations.integration.spec.ts` (새 `t.test` 블록), `backend/src/b2b/entitlement-application.integration.spec.ts` (initial 적용 케이스에 단언 추가)

**Interfaces:**
- Produces: `deliveryState: "held" | "queued" | "sending" | "sent" | "failed"` (계약), `export async function releaseHeldInvitations(db: B2bDB, workspaceId: string, now: Date): Promise<number>` (`invitations.service.ts`), 에러 코드 `B2B_INVITATION_HELD`.

- [ ] **Step 1: 실패하는 테스트** — `invitations.integration.spec.ts` 끝(마지막 `t.test` 뒤, 같은 `test(...)` 콜백 안)에 추가:

```ts
await t.test("a preparing team holds team invitations until it is paid for", async () => {
  const prep = (await workspaces.create(owner.id, `held-${suffix}`, randomUUID())).workspace;
  const held = await invitations.issue(owner.id, prep.id, {
    requestKey: randomUUID(),
    email: other.email,
    kind: "internal",
    teamRole: "editor",
    assignSeat: true,
  });
  assert.equal(held.invitation.deliveryState, "held");
  // Project invitations and external people still need an active team.
  await assert.rejects(
    invitations.issue(owner.id, prep.id, {
      requestKey: randomUUID(),
      email: `ext-${suffix}@example.test`,
      kind: "external",
      teamRole: "editor",
      projectId: randomUUID(),
      projectRole: "producer",
    }),
  );
  // Resending a held invitation would mail it before payment.
  await assert.rejects(
    invitations.change(owner.id, prep.id, held.invitation.id, "resend", {
      requestKey: randomUUID(),
      revision: held.revision,
      reason: "nudge",
    }),
    /B2B_INVITATION_HELD/,
  );
  const before = attempts.length;
  await delivery.deliverDue?.();
  assert.equal(attempts.length, before, "held invitations are never mailed");
  // Payment arrives 10 days later: the invitation goes out with a fresh week.
  const later = new Date(Date.now() + 10 * 86400000);
  assert.equal(await releaseHeldInvitations(db, prep.id, later), 1);
  const [row] = await db
    .select()
    .from(schema.b2bInvitations)
    .where(eq(schema.b2bInvitations.id, held.invitation.id));
  assert.equal(row.deliveryState, "queued");
  assert.equal(row.expiresAt.getTime(), later.getTime() + 7 * 86400000);
  assert.equal(row.deliveryAfter.getTime(), later.getTime());
});
```

`releaseHeldInvitations`를 파일 상단 import(`import { B2bInvitationsService, releaseHeldInvitations } from "./invitations.service";`)로 가져온다. `invitations.change`·`delivery.deliverDue`는 실제 메서드 이름을 파일에서 확인해 맞춘다(`grep -n "async \w*(" src/b2b/invitations.service.ts src/b2b/invitation-delivery.service.ts`). 발송 워커 메서드가 시간 인자를 받으면 `now`를 넘긴다.

- [ ] **Step 2: 실패 확인** — `WORKSPACES_TEST_DATABASE_URL=… node --import tsx --test src/b2b/invitations.integration.spec.ts` → `releaseHeldInvitations` import 실패 또는 `B2B_TEAM_NOT_ACTIVE`류로 FAIL.

- [ ] **Step 3: 구현**

`contracts.ts:148`:
```ts
  deliveryState: "held" | "queued" | "sending" | "sent" | "failed";
```
`schema/b2b.ts`의 `deliveryState` `$type<...>`에 `"held"` 추가(컬럼은 varchar, DB 제약 없음 → 마이그레이션 없음).

`authorizeIssuer` 끝부분의 `assertTeamAction(...)`을 바꾼다:
```ts
    const state = (await this.core.team(db, workspaceId)).currentState;
    // A team that has not paid yet can line up its own people: the invitation
    // is held, and goes out the moment the first period is applied.
    const holds =
      action === "issue" &&
      state === "preparing" &&
      !scope.projectId &&
      scope.kind === "internal";
    if (!holds) assertTeamAction(state, action === "issue" ? "write" : "manage");
    return actor;
```
`issue`의 두 번째 콜백에서 insert 직전:
```ts
        const held =
          (await this.core.team(tx, workspaceId)).currentState === "preparing";
```
insert `.values({...})`에 `deliveryState: held ? "held" : "queued",` 추가.

`change`의 두 번째 콜백, `assertRevision` 다음 줄:
```ts
        if (action === "resend" && invitation.deliveryState === "held")
          throw new ConflictException("B2B_INVITATION_HELD");
```
파일 끝(클래스 밖)에 export:
```ts
/** Held invitations go out the moment a preparing team is paid for, with a
 * full week to accept counted from then — not from when they were typed. */
export async function releaseHeldInvitations(db: B2bDB, workspaceId: string, now: Date) {
  const released = await db
    .update(b2bInvitations)
    .set({
      deliveryState: "queued",
      deliveryAfter: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL),
      deliveryDeadline: new Date(now.getTime() + 86400000),
      revision: sql`${b2bInvitations.revision} + 1`,
    })
    .where(
      and(
        eq(b2bInvitations.workspaceId, workspaceId),
        eq(b2bInvitations.deliveryState, "held"),
        isNull(b2bInvitations.acceptedAt),
        isNull(b2bInvitations.revokedAt),
      ),
    )
    .returning({ id: b2bInvitations.id });
  return released.length;
}
```
`entitlement-application.service.ts` — `if (active) await tx.update(b2bTeams).set({ state: "active", ... })` 블록을 중괄호로 감싸고 바로 뒤에 `await releaseHeldInvitations(tx, workspaceId, now);` (같은 트랜잭션). import 추가. `tx` 타입이 `B2bDB`와 다르면 `releaseHeldInvitations`의 첫 인자 타입을 두 곳 모두 받는 drizzle 공통 타입으로 넓힌다(`Pick<B2bDB, "update">`).

- [ ] **Step 4: 활성화 연결 단언** — `entitlement-application.integration.spec.ts`에서 `target: "initial"` 주문을 적용해 팀이 `active`가 되는 케이스를 찾아, 적용 전에 `db.insert(schema.b2bInvitations)`로 `deliveryState: "held"` 행 하나(필수 컬럼은 같은 파일/초대 스펙의 insert를 참고)를 넣고 적용 후 `deliveryState === "queued"`를 단언한다.

- [ ] **Step 5: 통과 확인** — 두 스펙 실행, 그리고 회귀: `node --import tsx --test --test-concurrency=1 src/b2b/*.integration.spec.ts` (기존 legal-floor 3건 실패는 main에도 있는 알려진 실패).

- [ ] **Step 6: 커밋** — `git commit -m "feat(b2b): hold team invitations until the first period is paid"`

---

### Task 2 (B2): 사용자 온보딩 프로필 필드

**Files:**
- Create: `backend/src/database/migrations/0096_user_onboarding_profile.sql`
- Modify: `backend/src/database/migrations/meta/_journal.json` (idx 96 항목)
- Modify: `backend/src/database/schema/users.ts` (industry 다음)
- Modify: `backend/src/users/users.controller.ts` (DTO export + 필드), `backend/src/users/users.service.ts` (`updateProfile` 타입)
- Modify: `backend/src/auth/auth.service.ts` (`publicUser`에 `useType`)
- Test: `backend/src/users/profile-dto.spec.ts` (DB 없는 단위 테스트)

**Interfaces:**
- Produces: `PATCH /v2/users/profile` body `{ useType?, teamSize?, acquisitionSource?, jobRole?, industry? }`; `GET /v2/users/profile`와 로그인/세션 `user`에 `useType: "personal" | "team" | null`.

- [ ] **Step 1: 실패하는 테스트** `src/users/profile-dto.spec.ts`:
```ts
import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProfileDto } from "./users.controller";

const errors = async (body: object) =>
  (await validate(plainToInstance(UpdateProfileDto, body))).map((e) => e.property);

test("onboarding codes are accepted only from their lists", async () => {
  assert.deepEqual(
    await errors({ useType: "team", teamSize: "6-20", acquisitionSource: "referral", jobRole: "editor", industry: "ads" }),
    [],
  );
  assert.deepEqual(await errors({ useType: "company" }), ["useType"]);
  assert.deepEqual(await errors({ teamSize: "7" }), ["teamSize"]);
  assert.deepEqual(await errors({ acquisitionSource: "tv" }), ["acquisitionSource"]);
  // Older clients still send free text for these two.
  assert.deepEqual(await errors({ jobRole: "Senior colourist" }), []);
});
```
- [ ] **Step 2: 실패 확인** — `node --import tsx --test src/users/profile-dto.spec.ts` → `UpdateProfileDto` export 없음으로 FAIL.
- [ ] **Step 3: 구현**

마이그레이션:
```sql
-- 온보딩 리뉴얼 (2026-10-08): what /start asks, kept as short codes.
-- use_type is null until someone answers the first question; that null is
-- what makes the dashboard offer "시작 설정 마치기".
ALTER TABLE "users" ADD COLUMN "use_type" varchar(10);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "team_size" varchar(20);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "acquisition_source" varchar(40);
```
`_journal.json` entries 끝에 `{ "idx": 96, "version": "7", "when": 1791370017964, "tag": "0096_user_onboarding_profile", "breakpoints": true }`.

`schema/users.ts` (industry 다음):
```ts
    useType: varchar('use_type', { length: 10 }),
    teamSize: varchar('team_size', { length: 20 }),
    acquisitionSource: varchar('acquisition_source', { length: 40 }),
```
`users.controller.ts`: `IsIn` import 추가, `class UpdateProfileDto` → `export class UpdateProfileDto`, 필드 추가:
```ts
  @IsOptional() @IsIn(['personal', 'team']) useType?: string;
  @IsOptional() @IsIn(['3-5', '6-20', '21-100', '100+']) teamSize?: string;
  @IsOptional() @IsIn(['search', 'youtube', 'referral', 'social', 'other']) acquisitionSource?: string;
```
`users.service.ts` `updateProfile`의 data 타입에 `useType?: string; teamSize?: string; acquisitionSource?: string;`.
`auth.service.ts` `publicUser` 인자 타입에 `useType?: string | null;`, 반환에 `useType: user.useType ?? null,`. (호출부는 users 행 전체를 넘기므로 그대로 동작 — `npx tsc --noEmit`로 확인.)
- [ ] **Step 4: 통과 확인** — 단위 테스트 PASS, `npx tsc --noEmit -p tsconfig.json` 통과, 테스트 DB에 `npx drizzle-kit migrate`(또는 통합 스펙 하나 실행)로 마이그레이션 적용 확인.
- [ ] **Step 5: 커밋** — `feat(users): onboarding profile codes — use type, team size, how they found us`

---

### Task 3 (B3): 개인 워크스페이스 이름 변경은 관리 플래그와 무관

**Files:**
- Modify: `backend/src/workspaces/workspaces.service.ts:1161-1166` (`settings`)
- Test: `backend/src/workspaces/provisioning.integration.spec.ts` (새 `t.test`)

- [ ] **Step 1: 실패하는 테스트** — 기존 `'renaming a workspace never moves its url'` 뒤에:
```ts
await t.test('your own space can be renamed without the management rollout', async () => {
  const plain = new WorkspacesService(
    db,
    new ConfigService({ WORKSPACES_ENABLED: 'true', WORKSPACES_CREATOR_IDS: '*' }),
    email,
  );
  const user = await rawUser({ username: 'Solo' });
  await plain.list(user.id);
  const [mine] = await createdBy(user.id);
  const renamed = await plain.settings(user.id, mine.id, {
    name: '내 작업실',
    description: '',
    revision: mine.revision,
  });
  assert.equal(renamed.name, '내 작업실');
  const team = (await plain.create(user.id, 'Gated team')).workspace;
  await assert.rejects(
    plain.settings(user.id, team.id, { name: 'x', description: '', revision: team.revision }),
    /WORKSPACE_MANAGEMENT_DISABLED/,
  );
});
```
(`email`·`rawUser`·`createdBy`는 이 스펙에 이미 있는 헬퍼/변수 이름으로 맞춘다.)
- [ ] **Step 2: 실패 확인** — `WORKSPACE_MANAGEMENT_DISABLED`로 FAIL.
- [ ] **Step 3: 구현** — `settings` 첫 줄 `this.requireManagement(workspaceId);`를:
```ts
    const [kind] = await this.db
      .select({ type: workspaces.type })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    // Naming your own space is not team management; the management rollout
    // flag exists for what a team's members can do to each other.
    if (kind?.type === 'personal') this.requireEnabled();
    else this.requireManagement(workspaceId);
```
- [ ] **Step 4: 통과 확인** — `pnpm test:workspaces` (DB URL 지정) PASS.
- [ ] **Step 5: 커밋** — `feat(workspaces): renaming your own space does not wait for the management rollout`

---

### Task 4 (B4): Business 상품 기본값

**Files:**
- Modify: `backend/scripts/fixtures/b2b-launch-defaults.cjs` (product 블록 + 위 주석)
- Modify: `backend/src/b2b/launch-defaults.spec.ts:19-31`
- Modify: `prepix-dashboard/docs/plans/b2b-v1-launch-defaults-2026-10-07.md` 상품 표 (값 출처 문서)

- [ ] **Step 1: 테스트를 새 값으로** — 첫 테스트를 교체:
```ts
test("Business product: 3 seats minimum, 129,000원 supply per seat (VAT extra), 3TB, seat AI = the 'creator' tier", () => {
  const product = parseTeamProduct(JSON.stringify(launch.product));
  const quote = (extraSeats: number) => calculateTeamQuote(product, { extraSeats, aiPacks: 0, storagePacks: 0 });
  assert.equal(product.version, "business-2026-10-v1");
  assert.deepEqual(quote(0).amounts, { supplyKrw: 387000, vatKrw: 38700, totalKrw: 425700, currency: "KRW" });
  for (let n = 0; n <= 10; n++) assert.equal(quote(n).amounts.supplyKrw, 129000 * (3 + n), `n=${n}`);
  assert.equal(quote(0).allowances.seats, 3);
  assert.equal(quote(0).allowances.storageBytes, 3_000_000_000_000);
  const creator = /id: 'creator',[\s\S]*?inferenceSecondsPerMonth: (\d+)/.exec(readFileSync("./src/database/seed.ts", "utf8"));
  assert.equal(product.seatAiUnits, Number(creator![1]));
});
```
- [ ] **Step 2: 실패 확인** — `node --import tsx --test src/b2b/launch-defaults.spec.ts` FAIL.
- [ ] **Step 3: 구현** — fixture:
```js
// Business (user decision 2026-10-08): 129,000원 supply per seat, VAT extra,
// three seats minimum — the base bundle IS the minimum, so 3 seats = supply
// 387,000 + VAT 38,700 = 425,700원 and each extra seat adds 129,000 + 12,900.
// A seat carries the personal Creator tier's AI (600분); pooling usage across
// the team is a separate project.
const product = {
  version: 'business-2026-10-v1',
  name: 'Business',
  currency: 'KRW',
  base: { supplyKrw: 387000, seats: 3, storageBytes: 3 * TB, transferBytes: 3 * TB },
  extraSeat: { supplyKrw: 129000 },
  // = plan_definitions.id 'creator' inference_seconds_per_month (36000 = 600분).
  seatAiUnits: 36000,
  storagePack: { supplyKrw: 30000, bytes: TB, currentPricing: 'remaining_time' },
  settlement: { /* 그대로 */ },
  aiUnitLabel: '추론 초',
  aiUnitDescription: '좌석 하나가 한 기간에 쓰는 앱 AI 추론 시간(개인 Creator 등급과 같음).',
};
```
`grep -rn "launch-2026-10-07-v1" backend/scripts backend/src` 로 product 버전을 참조하는 다른 fixture/스펙이 있으면 같은 새 버전으로 맞춘다. 대시보드 문서 상품 표를 새 값으로 고친다.
- [ ] **Step 4: 통과 확인** — launch-defaults 스펙 PASS, `grep`으로 찾은 스펙 PASS.
- [ ] **Step 5: 커밋** — `feat(b2b): Business product defaults — 129,000원 per seat, 3 seats, 3TB, Creator AI`

---

### Task 5 (D1): 온보딩 URL 상태·좌석 계산·이메일 파싱 (`lib/onboarding.ts`)

**Files:**
- Modify: `lib/onboarding.ts` (전체 교체)
- Test: `lib/onboarding.spec.ts` (생성)

**Interfaces:**
- Produces:
  - `type StartStep = "join" | "use" | "profile" | "workspace" | "invite" | "pay" | "app" | "edit"`
  - `type StartState = { step: StartStep; workspace: string | null; intent: "personal" | "team" | null; next: "plan" | null }`
  - `readStartState(search: string): StartState`, `startHref(state: StartState, locale: string): string`
  - `seatPlan(product: { base: { seats: number; supplyKrw: number }; extraSeat: { supplyKrw: number }; settlement: { vatBasisPoints: number } }, invitees: number): { seats: number; extraSeats: number; supplyKrw: number; vatKrw: number; totalKrw: number }`
  - `parseEmails(text: string, self: string, taken: readonly string[]): { emails: string[]; invalid: string[] }`

- [ ] **Step 1: 실패하는 테스트** `lib/onboarding.spec.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEmails, readStartState, seatPlan, startHref } from "./onboarding";

const id = "0b6f7c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f";

test("reads intent, next and every step; unknown values fall back", () => {
  assert.deepEqual(readStartState(`?step=invite&workspace=${id}&intent=team`), {
    step: "invite", workspace: id, intent: "team", next: null,
  });
  assert.deepEqual(readStartState("?intent=personal&next=plan"), {
    step: "join", workspace: null, intent: "personal", next: "plan",
  });
  assert.deepEqual(readStartState("?step=nope&intent=company&next=x&workspace=../x"), {
    step: "join", workspace: null, intent: null, next: null,
  });
});

test("startHref round-trips and leaves defaults out", () => {
  const state = { step: "pay" as const, workspace: id, intent: "team" as const, next: null };
  assert.deepEqual(readStartState(new URL(startHref(state, "ko"), "http://x").search), state);
  assert.equal(startHref({ step: "join", workspace: null, intent: null, next: null }, "en"), "/start?locale=en");
});

const product = { base: { seats: 3, supplyKrw: 387000 }, extraSeat: { supplyKrw: 129000 }, settlement: { vatBasisPoints: 1000 } };

test("seats are you plus invitees, never below the base bundle", () => {
  assert.deepEqual(seatPlan(product, 0), { seats: 3, extraSeats: 0, supplyKrw: 387000, vatKrw: 38700, totalKrw: 425700 });
  assert.deepEqual(seatPlan(product, 2), { seats: 3, extraSeats: 0, supplyKrw: 387000, vatKrw: 38700, totalKrw: 425700 });
  assert.deepEqual(seatPlan(product, 4), { seats: 5, extraSeats: 2, supplyKrw: 645000, vatKrw: 64500, totalKrw: 709500 });
});

test("pasted addresses: split on commas, spaces and lines; drop yourself, repeats and people already invited", () => {
  assert.deepEqual(
    parseEmails("a@x.io, B@x.io\nme@x.io  a@x.io;nope c@x.io", "ME@x.io", ["c@x.io"]),
    { emails: ["a@x.io", "b@x.io"], invalid: ["nope"] },
  );
  assert.deepEqual(parseEmails("   ", "me@x.io", []), { emails: [], invalid: [] });
});
```
- [ ] **Step 2: 실패 확인** — `npx tsx --test lib/onboarding.spec.ts` FAIL.
- [ ] **Step 3: 구현** — `lib/onboarding.ts` 전체:
```ts
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
  | "join" | "use" | "profile" | "workspace" | "invite" | "pay" | "app" | "edit";
export type Intent = "personal" | "team";

const STEPS: StartStep[] = ["join", "use", "profile", "workspace", "invite", "pay", "app", "edit"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const supplyKrw = product.base.supplyKrw + product.extraSeat.supplyKrw * extraSeats;
  const vatKrw = Math.round((supplyKrw * product.settlement.vatBasisPoints) / 10000);
  return { seats, extraSeats, supplyKrw, vatKrw, totalKrw: supplyKrw + vatKrw };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A pasted list: commas, semicolons, spaces or lines. Yourself, repeats and
 * people already invited are dropped quietly; malformed entries come back so
 * the screen can point at them. */
export function parseEmails(text: string, self: string, taken: readonly string[]) {
  const skip = new Set([self, ...taken].map((value) => value.toLowerCase()));
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    if (!EMAIL.test(value)) invalid.push(raw.trim());
    else if (!skip.has(value)) {
      skip.add(value);
      emails.push(value);
    }
  }
  return { emails, invalid };
}
```
- [ ] **Step 4: 통과 확인** — `npx tsx --test lib/onboarding.spec.ts` PASS, `npx tsc --noEmit`(기존 `startHref({ step, workspace })` 호출부 컴파일 에러를 `intent: null, next: null` 추가로 고친다: `app/(auth)/signup/page.tsx`, `app/(dashboard)/dashboard/workspaces/[id]/page.tsx`).
- [ ] **Step 5: 커밋** — `feat(web): onboarding state, seat sums and address parsing in one tested module`

---

### Task 6 (D2): 계약 동기화, `held` 라벨, 프로필 타입, 기본 진입 공간

**Files:**
- Modify: `lib/api/generated/b2b.ts` (스크립트로 동기화)
- Modify: `components/b2b/invitations.tsx:389-396, ~486-492` (상태 라벨)
- Modify: `lib/api/services/user.service.ts` (`Profile` 타입)
- Create: `lib/home.ts`, Test: `lib/home.spec.ts`
- Modify: `app/(auth)/login/page.tsx` (~L58, L90, L213), `app/(auth)/session/page.tsx` (~L62-70)

**Interfaces:**
- Consumes: 서버 `user.useType` (Task B2)
- Produces: `pickHome(useType: string | null | undefined, rows: readonly { id: string; type?: string }[]): string`, `homeFor(useType): Promise<string>` (`lib/home.ts`)

- [ ] **Step 1: 계약 동기화** — `node scripts/sync-b2b-contract.mjs ../prepix-backend-onboarding/backend/src/b2b/contracts.ts` → `deliveryState`에 `"held"`가 생겼는지 `git diff lib/api/generated/b2b.ts`로 확인.
- [ ] **Step 2: 실패하는 테스트** `lib/home.spec.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickHome } from "./home";

const personal = { id: "p", type: "personal" };
const team = { id: "t", type: "team" };

test("team users land on their team; everyone else on the personal home", () => {
  assert.equal(pickHome("team", [personal, team]), "/dashboard/workspaces/t");
  assert.equal(pickHome("team", [personal]), "/dashboard");
  assert.equal(pickHome("personal", [personal, team]), "/dashboard");
  assert.equal(pickHome(null, [team]), "/dashboard");
});
```
- [ ] **Step 3: 실패 확인** — `npx tsx --test lib/home.spec.ts` FAIL.
- [ ] **Step 4: 구현** — `lib/home.ts`:
```ts
import { isPersonal } from "./workspaces/kind";
import { workspaceService } from "./api/services/workspace.service";

/** Someone who chose "with my team" and has one starts there; the personal
 * space is still a click away in the space switcher. */
export function pickHome(
  useType: string | null | undefined,
  rows: readonly { id: string; type?: string }[],
) {
  const team = useType === "team" ? rows.find((row) => !isPersonal(row)) : undefined;
  return team ? `/dashboard/workspaces/${team.id}` : "/dashboard";
}

/** A failed lookup is not a reason to strand someone: fall back to home. */
export async function homeFor(useType: string | null | undefined) {
  if (useType !== "team") return "/dashboard";
  try {
    return pickHome(useType, (await workspaceService.list()).workspaces);
  } catch {
    return "/dashboard";
  }
}
```
`login/page.tsx`: 로그인 성공 후 `go(safeReturnTo())`를 — 명시적 `returnTo`가 없을 때만 — `go(readReturnTo(await homeFor(loginData.user?.useType)))`로 바꾼다(세 곳 모두; 구글 경로는 `localStorage.userInfo`의 `useType`을 읽는다). `session/page.tsx`: `returnTo` 파라미터가 없거나 `/dashboard`면 `homeFor(session.user?.useType)`로 목적지를 정한다(`.then(async ({ data }) => …)`).

`user.service.ts` `Profile`에 `useType?: "personal" | "team" | null; jobRole?: string | null; industry?: string | null; teamSize?: string | null; acquisitionSource?: string | null;`.

`invitations.tsx` 상태 라벨 두 곳 모두 맨 앞에 `held`를 둔다(만료보다 먼저 — 예약 초대의 만료는 결제 시점에 새로 시작):
```ts
  const status = (row: Invitation) =>
    row.deliveryState === "held"
      ? c("결제 후 발송", "Sent after payment")
      : new Date(row.expiresAt).getTime() <= Date.now()
        ? c("초대 만료", "Expired")
        : …기존 그대로
```
`held` 행에서는 재전송 버튼을 숨긴다(서버도 거절).
- [ ] **Step 5: 통과 확인** — `npm test`(lib 전체) PASS, `npx tsc --noEmit`, `npx eslint lib components/b2b/invitations.tsx app/(auth)`.
- [ ] **Step 6: 커밋** — `feat(web): held invitations read "sent after payment"; team users start on their team`

---

### Task 7 (D3): `/start` 다시 짜기

**Files:**
- Create: `components/onboarding/steps.tsx` (UseStep, ProfileStep, NameStep, InviteStep, PayStep)
- Modify: `components/onboarding/start-experience.tsx` (단계 라우팅·헤딩·순서; 기존 `PersonalStep`·`WorkspaceStep`·`InviteStep` 제거, `JoinStep`과 app/edit 화면은 유지)

**Interfaces:**
- Consumes: `readStartState`, `startHref`, `seatPlan`, `parseEmails`, `StartState`, `Intent` (D1); `homeFor` (D2); `userService.getProfile/updateProfile`; `workspaceService.list/settings`; `useTeamCreation`, `useWorkspaceCapabilities`/`workspaceService.capabilities`; `b2bService.commerce/invitations/issueInvitation`.
- Produces: 컴포넌트 props
  - `UseStep({ onPick: (intent: Intent) => void })`
  - `ProfileStep({ onDone: () => void })`
  - `NameStep({ intent: Intent; personal: Row; onPersonal: () => void; onTeam: (workspaceId: string) => void })`
  - `InviteStep({ workspaceId: string; self: string; onNext: () => void })`
  - `PayStep({ workspaceId: string; onLater: () => void })`

- [ ] **Step 1: 단계 순서와 라우팅** — `start-experience.tsx`에서:
  - 프로필을 한 번 읽는다(`userService.getProfile()`; 실패해도 진행). `intent`가 URL에 있고 프로필 `useType`이 비었으면 `updateProfile({ useType: intent })`를 한 번 보낸다.
  - 실효 intent = `state.intent ?? profile.useType ?? null`.
  - 단계 보정: `join`인데 초대가 없으면 → intent가 있으면 `profile`, 없으면 `use`. `use`인데 intent가 이미 있으면 → `profile`.
  - 시퀀스(상단 단계 표시): `[...(pending ? ["join"] : []), ...(state.intent ? [] : ["use"]), "profile", "workspace", ...(intent === "team" ? ["invite", "pay"] : []), "app"]`.
  - 개인 경로 `workspace` 다음: `state.next === "plan"`이면 `window.location.assign("/dashboard/plan")`, 아니면 `app`.
  - 팀 경로: `workspace`에서 팀 생성 → `invite`(workspace=팀 id) → `pay` → [나중에 결제] `window.location.assign(\`/dashboard/workspaces/${id}\`)`.
  - `app` 화면의 "워크스페이스 관리" 링크 대신 `homeFor(intent)` 결과로 이동하는 "대시보드로" 링크.
  - 헤딩/소개 문구 추가 (KO/EN):
    - use: "Prepix를 어떻게 쓰실 건가요?" / "How will you use Prepix?" · "답에 따라 다음 단계만 달라집니다. 나중에 언제든 팀을 만들 수 있어요." / "Only the next steps change. You can make a team any time."
    - profile: "어떤 일을 하시나요?" / "Tell us a little about your work" · "더 맞는 안내를 위해서만 씁니다. 건너뛰어도 됩니다." / "Only used to tailor what we show you. Skip if you like."
    - workspace: 개인 "워크스페이스 이름을 정하세요" / "Name your workspace", 팀 "팀 워크스페이스를 만드세요" / "Create your team workspace"
    - invite: "함께할 팀원을 초대하세요" / "Invite your team" · "결제가 끝나는 순간 초대 메일이 발송됩니다." / "Invitations go out the moment payment completes."
    - pay: "좌석을 확인하고 결제하세요" / "Review seats and pay"
- [ ] **Step 2: `steps.tsx` — UseStep, ProfileStep**
```tsx
"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { inputClass, primaryClass, secondaryClass } from "@/components/workspaces/shared";
import { userService } from "@/lib/api/services/user.service";
import { workspaceService, type Capabilities, type WorkspaceList } from "@/lib/api/services/workspace.service";
import { b2bService } from "@/lib/api/services/b2b.service";
import type { Invitation, TeamCommerce } from "@/lib/api/generated/b2b";
import { useTeamCreation } from "@/components/workspaces/use-team-creation";
import { parseEmails, seatPlan, type Intent } from "@/lib/onboarding";

type Row = WorkspaceList["workspaces"][number];
const useCopy = () => {
  const { lang } = useI18n();
  return (en: string, ko: string) => (lang === "ko" ? ko : en);
};
const won = (value: number) => `₩${new Intl.NumberFormat("ko-KR").format(value)}`;

export function UseStep({ onPick }: { onPick: (intent: Intent) => void }) {
  const copy = useCopy();
  const [busy, setBusy] = useState(false);
  const pick = async (intent: Intent) => {
    setBusy(true);
    // The answer is a hint for later screens; failing to save it must not
    // stop anyone from going on.
    await userService.updateProfile({ useType: intent }).catch(() => undefined);
    onPick(intent);
  };
  const card = "rounded-lg border border-border p-6 text-left transition-colors hover:bg-surface disabled:opacity-50";
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button className={card} disabled={busy} onClick={() => void pick("personal")}>
        <p className="font-medium">{copy("Just me", "혼자 쓸게요")}</p>
        <p className="mt-1 text-sm text-muted">{copy("Edit on your own computer. Free to start.", "내 컴퓨터에서 편집합니다. 무료로 시작해요.")}</p>
      </button>
      <button className={card} disabled={busy} onClick={() => void pick("team")}>
        <p className="font-medium">{copy("With my team", "팀과 함께 쓸게요")}</p>
        <p className="mt-1 text-sm text-muted">{copy("A shared workspace, members and comments. Business plan.", "팀 워크스페이스, 멤버 관리, 코멘트. Business 플랜.")}</p>
      </button>
    </div>
  );
}

const PROFILE_GROUPS = [
  { field: "jobRole", label: ["Your role", "직무"], options: [["editor", "Editor", "편집자"], ["producer", "Producer / planner", "PD·기획"], ["marketer", "Marketer", "마케터"], ["lead", "Founder / lead", "대표·팀장"], ["other", "Other", "기타"]] },
  { field: "industry", label: ["What you make", "만드는 영상"], options: [["youtube", "YouTube / shorts", "유튜브·숏폼"], ["ads", "Ads / brand", "광고·브랜드"], ["internal", "Internal / training", "사내·교육"], ["broadcast", "Broadcast / agency", "방송·외주 제작"], ["other", "Other", "기타"]] },
  { field: "acquisitionSource", label: ["How you found us", "알게 된 경로"], options: [["search", "Search", "검색"], ["youtube", "YouTube", "유튜브"], ["referral", "A friend", "지인 추천"], ["social", "Social media", "SNS"], ["other", "Other", "기타"]] },
] as const;

export function Chips({ value, options, onChange }: {
  value: string | undefined;
  options: readonly (readonly [string, string, string])[];
  onChange: (value: string) => void;
}) {
  const copy = useCopy();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([code, en, ko]) => (
        <button
          key={code}
          type="button"
          aria-pressed={value === code}
          onClick={() => onChange(code)}
          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${value === code ? "border-foreground bg-foreground text-background" : "border-border hover:bg-surface"}`}
        >
          {copy(en, ko)}
        </button>
      ))}
    </div>
  );
}

export function ProfileStep({ onDone }: { onDone: () => void }) {
  const copy = useCopy();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    if (Object.keys(answers).length)
      await userService.updateProfile(answers).catch(() => undefined);
    onDone();
  };
  return (
    <section className="space-y-6 rounded-lg border border-border p-6">
      {PROFILE_GROUPS.map((group) => (
        <div key={group.field} className="space-y-2">
          <p className="text-sm font-medium">{copy(...group.label)}</p>
          <Chips
            value={answers[group.field]}
            options={group.options}
            onChange={(code) => setAnswers({ ...answers, [group.field]: code })}
          />
        </div>
      ))}
      <div className="flex flex-wrap gap-3">
        <button className={primaryClass} disabled={busy} onClick={() => void save()}>
          {copy("Continue", "계속하기")}
        </button>
        <button className={secondaryClass} disabled={busy} onClick={onDone}>
          {copy("Skip", "건너뛰기")}
        </button>
      </div>
    </section>
  );
}
```
- [ ] **Step 3: `steps.tsx` — NameStep** (개인 rename / 팀 생성 + 팀 규모)
```tsx
const TEAM_SIZES = [["3-5", "3–5", "3–5명"], ["6-20", "6–20", "6–20명"], ["21-100", "21–100", "21–100명"], ["100+", "100+", "100명 이상"]] as const;

export function NameStep({ intent, personal, onPersonal, onTeam }: {
  intent: Intent;
  personal: Row;
  onPersonal: () => void;
  onTeam: (workspaceId: string) => void;
}) {
  const copy = useCopy();
  const { lang } = useI18n();
  const team = intent === "team";
  const [name, setName] = useState(team ? "" : personal.name);
  const [size, setSize] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const creation = useTeamCreation(capabilities);
  useEffect(() => {
    if (team) void workspaceService.capabilities().then(setCapabilities).catch(() => setError(true));
  }, [team]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (team) {
      await creation.submit(next, async (workspace) => {
        if (size) await userService.updateProfile({ teamSize: size }).catch(() => undefined);
        onTeam(workspace.id);
      });
      return;
    }
    if (next === personal.name) return onPersonal();
    setBusy(true);
    setError(false);
    try {
      await workspaceService.settings(personal.id, {
        name: next,
        description: personal.description ?? "",
        revision: personal.revision ?? 0,
      });
      onPersonal();
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  const working = busy || creation.busy;
  return (
    <form className="space-y-5 rounded-lg border border-border p-6" onSubmit={submit}>
      <div className="space-y-2">
        <label htmlFor="start-name" className="block text-sm font-medium">
          {team ? copy("Company or team name", "회사 또는 팀 이름") : copy("Workspace name", "워크스페이스 이름")}
        </label>
        <input
          id="start-name"
          className={`${inputClass} max-w-sm`}
          value={name}
          maxLength={team ? 100 : 80}
          disabled={working}
          placeholder={team ? copy("e.g. Lasker Studio", "예: 라스커 스튜디오") : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <p className="text-xs text-muted">{copy("You can rename it later; the address stays.", "나중에 바꿀 수 있고, 주소는 그대로 유지됩니다.")}</p>
      </div>
      {team && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy("Team size", "팀 규모")}</p>
          <Chips value={size} options={TEAM_SIZES} onChange={setSize} />
          {(size === "21-100" || size === "100+") && (
            <p className="text-xs text-muted">
              {copy("Rolling out to a larger team? ", "큰 팀 도입이 필요하신가요? ")}
              <a className="underline" href={`https://www.prepix.ai${lang === "ko" ? "/ko" : ""}/contact`}>
                {copy("Talk to us", "도입 상담 문의")}
              </a>
            </p>
          )}
        </div>
      )}
      {(error || creation.error) && (
        <p role="alert" className="text-sm">
          {copy("That did not save. Your text is still here — try again.", "저장하지 못했습니다. 입력한 내용은 그대로 있습니다. 다시 시도하세요.")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className={primaryClass} disabled={working || !name.trim() || (team && !capabilities?.canCreate && !creation.pending)}>
          {team ? copy("Create team", "팀 만들기") : copy("Continue", "계속하기")}
        </button>
        {team && (
          <button type="button" className={secondaryClass} disabled={working} onClick={onPersonal}>
            {copy("Later — continue on my own", "나중에 — 개인으로 계속")}
          </button>
        )}
      </div>
    </form>
  );
}
```
(팀 생성 권한이 없으면 — 운영 `WORKSPACES_CREATOR_IDS` 전환 전 — `capabilities.canCreate`가 false: 버튼은 꺼지고 "개인으로 계속"만 남는다. 이 경우 `team.error.WORKSPACE_CREATION_UNAVAILABLE` 문구를 한 줄 보여 준다.)
- [ ] **Step 4: `steps.tsx` — InviteStep, PayStep**
```tsx
function useTeam(workspaceId: string) {
  const [commerce, setCommerce] = useState<TeamCommerce | null>(null);
  const [held, setHeld] = useState<Invitation[] | null>(null);
  const reload = useCallback(async () => {
    const [c, list] = await Promise.all([
      b2bService.commerce(workspaceId).catch(() => null),
      b2bService.invitations(workspaceId).catch(() => ({ invitations: [] as Invitation[] })),
    ]);
    setCommerce(c);
    setHeld(list.invitations.filter((row) => !row.acceptedAt && !row.revokedAt && !row.projectId));
  }, [workspaceId]);
  useEffect(() => {
    const first = setTimeout(() => void reload(), 0);
    return () => clearTimeout(first);
  }, [reload]);
  const product = commerce?.configured ? commerce.product : null;
  return { product, held, reload };
}

export function InviteStep({ workspaceId, self, onNext }: { workspaceId: string; self: string; onNext: () => void }) {
  const copy = useCopy();
  const { lang } = useI18n();
  const { product, held, reload } = useTeam(workspaceId);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const taken = (held ?? []).map((row) => row.email);
  const { emails, invalid } = parseEmails(text, self, taken);
  const plan = product ? seatPlan(product, taken.length + emails.length) : null;
  async function next() {
    setBusy(true);
    const failed: string[] = [];
    for (const email of emails) {
      try {
        await b2bService.issueInvitation(workspaceId, {
          requestKey: crypto.randomUUID(),
          email,
          kind: "internal",
          teamRole: "editor",
          assignSeat: true,
          lang: lang === "ko" ? "ko" : "en",
        });
      } catch {
        failed.push(email);
      }
    }
    await reload();
    setBusy(false);
    setProblems(failed);
    if (!failed.length) onNext();
    else setText(failed.join("\n"));
  }
  return (
    <section className="space-y-5 rounded-lg border border-border p-6">
      {held && held.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {held.map((row) => (
            <li key={row.id} className="flex justify-between py-2">
              <span className="break-all">{row.email}</span>
              <span className="text-muted">{copy("Sent after payment", "결제 후 발송")}</span>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor="start-invites" className="block text-sm font-medium">{copy("Teammates' emails", "팀원 이메일")}</label>
      <textarea
        id="start-invites"
        rows={4}
        className={inputClass}
        value={text}
        disabled={busy}
        placeholder={copy("Paste several, separated by commas or lines", "여러 개를 쉼표나 줄바꿈으로 구분해 붙여넣으세요")}
        onChange={(event) => setText(event.target.value)}
      />
      {invalid.length > 0 && (
        <p className="text-xs">{copy("Not an email: ", "이메일 형식이 아닙니다: ")}{invalid.join(", ")}</p>
      )}
      {problems.length > 0 && (
        <p role="alert" className="text-sm">{copy("These could not be invited. Check them and try again.", "이 주소는 초대하지 못했습니다. 확인 후 다시 시도하세요.")}</p>
      )}
      {plan && (
        <p className="text-sm tabular-nums">
          {copy(
            `You + ${taken.length + emails.length} → ${plan.seats} seats · ${won(plan.supplyKrw)}/month (VAT extra)`,
            `나 포함 ${1 + taken.length + emails.length}명 → ${plan.seats}석 · 월 ${won(plan.supplyKrw)} (부가세 별도)`,
          )}
          {product && plan.seats === product.base.seats && (
            <span className="text-muted">{copy(` · minimum ${product.base.seats} seats`, ` · 최소 ${product.base.seats}석`)}</span>
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button className={primaryClass} disabled={busy} onClick={() => void next()}>
          {copy("Next", "다음")}
        </button>
        <button className={secondaryClass} disabled={busy} onClick={onNext}>
          {copy("I'll invite later", "나중에 초대할게요")}
        </button>
      </div>
    </section>
  );
}

export function PayStep({ workspaceId, onLater }: { workspaceId: string; onLater: () => void }) {
  const copy = useCopy();
  const { product, held } = useTeam(workspaceId);
  if (!product || !held)
    return <p role="status" className="text-sm text-muted">{copy("Loading…", "불러오는 중…")}</p>;
  const plan = seatPlan(product, held.length);
  return (
    <section className="space-y-5 rounded-lg border border-border p-6">
      <dl className="divide-y divide-border border-y border-border text-sm tabular-nums">
        {[
          [copy("Plan", "플랜"), product.name],
          [copy("Seats", "좌석"), copy(`${plan.seats} seats`, `${plan.seats}석`)],
          [copy("Supply", "공급가"), won(plan.supplyKrw)],
          [copy("VAT", "부가세"), won(plan.vatKrw)],
          [copy("Monthly total", "월 결제액"), won(plan.totalKrw)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between py-2">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {held.length > 0 && (
        <p className="text-sm text-muted">
          {copy(`Invitations go to ${held.length} people when payment completes.`, `결제가 끝나면 ${held.length}명에게 초대가 발송됩니다.`)}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link className={primaryClass} href={`/dashboard/workspaces/${workspaceId}/plan?extraSeats=${plan.extraSeats}`}>
          {copy("Pay", "결제하기")}
        </Link>
        <button className={secondaryClass} onClick={onLater}>
          {copy("Pay later", "나중에 결제")}
        </button>
      </div>
    </section>
  );
}
```
(`Invitation`·`TeamCommerce` import 경로는 `lib/api/services/b2b.service.ts`가 재수출하는 이름이 있으면 그쪽을 쓴다.)
- [ ] **Step 5: 확인** — `npx tsc --noEmit`, `npx eslint components/onboarding lib/onboarding.ts`, 프리뷰 하네스(B2B 새 팀 모드)에서 개인·팀 두 경로를 브라우저로 끝까지 눌러 본다(뒤로가기·새로고침 포함, Review Focus 3·4).
- [ ] **Step 6: 커밋** — `feat(web): one /start for personal and Business — use, profile, name, invite, pay`

---

### Task 8 (D4): 결제 화면 좌석 초기값, 결제 후 다음 단계, 팀 홈 예약 배너

**Files:**
- Modify: `components/b2b/purchase-quotes.tsx:61-64` (초기 `extraSeats`)
- Modify: `components/b2b/billing-order.tsx` (결제 완료 상태에 링크)
- Modify: `components/b2b/home.tsx:172-198` (준비 중 문단)

- [ ] **Step 1: 좌석 초기값** — `PurchaseQuotes`의 `useState({ extraSeats: "0", … })`를:
```ts
  const [quantities, setQuantities] = useState(() => {
    // /start hands over the seat count it showed; the quote is still the price.
    const asked =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("extraSeats");
    return {
      extraSeats: asked && /^\d{1,4}$/.test(asked) ? asked : "0",
      storagePacks: "0",
    };
  });
```
- [ ] **Step 2: 결제 후 다음 단계** — `billing-order.tsx`에서 주문이 결제·적용 완료로 보이는 분기(`orderLabels`/state가 paid·applied인 곳)를 찾아, 그 안내 아래에:
```tsx
<Link className={secondaryClass} href={`/start?step=app&workspace=${workspaceId}`}>
  {c("다음: 앱 설치하고 첫 편집", "Next: install the app")}
</Link>
```
- [ ] **Step 3: 팀 홈 예약 배너** — `home.tsx`에서 `b2bService.invitations(workspace.id)`를 준비 중일 때만 읽어 `held` 수를 센다(`useEffect`, 실패 시 0). 준비 중 문단 문구를 `held > 0`이면:
```ts
c(`결제하면 ${held}명에게 초대가 발송됩니다.`, `Pay to send invitations to ${held} people.`)
```
로, 링크 텍스트는 `c("결제하기", "Pay")`로 바꾼다. `held === 0`이면 기존 문구 그대로.
- [ ] **Step 4: 확인** — `npx tsc --noEmit`, eslint, 하네스에서 ⑤ → 플랜 화면 추가 이용권 칸이 `S-3`으로 채워지는지, 로컬 가짜 PG(`B2B_TEST_BILLING`)로 결제 후 주문 화면에 링크가 보이는지, 초대 행이 `queued`가 되는지(`select delivery_state from b2b_invitations`).
- [ ] **Step 5: 커밋** — `feat(web): seats carry from /start to checkout; held invitations on the team home`

---

### Task 9 (D5): 플랜 페이지 Business 카드, 홈 "시작 설정 마치기"

**Files:**
- Modify: `app/(dashboard)/dashboard/plan/page.tsx` (~L544 `plans.map` 그리드 끝)
- Modify: `app/(dashboard)/dashboard/page.tsx` (상단)

- [ ] **Step 1: Business 카드** — `plans.map(...)` 다음, 같은 그리드 안에 마지막 카드:
```tsx
<div className={`${cardClass} flex flex-col gap-3 p-5`}>
  <div>
    <p className="font-medium">Business</p>
    <p className="text-sm text-muted">
      {lang === "ko" ? "1인당 월 ₩129,000 · 3인 이상 · 부가세 별도" : "₩129,000 per seat / month · 3+ seats · VAT extra"}
    </p>
  </div>
  <p className="text-sm text-muted">
    {lang === "ko" ? "팀 워크스페이스, 멤버 관리, 공동 편집과 코멘트, 3TB" : "Team workspace, members, co-editing and comments, 3TB"}
  </p>
  <Link className="mt-auto text-sm underline" href={`/start?intent=team&step=workspace&locale=${lang}`}>
    {lang === "ko" ? "팀으로 시작하기" : "Start with your team"}
  </Link>
</div>
```
(파일이 쓰는 카드 클래스·버튼 컴포넌트가 다르면 이웃 카드와 같은 것을 쓴다. 가격 숫자는 이 문구 한 곳 — 사이트 가격표와 같은 성격의 마케팅 문구다.)
- [ ] **Step 2: 홈 카드** — 대시보드 홈에서 이미 읽는 `profile`(localStorage `userInfo`) 대신 `userService.getProfile()` 결과의 `useType`이 `null`/`undefined`이면, `NEXT_PUBLIC_START_ONBOARDING === "1"`일 때만 헤더 아래에:
```tsx
<Link href={`/start?locale=${lang}`} className={`${cardClass} block p-4 text-sm`}>
  <span className="font-medium">{lang === "ko" ? "시작 설정 마치기" : "Finish setting up"}</span>
  <span className="ml-2 text-muted">{lang === "ko" ? "1분이면 끝나요" : "Takes a minute"}</span>
</Link>
```
- [ ] **Step 3: 확인** — tsc, eslint, 하네스에서 두 화면 확인.
- [ ] **Step 4: 커밋** — `feat(web): Business on the plan page; finish-setup card for accounts that never answered`

---

### Task 10 (D6): e2e 갱신

**Files:**
- Modify: `e2e/workspace-onboarding.spec.ts` (`"a new account lands in its own personal space…"` L443, `"first run offers a waiting invitation…"` L579 — 새 단계에 맞춤) + 새 테스트 2개

- [ ] **Step 1: 개인 경로 테스트** — 새 계정 → `/start` → "혼자 쓸게요" → 칩 하나 고르고 "계속하기" → 이름을 "내 작업실"로 바꾸고 "계속하기" → 앱 단계 헤딩 보임 → `GET /v2/users/profile`의 `useType === "personal"`, 워크스페이스 목록의 개인 이름이 "내 작업실".
- [ ] **Step 2: 팀 경로 테스트** (B2B 새 팀 모드 하네스: `B2B_TEST_ENABLED=true B2B_TEST_NEW_TEAMS=true B2B_TEST_LAUNCH_DEFAULTS=true`) — `/start?intent=team` → ①이 보이지 않음 → 건너뛰기 → 팀 이름 + "6–20명" → "팀 만들기" → 이메일 2개 붙여넣기(하나는 본인 주소) → 좌석 문구 "나 포함 2명 → 3석" → "다음" → 결제 요약 "3석" → "나중에 결제" → 팀 홈에 "결제하면 1명에게 초대가 발송됩니다" → 멤버 초대 탭 행 라벨 "결제 후 발송".
- [ ] **Step 3: 기존 두 테스트를 새 단계 이름/문구로 고친다.** 
- [ ] **Step 4: 실행** — `b2b-verification-setup` 메모리 절차대로(하네스 3308 + dev 3001 `NEXT_PUBLIC_START_ONBOARDING=1`, 라우트 워밍) `npx playwright test e2e/workspace-onboarding.spec.ts` PASS. 실패가 있으면 `git stash -u` 기준선과 비교.
- [ ] **Step 5: 커밋** — `test(e2e): personal and Business first-run paths`

---

### Task 11 (S1): 사이트 가격표 Business 카드와 `/start` 연결

**Files:**
- Modify: `apps/site/content/landing/schema.ts:584-592` (`paid.prev` 선택, `per?` 추가)
- Modify: `apps/site/design-system/components.tsx` (`PlanCard`: `prev` 있을 때만, `price.per ?? per`)
- Modify: `apps/site/design-system/styles.css` (`.ds-grid--5`, `.ds-grid--4`의 반응형 규칙과 같은 브레이크포인트)
- Modify: `apps/site/components/pricing-plans.tsx:72` (`ds-grid--${plans.length}` 혹은 5 고정)
- Modify: `apps/site/content/landing/ko.ts` (plans 배열, Premium 앞에 Business; Creator CTA returnTo), `en.ts` 동일
- Modify: 사이트 가입 폼의 기본 returnTo (`components/auth-form.tsx` / `lib/session-handoff.ts`에서 returnTo가 없을 때 쓰는 값)

- [ ] **Step 1: 스키마·카드** — `prev?: string; per?: string;`로 바꾸고 `PlanCard`에서 `{price.prev && (<p className="ds-plan__prev"><s>{price.prev}</s></p>)}`, 단위는 `{price.kind === 'paid' && price.per ? price.per : per}`.
- [ ] **Step 2: KO Business** (Creator 다음):
```ts
      {
        name: 'Business',
        desc: '더 많은 영상을 효율적으로 제작하고 싶은 사내 콘텐츠 제작팀과 에이전시',
        price: { kind: 'paid', monthly: '₩129,000', per: '/ 인 / 월' },
        quota: { amount: '600분', per: '/ 월', note: '1인당 월 분석 사용량 (업로드 원본 기준)' },
        features: [
          { text: 'Creator의 모든 기능 포함', on: true },
          { text: '3TB 클라우드 저장', on: true },
          { text: '팀 워크스페이스와 멤버 관리', on: true },
          { text: '공동 편집 및 코멘트 기능', on: true },
          { text: '추가 클라우드 구매 가능', on: true },
          { text: '3인 이상 · 부가세 별도', on: true },
        ],
        cta: { label: '팀으로 시작하기', href: auth.signup('ko', startPath('ko', 'team')) },
      },
```
`lib/site.ts`에 헬퍼(플래그가 꺼져 있으면 대시보드 플랜으로 폴백):
```ts
/** The dashboard's first-run, carrying what the visitor already told us. */
export const startPath = (locale: Locale, intent: 'personal' | 'team', next?: 'plan') =>
  process.env.NEXT_PUBLIC_START_ONBOARDING === '1'
    ? `/start?${new URLSearchParams({ intent, locale: locale === 'en' ? 'en' : 'ko', ...(next ? { next } : {}) })}`
    : dashboardPath.plan;
```
Creator CTA → `auth.signup('ko', startPath('ko', 'personal', 'plan'))`. 각주 `footnote`는 Business만 예외라 그대로 두되 Business 카드에 "부가세 별도"가 명시돼 있음을 확인. "팀원 간 사용량 공유"는 풀링 프로젝트 전까지 **넣지 않는다**(현재 좌석별 600분).
- [ ] **Step 3: EN Business** — 같은 구조, `price: { kind: 'paid', monthly: '₩129,000', per: '/ seat / mo' }`, desc "For in-house content teams and agencies making more video, faster", features "Everything in Creator", "3TB cloud storage", "Team workspace and member management", "Co-editing and comments", "Buy more cloud storage", "3+ seats · VAT extra · billed in KRW", CTA "Start with your team" → `auth.signup('en', startPath('en', 'team'))`; Creator CTA도 `startPath('en','personal','plan')`. (EN 가격 토글이 연간을 보여 줄 때 `annual`이 없으면 월간을 보여 주는지 `PlanCard`의 `amount` 계산으로 확인 — `annual ?? monthly`라 그대로 동작.)
- [ ] **Step 4: 가입 기본 목적지** — 사이트 가입 폼이 `returnTo` 없이 제출되면 `startPath(locale, …)` 대신 `/start?locale=…`(플래그 켜졌을 때)로 핸드오프하게 기본값을 바꾼다(로그인 폼은 그대로 `/dashboard`).
- [ ] **Step 5: 확인** — `cd apps/site && npx tsc --noEmit && npx next build`(또는 저장소의 lint/test 스크립트), 로컬 `next dev`로 `/ko#pricing`, `/#pricing` 5장 카드 레이아웃(모바일 폭 포함)과 CTA href 확인.
- [ ] **Step 6: 커밋** (`site/dashboard-prepix`, 푸시 없음) — `feat(site): Business on the pricing page; signups carry intent to /start`

---

## 마무리

- [ ] 백엔드: `npx tsc --noEmit`, `pnpm test`(단위), 통합 B2B·workspaces 스위트 실행. PR 생성(`Lasker01/prepix-backend`, base `main`).
- [ ] 대시보드: `npm test`, `npx tsc --noEmit`, `npx eslint`, e2e(D6) 후 마지막에 `npx next build`. PR 생성(base `main`).
- [ ] 사이트: 로컬 커밋만, 프리뷰 배포는 출시 단계에서.
- [ ] 전체 브랜치 리뷰 1회(가장 강한 모델) → 지적 반영.
- [ ] 출시 단계(스펙 "출시 순서")는 사용자 확인 후.
