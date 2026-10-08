# 온보딩 리뉴얼 설계 (2026-10-08)

가입한 사람이 개인 또는 Business(팀)로 **실제로 쓰는 상태**까지 가게 한다. 단순하게, 필요한 정보만, 페르소나별로.

## 승인된 결정

| # | 결정 |
|---|---|
| 1 | 온보딩은 대시보드 `/start` 하나. 가입 폼(사이트 `/signup`, 대시보드 `/signup`)은 그대로 짧게 두고, 가입 직후 모두 `/start`로 온다 |
| 2 | 기업 경로는 **초대 먼저, 결제 마지막**. 결제 전 초대는 `held`로 보관하고 팀이 활성화되는 순간 발송 |
| 3 | 받는 정보: 직무, 만드는 영상 종류, 팀 규모(팀만), 알게 된 경로. 전부 선택(건너뛰기 가능) |
| 4 | Business = 1석 공급가 129,000원(**부가세 별도**), 최소 3석, 좌석당 600분, 3TB |
| 5 | 워크스페이스 이름 단계는 개인/팀 공통 화면 |
| 6 | 팀을 만든 사람도 개인 워크스페이스는 유지하고, **팀이 기본 진입 공간** |
| 7 | 팀원 간 사용량 공유(풀링)는 **범위 밖** — 별도 프로젝트. 그때까지 좌석당 600분 |

리서치 근거: Notion·Figma·ClickUp·Frame.io·Canva·Miro 모두 그릇(워크스페이스)은 하나이고, 개인/업무 질문은 한 번의 클릭으로 기본값과 이어지는 단계만 바꾼다. 이름은 좋은 기본값을 채우고 바로 수정하게 하며, 팀 구성은 이름 → 초대(건너뛰기) → 플랜(건너뛰기) 순서.

## 흐름

```
진입
 ├ 사이트 시작하기 / Free / 가입 폼 직접   → 가입 → /start
 ├ 사이트 Business "팀으로 시작하기"       → 가입 → /start?intent=team          (① 생략)
 ├ 사이트 Creator                          → 가입 → /start?intent=personal&next=plan
 ├ 대시보드 /dashboard/plan 의 Business 카드 → /start?intent=team&step=workspace
 ├ 초대 링크로 가입                         → 초대 수락 (온보딩 없음, 지금과 같음)
 └ 기존 사용자                              → 강제 없음. 홈에 "시작 설정 마치기" 카드 (use_type 이 비었을 때만)

/start
 ⓪ join      받은 초대가 있을 때만 (기존)                         [참여] [나중에]
 ① use       "Prepix를 어떻게 쓰실 건가요?"  [혼자 쓸게요] [팀과 함께 쓸게요]   필수, 클릭 한 번
 ② profile   칩 3줄: 직무 · 영상 종류 · 알게 된 경로              [건너뛰기]
 ③ workspace 워크스페이스 이름 (공통 화면)
             개인: 개인 워크스페이스 이름이 채워져 있음 → 바꾸면 rename
             팀:   빈칸 + "회사 또는 팀 이름", 아래 팀 규모 칩 → 팀 생성(준비 중)
                   [팀 만들기]  [나중에 — 개인으로 계속]
                   팀 규모 21명 이상이면 "도입 상담 문의" 링크 (셀프 결제는 그대로)
 ├ 개인 → app → edit                (next=plan 이면 ③ 다음에 /dashboard/plan)
 └ 팀  → ④ invite  팀원 이메일 (붙여넣기, 쉼표·공백·줄바꿈 구분), 역할은 편집자 고정
                   "나 포함 N명 → S석 · 공급가 월 ₩(합계) (부가세 별도)"
                   [다음]  [나중에 초대할게요]
         ⑤ pay     좌석 S석 요약 (공급가 / 부가세 / 결제액)
                   [결제하기] → /dashboard/workspaces/<id>/plan?extraSeats=<S-기본석>
                   [나중에 결제] → 팀 홈 (준비 중 배너 + 예약 명단)
         ⑥ app → edit
```

**스킵 원칙**: 갈림길인 ①만 필수. 나머지는 모두 건너뛸 수 있고 건너뛰어도 다음으로 이어진다.

**좌석 계산** (순수 함수, `lib/onboarding.ts`): `S = max(기본석, 1 + 예약 초대 수)`, `추가석 = S − 기본석`, `공급가 = base.supplyKrw + extraSeat.supplyKrw × 추가석`. 숫자는 하드코딩하지 않고 `b2bService.commerce()` 카탈로그에서 읽는다.

## 화면별 상세 (대시보드)

- **URL 상태** (`lib/onboarding.ts`): 단계 `join | use | profile | workspace | invite | pay | app | edit`, 파라미터 `intent=personal|team`, `next=plan`, `workspace=<uuid>`. URL은 이동 의도만 담고 멤버십은 언제나 API에서 읽는다(기존 원칙 유지).
- **① use**: 고르면 `PATCH /v2/users/profile {useType}`. `intent`가 있으면 그 값을 저장하고 ①을 건너뛴다.
- **② profile**: 칩 선택값을 코드로 저장(`PATCH /v2/users/profile`). 팀 규모는 ③ 팀 화면에서 받는다.

  | 필드 | 코드 (표시: 한국어) |
  |---|---|
  | `jobRole` | `editor` 편집자 · `producer` PD·기획 · `marketer` 마케터 · `lead` 대표·팀장 · `other` 기타 |
  | `industry` | `youtube` 유튜브·숏폼 · `ads` 광고·브랜드 · `internal` 사내·교육 · `broadcast` 방송·외주 제작 · `other` 기타 |
  | `acquisitionSource` | `search` 검색 · `youtube` 유튜브 · `referral` 지인 추천 · `social` SNS · `other` 기타 |
  | `teamSize` | `3-5` · `6-20` · `21-100` · `100+` |

- **③ workspace**: 개인은 기존 `workspaceService.settings`(revision 포함)로 rename. 팀은 기존 `useTeamCreation`(requestKey)으로 생성 후 `teamSize` 저장. "개인으로 계속"은 `use_type`을 바꾸지 않는다(팀 의도였다는 신호를 남김).
- **④ invite**: 각 이메일을 B2B 초대(`kind: internal`, `teamRole: editor`, `assignSeat: true`)로 발행 → 준비 중 팀이라 `held`. 이미 예약된 명단을 다시 불러와 보여 준다(새로고침해도 안전). 본인 이메일·중복은 클라이언트에서 거른다.
- **⑤ pay**: 결제는 기존 팀 플랜 화면이 한다(사업자 정보 → 견적 → 토스). `PurchaseQuotes`가 `?extraSeats=`를 초기값으로 읽게 한다. 결제 후 돌아오는 기존 주문 화면에 결제 완료 시 "다음: 앱 설치" 링크(`/start?step=app&workspace=<id>`)를 추가.
- **팀 홈(준비 중)**: 예약 초대가 있으면 "결제하면 N명에게 초대가 발송돼요" + [결제하기].
- **멤버 화면**: `held` 초대는 "결제 후 발송"으로 표시.
- **기본 진입 공간**: `homeFor(user)` — `useType === 'team'`이고 팀이 있으면 `/dashboard/workspaces/<첫 팀>`, 아니면 `/dashboard`. 로그인·`/session` 핸드오프의 기본 목적지와 온보딩 끝에서 쓴다. 명시적 `returnTo`가 있으면 그게 우선.
- **`/dashboard/plan`**: Business 카드 추가 → `/start?intent=team&step=workspace`.
- **홈**: `useType`이 비어 있으면 "시작 설정 마치기" 카드 → `/start`.
- 문구는 `lib/i18n/strings/*.ts`(KO/EN).

## 서버 (prepix-backend)

**A. Business 상품** — 코드 변경 없음, `B2B_PRODUCT_JSON` 새 버전 `business-2026-10-v1`:
`base {supplyKrw 387000, seats 3, storageBytes 3e12, transferBytes 3e12}`, `extraSeat.supplyKrw 129000`, `seatAiUnits 36000`, `storagePack` 그대로(1TB 30,000). 출처인 `scripts/fixtures/b2b-launch-defaults.cjs`와 `src/b2b/launch-defaults.spec.ts` 단언을 같은 값으로 고친다. 기존 팀은 상품 버전 보존 + 기존 31일 재동의 절차를 그대로 탄다.

**B. 결제 전 초대 예약**
- `b2b_invitations.delivery_state`에 `held` 추가 (varchar, DB 제약 없음 → 마이그레이션 불필요, TS 타입만).
- `authorizeIssuer`: 팀이 `preparing`이고 `projectId` 없고 `kind: internal`이면 발행 허용 → `deliveryState: 'held'`. 그 외는 지금과 같다.
- 발송 워커는 `queued/failed/sending`만 집으므로 `held`는 발송되지 않는다(변경 없음).
- `preparing → active` 전환(`entitlement-application.service.ts`) 같은 트랜잭션에서 `held → queued`, `deliveryAfter = now`, `expiresAt = now + INVITE_TTL`, `deliveryDeadline = now + 1일`.
- 수락은 지금처럼 활성 팀만. 취소(`manage`)는 준비 중에도 가능.
- 초대 목록 응답에 `deliveryState` 포함.

**C. 사용자 정보** — 마이그레이션 `users`에 `use_type varchar(10)`, `team_size varchar(20)`, `acquisition_source varchar(40)`. `PATCH /v2/users/profile`이 `useType`, `teamSize`, `acquisitionSource`를 받는다(`IsIn` 허용값). `jobRole`/`industry`는 기존 컬럼에 코드를 저장. 프로필 조회와 로그인 응답 사용자 객체에 `useType` 포함.

**D. 개인 워크스페이스 rename** — `settings()`에서 개인 워크스페이스는 `requireManagement` 대신 `requireEnabled`만 확인. 운영 `WORKSPACE_MANAGEMENT_IDS`는 그대로(전체를 켜지 않는다).

## 홈페이지 (prepix-site-deploy/apps/site)

- 가격표에 Business 카드(KO/EN, ZH는 그대로): "₩129,000 / 인 / 월 (부가세 별도)", "3인 이상", 600분, 3TB, 팀 워크스페이스와 멤버 관리, 공동 편집·코멘트, 추가 클라우드. CTA "팀으로 시작하기" → `auth.signup(locale, '/start?intent=team&locale=…')`. EN도 KRW로 표기(팀 결제는 토스 KRW 전용).
- Creator CTA의 returnTo → `/start?intent=personal&next=plan&locale=…`.
- `returnTo` 없이 가입하면 `/start`로 핸드오프(같은 플래그 뒤).

## 출시 순서 (운영 반영은 단계마다 사용자 확인)

1. 백엔드 PR 머지·배포 — B·C·D. 플래그 변화 없음, 기존 동작 그대로.
2. 대시보드 PR 머지·배포 — `/start`는 플래그가 꺼져 있어 아직 노출 안 됨.
3. Railway `api`: `B2B_PRODUCT_JSON` → `business-2026-10-v1`, `WORKSPACES_CREATOR_IDS=*` (사람당 팀 3개 제한 유지).
4. Vercel `prepix-dashboard`: `NEXT_PUBLIC_START_ONBOARDING=1` → 재배포.
5. 사이트: Business 카드 + `NEXT_PUBLIC_START_ONBOARDING=1` → `vercel deploy` 프리뷰 확인 → `--prod`.

## 검증

- 백엔드 통합 테스트: 준비 중 초대 → `held`·메일 없음 / 활성화 → `queued`·만료 갱신 / 활성화 전 수락 거절 / 프로필 새 필드 저장·거절 / 개인 rename이 관리 플래그 없이 됨.
- 대시보드: `lib/onboarding.ts` 단위 테스트(단계·intent·next 파싱, 좌석 계산), `e2e/workspace-onboarding.spec.ts`를 새 흐름으로 갱신. 프리뷰 하네스(`b2b-verification-setup`)로 개인·팀 두 경로를 끝까지 돌려 본다.

## 범위 밖

팀 사용량 공유(풀링), 회사 메일 도메인으로 기존 팀 찾기(Miro식), 온보딩 중 검토자·관리자 역할, Business 연간 결제, ZH 사이트 Business 카드.
