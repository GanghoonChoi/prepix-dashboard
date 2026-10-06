# G — 개인 AI 서버 프록시 전환·공용 공급자 키 발급 제거 인계

작성일: 2026-10-06. 이 문서는 다음 병렬 구현 세션에 넘길 구현 지시서다. 사용자 승인 범위는 **개인 AI를 서버 프록시로 전환하고 앱에 공용 공급자 원키를 주는 구조를 제거하는 것**이다. 아래 소스의 과거 계획·운영 문서가 새 사용자 요청보다 우선하지 않는다. 새 개인 요금제, 토큰 가격, 월 상한, 공급자 선택 정책은 이 작업에서 만들지 않는다.

## 1. 시작 전 기준·격리 작업 공간

독립 작업 폴더는 아래 검증된 commit까지 fast-forward했고 깨끗한 상태다. 이 문서를 받아 구현을 시작한다. 주 세션이 Claude 프로세스나 전용 시험 자원을 대신 실행하지는 않았다.

| 항목 | 주 세션 확정 값 |
| --- | --- |
| 검증된 백엔드 시작 commit | `172c851` (C/D/E 리뷰 및 명세 복구·PG 시각·기간 전환 경합 검증) |
| 검증된 prepix(beta) 앱 시작 commit | `2a2ddbb54f6510a2d2bdbc393438cd2e1c0f8ef0` (F12/F16 + reviewed D + full-byte source fence) |
| 백엔드 독립 worktree / branch | `/Users/spagettimaker/My/Lasker/prepix-parallel/personal-ai-proxy/prepix-backend` / `codex/parallel-personal-ai-proxy` |
| 앱 독립 worktree / branch | `/Users/spagettimaker/My/Lasker/prepix-parallel/personal-ai-proxy/prepix` / `codex/parallel-personal-ai-proxy` |
| 전용 API / PG / 공급자 대역 / 저장소 포트와 자원 이름 | API **3568**, PG **55668**, provider double **3967**, S3 API/console **3968/3969**. 자원 prefix `prepix-par-personal-ai-proxy-`. 실제 생성 전 포트 중복 재검사. 주 세션의 3328/3327/3501/3992/3900/55678과 F 자원을 사용하지 않음 |
| 전용 앱 userData / 라이브러리 / 출력 / scratch 경로 | `/Users/spagettimaker/My/Lasker/prepix-parallel/personal-ai-proxy/runtime/` 아래 각각 `userData/`, `library/`, `output/`, `scratch/` 및 profile별 하위 경로. 실제 사용자 라이브러리/기존 앱 profile 사용 금지 |
| 회귀·인계 기록 경로 | `/Users/spagettimaker/My/Lasker/prepix-parallel/personal-ai-proxy/HANDOFF.md`와 같은 폴더의 `evidence/`. 키/토큰/원문을 기록하지 않음 |

읽기 참고 원본은 `/Users/spagettimaker/My/Lasker/prepix-backend/backend`와 `/Users/spagettimaker/My/Lasker/prepix`다. 서버에는 C `945d130`, D `0cecc6a`, E `7f64cee` 리뷰가 통합되어 있고, 앱에는 D `5e1aa9a8f`와 실제 F12/F16 복구가 함께 들어 있다. 웹의 참조 경로는 `/Users/spagettimaker/.codex/worktrees/b2b-file-lifecycle/prepix-dashboard`다. 위 원본과 주 세션 작업 폴더는 읽기 참고용으로만 사용하고 구현은 배정된 독립 경로에서 한다. F 운영 세션은 진행 중이므로 해당 작업/자료를 재구현하거나 덮어쓰지 않는다.

서버 기준은 새 시험 DB에 전체 76개 migration을 적용하고 SQL hash/비미래 단조 journal을 확인했다. 결제·명세·receipt 조회 최종83개, 동시 기간 전환/PG시각17개가 통과했다. 앱 기준은 D 회귀261개(실제 API11개·Electron5개 별도 통과), 타입/production빌드를 통과했고 F12/F16 built Electron 원키/MAIN재시작 인수도 보존했다. 실 공급자 호출/운영 key 철회 검증이 완료됐다는 의미는 아니다.

- 시작 시 `AGENTS.md`를 읽는다. 앱은 기존 디자인 토큰·오프라인 기능·lazy login을 지키고 검증한 작업 단위를 독립 branch에 commit한다. 별도 주 세션의 commit 보류 지시가 있으면 그 지시를 따른다.
- 운영 공급자 호출, 실제 결제·메일, 운영 키 조회/변경, 배포, push는 이 작업의 인수 절차가 아니다. 실제 PG와 로컬 HTTP 공급자 대역으로 증명한다. 공급자 대역 통과를 실 공급자 검증으로 표시하지 않는다.
- 주 세션 서버/API/DB/앱을 재시작하거나 외부 담당자의 worktree를 고치지 않는다. 필요한 shared contract·migration 번호와 소유 파일을 먼저 조율한다. 기존 SQL migration을 수정하지 않고 새 migration을 추가한다.

## 2. 완료 목표와 보존 범위

로그인한 개인 사용자가 앱에서 채팅·편집 계획·숏츠·클라우드 STT/VLM·내레이션을 실행하면 앱이 자기 로그인 세션으로 Prepix 서버에 요청하고 서버만 공급자 키를 보유해 실행한다. 앱은 스트림, 결과, 자신에게 귀속된 작업 번호와 회복 상태를 받는다. 공용 공급자 키·관리 키·공유 계정의 원격 자료 목록 권한을 받지 않는다.

- `GET /v2/provider-keys`는 모든 공급자 원키 발급을 종료한다. Anthropic만 제거하고 Gemini/AssemblyAI/CLOVA/xAI/ElevenLabs/HF를 남기면 완료가 아니다. 기존 설정이나 구형 헤더로 원키 발급을 되살릴 수 없어야 한다. 구형 앱에는 키 없는 명확한 전환/업데이트 안내를 반환하는 호환 응답을 설계한다. 응답 status/body 계약은 서버·앱을 함께 맞춘다.
- 로그인하지 않아도 기존 로컬 편집, 원본 가져오기, 미리보기, 로컬 STT, 저장·렌더·내보내기를 할 수 있어야 한다. 서버 장애·AI 비활성화·로그아웃이 로컬 파일/결과를 지우거나 편집기를 막아서는 안 된다.
- 명시된 로컬 모델·개발자 소유 dev/eval 키와 외부 Claude Code/Codex의 자체 로그인은 공용 발급 키와 구별한다. 이를 몰래 개인 서버 요금제에 편입하지 않는다. packaged 개인 cloud 경로가 환경변수의 잔여 공용 키로 우회하는 fallback은 금지한다.
- 팀 AI는 별도 원장·견적·권한·current 참여회차·파일 ACL·예산·B2B 팀 전용 공급자 키를 계속 사용한다. 개인 프록시를 팀 실패의 fallback으로 쓰거나 팀 키를 개인 발급에 섞지 않는다. 팀 working copy의 개인 AI 거절을 유지한다.
- 기존 개인 STT/VLM 사용량 예약·확정·반납과 로컬 durable quota lease를 보존한다. 토큰 이벤트는 관측용이라는 기존 의미를 유지한다. 서버 실행 사실을 남기는 것은 새 개인 과금 정책을 만드는 근거가 아니다.

## 3. 조사로 확인한 현재 구조

### 서버 원키 발급

`backend/src/provider-keys/provider-keys.controller.ts`는 `GET /v2/provider-keys`에 JWT guard와 12/min throttle을 건다. `ProviderKeysService.issue(userId,channel)`는 `providerKeys.*`, `stt.*`의 공용 값을 `{ttlSec,keys}`로 반환한다. 호출자의 전용 단기 공급자 토큰을 만드는 코드가 아니다. beta 헤더면 Anthropic dev 키, stable/헤더 없음이면 prod 키이며 dev 키 누락 시 prod로 fallback한다. 현재 `providerKeys.enabled`는 literal false만 중단하고 기본값은 켜짐이다.

관련 파일:

- `backend/src/provider-keys/provider-keys.{controller,service,module}.ts`
- `backend/src/config/configuration.ts`, `backend/src/config/env.validation.ts`, `backend/src/app.module.ts`
- `backend/src/auth/strategies/jwt.strategy.ts`: JWT 서명/만료 검증 후 payload를 반환하고 활동 시각만 비동기 기록한다. 신규 유료 공급자 실행에서 suspended/purged 등 현재 계정 상태를 검증했다고 간주하지 않는다.
- `backend/src/common/privacy/workspace-event.ts` 및 공통 로그/Sentry interceptor: 신규 JWT, 공급자 secret, 원문/파일 URI가 추적·오류에 남지 않게 확장해야 할 지점.

### 앱 원키 수신과 수명

`apps/desktop/src/main/services/provider-keys.ts`는 packaged 앱만 키를 가져오며 dev는 `.env.local`을 그대로 둔다. `provider-key-env.ts`가 Anthropic와 Gemini/AssemblyAI/CLOVA/xAI/ElevenLabs의 env 이름을 매핑하고 `process.env`를 바꾼다. 서버가 주는 `huggingFace`는 현재 이 mapping에 없다. 누락되었다고 서버에서 그 값을 계속 발급해도 안전한 것은 아니다.

TTL 기본값은 1800초, 재조회 eligibility는 TTL의 0.8, keep-warm 확인 간격은 5분이다. 네트워크 오류이면 last-known-good 키를 계속 보존한다. 503이면 managed env를 지우며, 로그인 세션 변경/로그아웃에는 late response를 차단하고 키를 비운다. **이 TTL은 실제 공급자 키의 만료가 아니다.** 이미 받은 키는 공급자가 회전/철회할 때까지 실제 자격을 유지한다. “30분 뒤 구형 앱 키도 자동 소멸”이라고 인수 보고하지 않는다.

관련 파일:

- `apps/desktop/src/main/services/provider-keys.ts`, `provider-key-env.ts`, `provider-keys.test.ts`
- `apps/desktop/src/main/services/auth/auth.ts` 및 `auth.logout.test.ts`, `auth.session.test.ts`
- `apps/desktop/electron.vite.config.ts`, `apps/desktop/src/main/dev-env.ts`: 현재 빌드 시 provider secret을 넣지 않는 경계 보존.
- `packages/agent/src/ports/identity.ts`, `apps/desktop/src/main/agent-ports-app/identity.ts`, `packages/agent/src/ports/app-types/services/provider-keys.d.ts`: transport를 바꾼 뒤 port와 생성 선언도 동기화.

### 에이전트와 파생 호출 — 채팅만 바꾸면 남는 경로

| 기능 | 실제 소스와 주의점 |
| --- | --- |
| 개인 채팅 진입 | `apps/desktop/src/main/ipc/agent-chat.ts`의 `turn.send`는 로그인/계정 chat/개인 프로젝트 gate를 통과한다. `packages/agent/src/agent-v3/turn-runner.ts`는 `ensureProviderKeys()` 후 `getAnthropicClient`를 wire에 넘긴다. 등록용 provider의 `apiKey:'managed-by-wire'`는 실제 비밀 보관 지점이 아니다. |
| 공통 Anthropic | `packages/agent/src/agent-shared/client.ts`의 cached raw SDK client, `packages/agent/src/llm/index.ts`, `llm/anthropic-direct.ts`의 LLM facade. SDK `messages.create/stream`, beta/tool runner 경로를 모두 확인한다. `makeLLMClient()`는 별도 singleton이므로 원키 삭제만으로 이미 생성된 client가 사라진다고 가정하지 않는다. |
| 편집 계획/탐색 | `recipe/composition-plan.ts`, `recipe/edit-contract.ts`, `footage-search/core.ts`, `agent-tools/llm-batch.ts`, `agent-tools/survey-footage.ts`. 직접 IPC는 `apps/desktop/src/main/ipc/_helpers.ts`에서도 키 준비를 한다. 모든 소비자를 공통 개인 transport로 모은다. |
| 숏츠 | `apps/desktop/src/main/ipc/shorts.ts`; `packages/agent/src/shorts/{index,mine-llm,upload-meta,subject-detect}.ts`. rank/metadata는 Anthropic, subject box는 Gemini inline frames다. 키 존재 검사 때문에 프록시가 준비돼도 조용히 기능을 끄지 않게 availability를 바꾼다. 로컬 후보/빌드/blur-letterbox fallback의 기존 의미 유지. |
| critic·정밀 분석 | `packages/agent/src/agent-critic/{run-critic,shorts-critic-llm}.ts`: Anthropic뿐 아니라 Gemini cross-family 호출도 있다. media pipeline의 Gemini precision pass도 포함한다. 실패 시 기존 선택적 critic fallback은 남기되 실제 미실행을 성공으로 표시하지 않는다. |
| 메모리 | `packages/agent/src/agent-memory/build-l1.ts`, `build-l3.ts`가 공통 client 밖에서 `new Anthropic({apiKey})` 한다. 계정·프로젝트 종료 후 늦은 요약을 다른 주체의 기록에 넣지 않는다. |
| 프롬프트 예열 | `packages/agent/src/agent-shared/warm-cache.ts`의 별도 `new Anthropic`, main `index.ts`의 `startPromptCacheWarming`. 로그인 필요 gate·local cache marker gate·E2E skip·timer 수명을 보존하고 로그아웃 후 배경 호출 금지. |
| 내레이션 | `packages/agent/src/agent-tools/narration-tts.ts`: ElevenLabs voices 조회와 TTS binary 수신, `eleven_v3` mood와 음성 선택, local atomic 파일 저장. voices cache의 raw-key binding을 로그인/서버 scope binding으로 바꾼다. 다른 계정·프로젝트로 late mp3를 설치하지 않는다. |
| MCP/외부 런타임 | `packages/agent/src/mcp/{protocol-server,live-bridge}.ts`, `agent-v3/mcp-loopback.ts`, `agent-v3/hosted-turn.ts`, connector ACP runtime. MCP에서 실행하는 도구의 하위 AI 호출도 proxy 대상이다. 편집 도구 실행은 기존 main/loopback/승인 카드에 남기고 서버가 로컬 도구를 임의 실행하지 않는다. 외부 모델의 자체 인증과 우리 도구의 개인 cloud 하위 호출을 구분한다. `apps/desktop/src/main/services/connector/acp/catalog.ts`의 `agentEnv` credential filtering도 유지한다. |

### STT/VLM의 실제 기본 경로와 기존 서버 프록시 한계

관련 앱 소스는 `apps/desktop/src/main/services/media/media-analysis/` 아래다.

- `pipeline.ts`: cloud는 계정 session을 잡고 키 준비/개인 project gate/사용량 lease를 거친다. local transcript는 해당 cloud 단계를 건너뛴다. `quota.ts`, `quota-ledger.ts`, persistence `usage.ts`는 원계정 예약·original charge·restart/late completion을 처리한다. 그 의미를 그대로 보존한다.
- `service-config.ts`: direct가 기본이고 `PREPIX_STT_BACKEND=1|true`일 때만 opt-in proxy다. availability는 공급자 키 존재로 판단하는 곳이 있으므로 키 반환 중단과 함께 capability 조회로 바꿔야 한다.
- `providers/assemblyai/provider.ts`, `clova/provider.ts`만 기존 `backend-stt-client.ts` 경로를 선택한다. `stt-upload-audio.ts`의 routed set도 두 공급자만 포함한다.
- `providers/elevenlabs/provider.ts`는 Scribe, `providers/xai/provider.ts`는 `/v1/stt` 직접 호출이다. 단순 STT switch로는 둘의 키가 제거되지 않는다. 기존 router 언어별 순서·fallback·업로드 budget·압축 audio·진짜 단어/화자/시각 결과를 보존한다.
- Gemini `providers/gemini/client.ts`는 Google SDK로 Files upload/ACTIVE poll/generate/delete를 한다. `provider.ts`의 영상 preview/mapreduce/precision pass와 inline 이미지 소비자도 포함한다. 서버는 로컬 절대 경로를 읽을 수 없으므로 앱에서 만든 바이트를 제한된 전송으로 받는 계약이 필요하다.
- 서버 `backend/src/stt/stt.{controller,service,providers}.ts`는 AssemblyAI/CLOVA만 지원하며 현재 상태는 process Map에 있고 terminal 10분 retention/주기 sweep, restart 시 job을 잃는다. 새 프록시의 durable 회복 완료로 이 구현을 보고해서는 안 된다.
- **확인된 접속 불일치:** 서버 STT submit은 `reservationId`를 필수로 받고 `UsageService.assertReservationCovers`로 검증하지만 앱 `backend-stt-client.ts` submit multipart는 audio/provider/language/durationSec만 보낸다. 원 lease의 예약 번호를 전달하고 새 서버 계약에 맞추는 실제 회귀가 필요하다. switch만 켜서 완료 처리하지 않는다.
- 현재 서버 검증 함수는 reservation 소유/active/만료/초 단위를 조회한다. 조회만으로 특정 공급자 실행에 reservation을 원자적으로 귀속시키는 것은 아니다. 동일 reservation으로 동시 호출·임의 release·0초 선언 우회를 검토하고, 기존 transcript/VLM 한 asset charge 공유와 중복 소비 방지를 함께 유지한다. client 제출 duration만을 실제 입력의 진실로 믿지 않는다. 이 개선은 기존 quota 보존을 위한 실행 binding이며 새 요금 상한을 만드는 작업이 아니다.

## 4. 구현 산출물과 transport 계약

먼저 소비자 목록을 위 표와 대조하여 실제 reachability 표를 남기고 서버·앱 계약을 함께 정한다. 아래 route 이름은 **제안**이며 이미 존재하는 API가 아니다.

1. **개인 capability/status**: 공급자 설정 여부, 프록시 준비/전환 필요 상태, 기존 개인 entitlement 결과 등 키 없는 상태만 반환한다. 모델/작업 allowlist와 request/body/전송 budget은 현재 사용과 서버 명시 설정에 맞춘다. 누락된 운영 필수 설정을 성공으로 간주하거나 임의 무제한으로 만들지 않는다. 새 가격/개인 월 한도는 만들지 않는다.
2. **Anthropic 호환 messages transport**: 현재 chat/recipe/v3/raw SDK/beta tool runner가 사용하는 messages와 SSE 계약을 확인한다. `/v2/agent/messages` 등 제한된 개인 route에서 server key로 공급자 요청을 만들 수 있다. 자유 URL/임의 공급자 관리 API를 중계하는 open proxy로 만들지 않는다. 시스템/캐시/thinking/tool_search/tool_use/tool_result/사용량/stop reason을 보존한다. tool 실행은 앱에 남는다. SDK에는 app JWT를 공급자 master key처럼 취급하거나 vendor endpoint에 보내지 않게 한다. text-only create와 실제 stream 양쪽 회귀를 요구한다.
3. **STT·Gemini·TTS**: typed operation별 제한된 submit/read/cancel/result 계약과 user-owned opaque job/attachment 식별자. local path, 공급자 raw job ID/URI만으로 남의 파일을 get/delete/generate하지 못한다. Gemini upload→active→generate→cleanup, ElevenLabs voice→tts bytes, STT words/diarization/언어 결과를 실제 기존 앱 자료형으로 매핑한다. 파일명 재사용·같은 bytes·병렬 mapreduce chunk의 identity를 섞지 않는다.
4. **원 요청 회복**: actor+API origin+작업+원 input hash+request key로 server receipt/job을 귀속한다. paid submit intent/전송 경계를 durable하게 기록하여 응답 유실·앱/서버 restart에 동일 실행을 조회한다. 같은 키 다른 본문은 conflict. 최초 실행·receipt lookup·completed read·cancel의 현재 권한을 각각 확인한다. provider가 실행을 받았는지 불명확한 timeout/5xx/연결 종료는 “실패했으니 새 키로 재실행”으로 처리하지 않는다. 불명 상태와 가능한 조회/원키 재개를 보여주고 원래 key를 보존한다. 새 transport가 vendor/SDK의 자동 retry로 실제 paid execution을 늘리지 않게 확인한다.
5. **계정/프로젝트 수명**: 초기 current user, origin, 로그인 abort signal, 원 project binding과 source generation을 pin하고 token restore/refresh, 응답 headers/body, poll, 다운로드/임시파일쓰기/DB install 경계 전후에 검사한다. logout→다른 login, same account 새 session, 프로젝트 이동/삭제/팀 binding 변경 뒤 late response는 cache/store/main env/자막/내레이션/편집 결과를 오염시키지 않는다. 전용 신규 서비스에 current active account 검사도 넣는다.
6. **사용량/보관**: 현재 개인 quota 예약 ledger와 서버 실행 상태를 별도 evidence로 연결한다. 기존 `llm_usage_events`는 `source:'client'|'proxy'`가 이미 있어 서버 확정 이벤트와 과거 client 보고를 구별할 수 있다. 동일 호출의 proxy+client telemetry가 두 번 청구/합산되지 않게 attribution/원키를 보존한다. 서버 측 관측 추가를 개인 결제 원장 또는 B2B units 원장으로 오인하지 않는다. 현재 보관/취소 정책을 명시하며 새 정책값이 필요한 부분은 설정 미완 상태로 주 세션에 보고한다.

신규 DB 실행 상태는 accepted/running/completed/failed/cancelled/unknown 등 실제 의미를 가진 상태로 표현하되 확정 receipt 없이 completed를 만들지 않는다. 정확한 enum/정책은 계약 단계에서 정한다. 앱·서버 restart 후 진행 중 입력과 불명 submit을 소비/삭제/환불/재청구 중 어느 하나로 임의 판정하지 않는다. 완료 결과·로컬 offline 파일은 read recovery와 새 paid 실행을 분리한다.

## 5. 팀 AI와 공통 모듈 보존

다음 기존 경로는 개인 프록시 개발의 incidental rewrite 대상이 아니다.

- 서버 `backend/src/b2b/ai-providers.ts`, `ai-worker-main.ts`, `ai-catalog.ts`, AI execution/credits/current participation gates. `B2B_AI_ASSEMBLYAI_KEY`와 `B2B_AI_GEMINI_KEY`는 팀 전용이며 personal `STT_ASSEMBLYAI_KEY`, `PROVIDER_GEMINI_KEY`와 같거나 누락되면 실행을 거부한다. 원키 발급 endpoint를 없앴어도 팀 격리를 해제하지 않는다.
- 앱 `apps/desktop/src/main/services/b2b/ai-route.ts`의 `assertPersonalAiProject`, `assertPersonalAgentProject`, `teamAiScope`. local team binding이 있는 input은 개인 AI/개인 local AI 경로로 fallback하지 않는 기존 정책 유지.
- usage/common auth/개인 persistence 변경이 필요하면 소유를 조율한다. 팀 공통 TX/lease/cap/환불 withholding 조건을 새 personal state 때문에 잃지 않는다. 팀 용량이나 크레딧으로 개인 기능을 실행하지 않는다.
- 개인 프로젝트의 숏츠·내레이션·MCP 하위 AI도 동일 경계를 따른다. entry point 하나의 로그인 gate만 통과했다고 다른 프로젝트 source를 허용하지 않는다.

## 6. 구형 키와 원격 잔여 상태의 이행 순서

구현과 실제 운영 변경을 분리해 runbook을 작성한다. 이 세션은 운영 변경을 실행하지 않는다.

1. 키 값 없이 issuance 필드/공급자/workspace/channel/client 지원 버전/서버 설정 명칭을 목록화한다. 공용 발급키, 독립 dev/eval 키, B2B team-only 키, 외부 런타임 사용자 자신의 자격을 분리한다. 환경 파일이나 계정 vault를 출력·인계 문서에 복사하지 않는다.
2. 새 proxy와 capability/원키 회복을 로컬 대역으로 인수하고 클라이언트 packaged 경로가 더 이상 bundle을 요구하지 않게 한다. beta/stable channel routing은 서버의 공급자 계정 선택으로 남긴다. 구형의 no-header fallback을 새 transport 권한으로 임의 확장하지 않는다.
3. 구형 endpoint 종료/업데이트 응답과 앱 managed-key synchronous clear를 함께 준비한다. cached Anthropic/Google/TTS voice client·keep-warm/예열·inflight 늦은 body가 비밀을 되살리지 못함을 시험한다. 네트워크가 끊긴 구형 앱에서 실제 기존 vendor 키가 남는 사실과 cloud AI 중단/업데이트 영향을 runbook에 명시한다. 로컬 편집/기존 결과 접근은 보존한다.
4. **실제 운영 담당자 승인 단계**로 공급자별 기존 발급키의 revoke/rotate와 새 서버 전용키 설치 순서를 적는다. endpoint 종료나 앱 TTL만으로 기발급키 철회 완료를 주장하지 않는다. Anthropic dev/prod/eval와 STT shared secret, HF 토큰 포함 해당 여부를 분리한다. team-only 키를 실수로 철회하지 않는다. 실패 시 구형 master-key 발급을 다시 켜는 rollback을 제공하지 않는다.
5. 원격 업로드·transcript job·Gemini file·TTS artifact의 소유/상태/보관 evidence와 cleanup 책임을 명시한다. 취소/로그아웃/처리기 lease loss/restart/실패 후 cleanup 재시도는 원래 account+job에 귀속한다. remote delete 성공을 확인하지 못한 상태를 local row 삭제만으로 완료 처리하지 않는다. 공급자 계정 전체 목록을 개인 앱에 내주거나 구형 shared key로 다른 사람의 원격 자료를 복구하지 않는다.
6. 이미 노출된 키와 과거 원격 자료가 안전해졌다는 별도 운영 인수 증거가 없는 동안은 residual을 남긴다. 소스의 “remote TTL/auto-expire” 주석은 실제 공급자에서 삭제를 확인한 증거가 아니다. 실제 vendor cleanup/철회 검증은 담당자 수행/기록으로 분리하고 이번 로컬 검증에서 통과했다고 쓰지 않는다.
7. rollback은 proxy 기능 플래그/신규 cloud 작업 중단/opaque 상태 보존/수정 앱 복귀로 설계한다. 로컬 프로젝트·offline export·확정 receipt를 유지하며 unknown을 자동환불/자동재청구하지 않는다. 기존 공용 원키를 재배포하는 rollback은 목표에 반한다.

## 7. 필수 인수 — 실제 PG·로컬 공급자 대역·실제 앱

검사는 구현 복사본을 주장하는 단위 시험에 머물지 않고 제품 소비자를 실제 transport에 연결한다. 먼저 실패를 재현하고 수정 뒤 통과 결과·실행 명령·시작 commit·fixture 범위를 남긴다.

### 서버/공급자 경계

- fresh DB 모든 migration 적용 + production 타입/build. 실제 JWT/DTO/랩퍼/HTTP stream/PG를 쓰는 로컬 harness와 provider double을 준비한다. test provider를 production 설정에서 우회 연결 가능하게 만들지 않는다.
- 원키 route 어느 채널/키 설정/kill switch 값에서도 secret을 반환하지 않음. 신규 routes response/error/SSE/log/Sentry에 sentinel 공급자 secret, app JWT, 민감 원문/URI가 노출되지 않음. 원키가 response body뿐 아니라 header/query/artifact에 숨지 않음.
- 로그아웃·expired JWT·suspended/purged account·타계정 job/attachment/receipt get/delete/subscribe 거부. current 권한이 submit→provider send 사이 바뀌면 새 실행 거부. 이미 확정된 본인 receipt의 기록을 자동으로 지우지 않음.
- 동일 key/body 동시 submit은 한 provider 실행. 다른 body는 conflict. 공급자 accept 후 응답 유실, send 직후 서버 종료, job 완료 직후 receipt reply 유실, status 5xx/부분 SSE 중단은 새 paid 호출을 자동으로 만들지 않음. 원키가 앱/서버 재시작 후 유지됨. 재조회 키/actor/hash/path가 바뀌면 거부.
- client duration/가격/usage/완료 상태 조작으로 gate 우회 불가. 예약 ID 누락/다른 계정/만료/confirm/release 후/부족분/동시 재사용을 검증. 동일 asset의 transcript와 VLM 기존 한 charge 공유는 계속 통과. host±24h에서도 DB의 lease/보관/예약 만료 의미 유지.
- Gemini/Assembly remote state는 본인 opaque attachment/job에 bind. URL 주입·redirect·다른 사람의 vendor ID/파일 URI·임의 관리 API 중계 거부. 중간 파일/delete failure를 만들고 restart cleanup이 원주체의 상태를 유지하는지 확인.
- 팀 provider 키 혼용·개인 프로젝트 팀 charge·팀 working copy 개인 fallback 거부 회귀. 기존 팀 AI credits/execution/TX/lease/cap/환불 withholding 회귀를 실행한다.

### 앱 제품 흐름

- 실제 Electron에서 개인 에이전트 v3의 SSE text/thinking/tool use/result/승인 카드·취소·최종 usage, raw create를 쓰는 recipe/숏츠/meta/메모리/critic, MCP loopback과 외부 하위 tool 경로를 연결한다. 첫 응답 대기와 stream 도중 네트워크 끊김을 각각 검증한다.
- 실제 짧은 audio/video/image fixture로 cloud STT router/말 단위 시간·화자/압축 payload/VLM mapreduce·inline frames/subject detection/precision pass/TTS mp3 저장·재생을 확인한다. 한국어 파일명·같은 이름 두 파일·다중 병렬 job·cancel 중 temp cleanup을 포함한다. 결과는 로컬 HTTP provider double이며 진짜 vendor 결과 아님을 적는다.
- packaged 상당 환경에서 `GET /provider-keys` 호출 0, vendor direct 호출 0, managed secrets 설치 0을 sentinel/네트워크 관찰로 확인한다. master key처럼 보이는 raw 값 부재만 검색하는 시험으로 완료 판정하지 않는다. 인위적으로 잔여 env/cache에 fixture key를 넣어도 packaged 경로가 우회 호출하지 않는지 확인한다.
- account A 요청의 headers/body/SSE/poll/다운로드를 지연시킨 뒤 logout/B login, same account 새 session, origin 변경, project 변경/팀 binding 추가/삭제를 한다. late response가 B의 cache/DB/자막/내레이션/편집/키에 남지 않음. 앱 restart는 같은 원 key/job/hash를 조회하며 새 실행으로 바뀌지 않음.
- offline startup→기존 개인 프로젝트 열기→로컬 편집·자막/로컬 STT·render/export 성공. signed-out, capability unavailable, proxy 503와 cloud 전환 안내가 이를 막지 않음. 이미 저장한 확정 local AI 결과도 열림. UI에서 서버 보관 상태와 로컬 결과/미완료를 구별함.
- 기존 provider-key/auth-session/account-lifetime/quota-pipeline·quota-ledger·STT payload/audio-source·narration-lifetime·agent turn-lifetime/scope-guard/MCP·shorts 회귀를 적절히 유지/전환한다. dev/local model과 사용자 자체 외부 런타임 인증이 회사 proxy 권한으로 바뀌지 않음.
- generated agent port 선언/계약 check, 의미 있는 변경 타입/lint/앱 빌드와 필수 기존 회귀 통과. 다른 담당자의 렌더/결과 등록/납품 경로를 손상하지 않음.

## 8. 작업 순서와 최종 인계 형식

권장 순서는 (1) current 소비자 reachability·계약·소유 확인, (2) 제한된 서버 실행/원키 조회/cleanup/사용량 binding + 실패 회귀, (3) 공통 앱 transport·capability·session cancellation, (4) 모든 우회 소비자 전환, (5) 원키 발급 endpoint와 앱 수신/예열 제거, (6) 실제 앱·PG 대역 인수와 운영 이행 runbook이다. 중간 단계에서 일부 소비자가 미전환이면 전체 완료로 표시하지 않는다.

최종 보고에는 다음을 포함한다.

- baseline/최종 commit, 변경 파일·신규 migration·route/계약·generated 파일, 독립 작업 공간과 시험 자원 이름.
- 기능별 direct 제거/proxy 연결/오프라인 보존/팀 경계/원키 회복/원격 cleanup 표. 미지원 경로를 숨기지 않는다.
- 실제 PG/HTTP provider double/실제 Electron 각각의 시험 수와 실패 후 수정 증거, 로그/trace 경로. skip 또는 실 공급자 미검증은 별도로 적는다.
- 기존 개인 quota 의미·새 과금 정책 없음 확인과 필요한 정책/운영 설정 미완 항목. 미승인 상한값/보관일/자동환불 정책을 확정하지 않는다.
- source 구현 완료와 구형 배포 앱 교체·실제 provider key 철회·과거 remote 자료 cleanup의 운영 잔여를 분리한다.
- 주 세션이 순서대로 통합할 commit 묶음과 재현 가능한 로컬 인수 절차. 운영 배포/push/키 변경을 대신 실행하지 않는다.
