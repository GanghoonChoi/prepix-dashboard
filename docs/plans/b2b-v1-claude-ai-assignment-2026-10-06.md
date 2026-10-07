# Claude 병렬 작업 D — 팀 AI 견적·실행·결과와 앱/웹 S30

사용자의 2026-10-06 추가 병렬 작업 요청에 따른 배정이다. 전체 목표는 PREPIX B2B v1.0 구현, 데스크톱 기준은 prepix(beta)다. 원장의 완성을 실제 AI 실행의 완성으로 계산하지 않는다. 이 세션은 로드맵 작업 단위 7을 서버·웹·앱 연결과 로컬 인수까지 맡는다. 문서 안 시장 조사·설계 제안은 사용자 승인이나 확정 정책이 아니다.

## 준비된 작업 폴더

세 폴더 모두 별도 Git worktree이며 `codex/parallel-b2b-ai` 브랜치다.

| 대상 | 작업 폴더 | 출발 커밋 |
| --- | --- | --- |
| 서버 | `/Users/spagettimaker/My/Lasker/prepix-parallel/ai/prepix-backend` | `0f4de7a096ac4d6a8334cb0418dc1b9be11e944c` |
| 웹 | `/Users/spagettimaker/My/Lasker/prepix-parallel/ai/prepix-dashboard` | `73749c21013b46b84625603bf74e0824aece7249` |
| beta 앱 | `/Users/spagettimaker/My/Lasker/prepix-parallel/ai/prepix` | `bc4141d93bf60b4b7f7c49df0c8dac6a5060f8f1` |

서버 실행/설치는 서버 폴더 아래 `backend`에서 한다. 의존성은 각 폴더에 잠금 파일대로 설치한다. 주 폴더나 다른 세션의 node_modules를 변경하지 않는다. 주 서버의 미커밋 native 형식 작업은 이 출발점에 포함되지 않았다.

권장 독립 자원은 API 3528, 웹 3521, PostgreSQL 55498, S3 3950, 컨테이너 접두사 `prepix-par-ai-`다. 작성 시 localhost 포트는 비어 있었다. 시작 전에 다시 확인한다. DB명은 기존 시험의 보호 조건에 맞춰 `prepix_onboarding`을 사용하되 독립 컨테이너에 만든다. 자신의 프로세스·컨테이너만 정리한다. 주 작업 3308/3501/55438/3900과 C의 검토·검토본 자원을 공유하거나 종료하지 않는다.

Codex는 작업 폴더와 배정 문서만 준비했다. Claude 프로세스는 실행하지 않았다. push/merge/배포, 실제 이메일 발송, 운영 데이터 변경, 실제 유료 AI 호출은 이 배정에 포함하지 않는다. 실제 공급자 어댑터 코드는 구현하되 로컬 HTTP 공급자 대역과 명시적 시험 설정으로 검증하고 실제 유료 실행 인수는 미검증으로 남긴다.

## 먼저 읽을 문서와 코드

1. 원본 폴더 `/Users/spagettimaker/Downloads/PREPIX_B2B_개발전달문서_v1.0 (1)/`의 구조화 원본을 실제로 읽는다. 파일명은 디스크에서 확인한다. `functions.json` F07, `policies.json` P03/P04/P05/P06/P07/P11/P17, `wires.json`의 S19/S21/S30, `flows.json`의 AI 흐름이 근거다. wires는 최상위 `{intro,wires}` 객체다.
2. 웹 `docs/plans/b2b-v1-execution-roadmap-2026-10-06.md`, `b2b-v1-implementation-status.md`, `b2b-v1-external-handoff-review-2026-10-06.md`와 서버 `backend/docs/b2b-ai-accounting.md`, `b2b-licences-and-devices.md`, 상품/파일 문서를 읽는다. 상태 문서는 누적 기록이므로 현재 코드와 마지막 검증을 함께 확인한다.
3. 서버 `backend/src/b2b/ai-accounting.service.ts`, `ai-accounting-policy.ts`, `ai-accounting-worker.service.ts`, `ai.controller.ts`, `licences.service.ts`, `files.service.ts`, `file-trash.service.ts`, `b2b-core.service.ts`, `contracts.ts`, `project-participation.ts`, schema `b2b-ai.ts`와 migrations 0052/0053/0063을 읽는다.
4. 기존 실행은 `backend/src/agent-host`, `backend/src/agent`, 앱 `apps/desktop/src/main/ipc/agent.ts`, `services/media/media-analysis/{pipeline,quota}.ts`와 관련 실제 공급자 호출 코드를 찾아 읽는다. 기존 공급자 실행/취소/복귀를 재사용할 수 있는지 먼저 확인한다.
5. 앱 `services/b2b/ai-route.ts`, `project-access.ts`, `project-binding.ts`, `authority-runtime.ts`, `file-api.ts`, `file-transfer.ts`, `file-receipt.ts`, 웹 팀 AI 사용량 화면과 영속 변경 기록을 읽는다. 앱 AGENTS.md의 디자인 토큰과 오프라인·지연 로그인 규칙을 지킨다.

## 현재 기반과 중요한 빈틈

- 팀 지급 건·개인 기간별 한도·동시 예약·정산·반환·만료, 작업 lease/24시간 종료, 사용 내역·조회·취소는 구현돼 있다.
- `reserveVerifiedQuote`는 서버 내부 계약이다. 고객이 보낸 사용량·해시·가격으로 이 객체를 만들어 접수하지 않는다. 현재 공개 견적/새 작업 접수·실제 실행은 없다.
- 앱 `assertPersonalAiProject`는 팀 입력이 개인 AI 차감/공급자 경로로 들어가는 것을 차단한다. 팀 경로가 연결되기 전에 이 검사를 삭제하지 않는다.
- 원장 fixture의 입력과 resultVersionId는 합성 자료다. 현재 resultVersionId의 UUID만으로 실제 결과의 존재·접근·가격을 보증하지 않는다. 이 간극을 이번 범위에서 해결한다.
- 기존 파일 검사는 미디어 중심이다. STT·분석 JSON을 영상으로 위장하거나 스캐너를 건너뛰지 않는다. 지원 결과의 불변 저장·형식 검사·접근·보존 계약을 새 AI 도메인으로 정의하고 공통 파일 연결은 별도 integration 커밋으로 제시한다. native 작업 파일 파서는 Codex 소유이므로 직접 재구현하지 않는다.

## 이번 세션의 구현 범위

1. **버전 있는 작업/가격 설정.** transcript/vision/agent에 대해 지원 입력, 기술 한도, 예상량·최대 고객 사용량 계산, 실제 완료 단계의 측정·반올림·취소 정산, 공급자 설정을 명시적으로 검증한다. 값이 없으면 해당 작업을 막는다. 상품 P17의 실제 단가·AI 단위를 임의로 확정하지 않는다. 로컬 가짜 가격은 시험 설정으로 분리한다. 가격 버전과 조건을 불변으로 보존한다.
2. **서버 견적 발급.** 현재 로그인 계정·팀 상태·프로젝트 작업 권한·해당 팀 이용권·입력의 정확한 불변 버전 접근을 검사한다. 서버가 확인한 해시·측정된 속성·처리 범위·지시·가격 버전·예상량·최대량·만료를 묶는다. 입력/지시/처리 범위가 바뀌면 다시 견적을 받아야 한다. 다른 프로젝트/팀 입력과 고객이 낮춘 최대량을 거절한다. 다운로드/처리 허용이 다른 경우 원본 전달을 우회하지 않는다.
3. **고객 접수와 단일 예약.** 사용자는 견적과 최대량을 보고 명시적으로 실행한다. 접수 직전 현재 권한·입력 접근·견적 만료를 다시 확인하고 기존 원장 서비스에 예약한다. 같은 견적/요청의 재전송·동시 접수·응답 유실은 작업/예약 하나만 만든다. 가격/입력이 다른 같은 키는 거절한다. 결과 미확인 요청은 원키 GET 영수증으로 복구할 수 있게 하고 클라이언트가 임의 작업 번호를 다시 만들지 않게 한다.
4. **실제 실행 작업자와 공급자 어댑터.** 접수→대기→실행→완료/실패/취소를 기존 lease·heartbeat·executionKey·reconcileRequired에 연결한다. 공급자 승인 이후 응답 유실/프로세스 종료가 생겨도 원실행을 대조하고 무조건 다시 유료 호출하지 않는다. 대조 불가능하면 확인 필요 상태로 보존한다. 입력은 고정된 허용 객체만 읽고 임의 URL/NAS 경로를 실행하지 않는다. 시간·용량·동시성·호출 최대량을 설정으로 제한한다. 24시간 내 이전 예약의 처리와 신규 접수 권한을 구분한다.
5. **결과 저장과 검증 정산.** 실제 결과 바이트·형식·해시를 확인한 불변 결과 버전을 저장하고 원작업에 연결한다. 서비스 실패/결과 저장 실패에는 고객 사용 확정을 만들지 않는다. 완료 단계의 검증된 측정량만 정산하고 상한을 넘지 않는다. 공급자 비용과 고객 원장을 분리한다. 같은 결과·영수증을 재처리해도 결과와 확정량이 늘지 않는다. 현재 입력/결과 보존 근거를 기존 파일 수명 계층에 연결하고 취소/실패/종료 때 해제 시점을 명시한다. 저장소 고아·중간 실패도 재처리/정리한다.
6. **현재 허용의 결과 수신.** 작업이 끝났어도 자동 발행·타임라인 덮어쓰기를 하지 않는다. 결과 조회/다운로드 때 현재 계정·서비스·팀·프로젝트·자료 접근과 팀 시간 경계를 확인한다. 회수/재초대로 옛 비공개 입력/결과 허용이 부활하지 않게 현재 ACL과 필요한 참여 회차를 고정한다. 사용자 작성/실행 이력은 지우지 않는다. 결과를 받은 사용자가 명시적으로 로컬 작업에 적용하고, 원래 작업/기준이 바뀌면 충돌 안내와 선택을 제공한다.
7. **웹 S30.** 접근 가능한 프로젝트의 입력 버전 선택·작업/지시·견적/상한 확인·실행·진행/취소·결과 수신을 현재 팀 AI 사용량과 연결한다. 팀 잔액과 본인 한도는 별도 지급으로 오해하지 않게 표시한다. 새로고침·다른 계정/서비스·팀 전환·응답 유실에서도 원입력/견적/작업의 소속을 유지한다. 실패 조회를 빈 작업 목록이나 완료로 표시하지 않는다.
8. **beta 앱 S30과 실제 실행 입구.** 고정된 로컬 팀 프로젝트에서 팀 견적/접수 경로를 사용한다. 로컬 미등록 원본은 자동 전체 업로드하지 않고 입력 등록/연결이 필요함을 안내한다. 준비된 파일 전송 API를 재사용하고 개인 AI fallback을 만들지 않는다. 진행 작업·미확인 접수·견적/상한·원입력/기준을 계정/서비스/팀/프로젝트별 영속 저장하고 강제 종료 뒤 원작업에 복귀한다. transcript/vision/agent의 관련 기존 실행 입구를 팀 경로에 연결한다. 결과 수신과 편집 적용은 현재 접근/편집 허가를 각각 확인한다. 개인 프로젝트의 오프라인 사용과 기존 개인 AI는 회귀 검증한다.

모든 작업을 한 번에 유료 공급자로 인수할 필요는 없다. 지원 작업별 실어댑터/실행 연결과 로컬 HTTP 대역 검증을 완료하고, 외부 공급자에서 검증하지 못한 동작을 정확히 남긴다. 지원하지 않은 작업을 완료처럼 노출하지 않는다.

## 병렬 작업 경계와 통합 규칙

- Codex: native 작업 파일 형식·manifest·검사·정확한 앱 열기, NAS 재연결, 파일 전송/발행 및 최종 통합. 새 `ai-*` 서비스/IPC/화면에 집중하고 `team-files.ts`, `library.ts`, `file-receipt.ts`, `file-inspector.ts`를 직접 대폭 변경하지 않는다. 필요한 공통 연결은 작은 integration 커밋으로 분리하고 이유/계약을 인계한다.
- Claude C/C의 검토본 하위 작업: 영상 검토본 생성·재생, 검토·코멘트·공유·한 명의 로그인 승인자. 검토·승인·preview worker/공유 도메인과 프로젝트 완료를 구현하지 않는다. AI 결과를 검토에 자동 공개하지 않는다.
- 공통 `contracts.ts`, module/controller 등록, schema index, migration journal, worker 등록, 앱 `db.ts`/IPC 계약/IPC 등록/locale, 웹 생성 계약·프로젝트/홈 진입은 `(integration)` 표시 별도 커밋으로 분리한다. 생성 계약은 서버 기준으로 동기화하고 손편집하지 않는다.
- 정식 0000~0063 migrations와 기존 불변 원장은 수정·삭제하지 않는다. 새 migrations는 자기 분기에서 0064 이후로 만들고 C의 번호와 겹칠 수 있음을 HANDOFF에 기록한다. 통합 담당이 빈 시험 DB에서 의존 순서를 정리한다. 운영 DB에서 이미 적용된 migrations를 재작성하거나 테이블을 지우지 않는다.
- 공통 `participationMatches(participant,{userId,participationId})`는 회차 비교만 한다. 현재 계정/팀/역할/자료 ACL 검사는 별도다. UUID는 고객 응답에 노출하지 않는다. 일반 participant.revision 또는 joined_at으로 과거 파생 권한을 추정하지 않는다.
- 비밀키·JWT·서명 URL·지시 본문·입력 콘텐츠를 일반 로그/감사/스크린샷에 넣지 않는다. 콘텐츠 허용 없는 운영 조회에 프로젝트명/입력 파일명·해시·작업 수를 노출하지 않는다. 실제 NAS 경로를 서버로 보내지 않는다.
- 상품/정책 미정은 실행 차단과 설정 계약으로 표현한다. 시장 리서치의 자동 과금·OTP·권한 자동 복원·새로운 취소 과금 정책은 적용하지 않는다. 독립 구현/시험을 진행하고 결정 필요한 항목만 구체적으로 인계한다.

## 인수 기준

- 실제 PostgreSQL, 독립 MinIO, 실제 Nest/JWT/엄격한 DTO, 브라우저와 빌드된 Electron을 사용한다. 공급자만 로컬 HTTP 대역으로 바꿔 견적부터 결과 바이트 검증·정산·수신까지 실행한다. 기존 합성 quote/result UUID fixture만 통과시켜 완료라고 하지 않는다.
- 실제 등록된 입력의 범위/해시/접근, 비참여 소유자·관리자/이용권 없는 관리자/두 팀/개인 구독 분리, 가격 설정 누락·견적 만료/변조·입력 변경을 검사한다.
- 마지막 잔액 동시 접수·같은 키/견적 재시도·원장 감사 실패 롤백·서비스 실패 전액 반환·부분 완료 후 취소·상한 초과·결과 저장 실패·중복 정산을 검사한다.
- 공급자 접수 직후/결과 저장 직후 서버 중단·lease 복구·원실행 대조·늦은 이전 lease 응답, 24시간 경계/기간 변경·만료 지급분 반환, 참여/자료 회수 후 결과 수신 차단을 확인한다.
- 웹과 Electron에서 접수 응답 유실·새로고침/강제 종료 후 원작업 복귀, 계정/서비스 전환과 지연 응답, 정확한 결과 해시·현재 작업 적용 충돌, 개인 프로젝트 회귀를 확인한다. 실제 유료 공급자 검증과 Windows/OS 키 저장 인수 여부를 따로 적는다.
- 서버 도메인 통합·기존 AI 원장/파일/권한 회귀, 웹 단위/타입/변경 lint/빌드, 앱 관련 단위/타입/실제 Electron 검사를 수행한다. 테스트 수를 완료율로 사용하지 않는다. 현재 서버 spec 타입 기존 3건과 누적 시험 DB 작업자 실패 기록은 상태 문서에 있다. 실패를 임의로 기존 문제라 하지 말고 출발점 재현 여부를 적는다.

## 최종 전달

검증된 작업 단위별로 커밋한다. 각 repo의 HANDOFF.md와 `/Users/spagettimaker/My/Lasker/prepix-parallel/ai/HANDOFF.md`에 출발/최종 커밋, 실행/검증 방법과 로그 위치, API/설정/원실행 대조/결과·보존 계약, migrations 순서, 공통 충돌 파일, 실제·대역·미검증 구분, 미완과 결정 필요를 남긴다. 자신의 서버/웹/작업자는 종료하고 시험 자원의 포트/컨테이너를 기록한다. push/merge하지 않는다.

범위가 크면 견적/접수→실행/결과→웹/앱 인수의 검증 가능한 커밋으로 나누되, 원장만 또는 UI 목업만 남기고 작업 단위 7 전체 완료라고 보고하지 않는다. Codex가 최종 현재 서버와 beta에 통합·재검증한다.

## Codex 공통 native 변경과 회귀 기록 추가

2026-10-06 서버 `4c7e920`, beta `292102097`에 native 작업 문서 검사와 실제 사본 열기를 커밋했다. D의 출발점에는 없다. 서버 `TeamFilePolicy.native`는 선택적이며 없으면 새 `kind=working` 등록을 차단한다. 작업 파일은 UTF-8 JSON/ProjectFile v4/경로 없는 외부 원본 manifest이며 WAV나 AI 결과 JSON을 작업 파일로 위장하지 않는다. 원본 manifest는 선언된 연결 조건으로서 실제 원본 접근이나 측정 검증을 부여하지 않는다. 검사 기준은 주 서버 `backend/docs/b2b-native-project-format.md`와 `src/b2b/native-project-format.ts`다.

앱 계약 동기화는 이제 `contracts.ts`와 공통 native parser를 함께 생성한다. 해당 변경을 가져온 뒤 이전 서버 출발점만 source로 사용하면 parser 파일 부재로 실패한다. 자신의 분기에 같은 의존 변경을 통합하거나 현재 통합 서버를 명시적으로 source로 사용하고, AI 공통 계약 통합 때 parser도 유지한다. library/db/team-files/locale 공통 충돌은 별도 integration 커밋으로 인계한다. 새 앱 열기는 정확한 수령/현재 허용/전체 SHA-256을 확인하며 동일 버전의 사용자 편집을 덮어쓰지 않는다. native 결과 적용을 위해 별도의 빈 사본이나 team 소속 재해석을 만들지 않는다.

최종 새 DB 55488 전체 실행은 192/197이다. 파일/native 56개는 통과했고 AI 원장 개별 4개(상위 suite까지 실패 5)가 `B2B_TEAM_PREPARING`으로 실패했다. 앞선 새 DB 전체는 197/197이었으므로 재현 조건을 조사해야 한다. 로그 `/tmp/prepix-native-backend-fresh-final.log`의 ACL/이용권 replay, 만료 quote/lease, legacy balance 검토, allocation FK 사례다. 적용은 호스트 시각, AI/파일 작업은 PostgreSQL 시각을 사용하는 차이가 후보이며 확정 원인은 아니다. 같은 관측 오류를 단순히 기존 문제라 처리하거나 fixture 기간을 임의로 연장해서 숨기지 않는다. D 착수 때 출발점 재현과 시각 기준/원수납 적용을 확인하고 필요 공통 수정은 별도 커밋으로 인계한다. 사용자의 P17 값을 새로 정하는 작업은 아니다.

동일 DB에서 AI 원장 파일만 다시 실행한 결과는 18/18 통과(12.7초), `/tmp/prepix-native-ai-regression-recheck.log`다. 단독 통과로 전체 실행의 간헐적 실패가 해결됐다고 계산하지 않는다.

## Codex native 원본 재연결 공통 변경

2026-10-06 beta `fdc79e862`는 library/db/media-list/media IPC/공유 relink/export recovery와 플레이어/CSS를 수정했다. native 사본 원본의 처음/현재 조건을 `b2b_source_identities`에 저장하고 실제 전체 SHA-256/실측 속성/decode로 같은 원본을 판단한다. 다른 원본은 `media:inspect-relink`의 토큰과 새 optional `media:relink.allowSourceReplacement` 및 현재 편집 허가를 요구한다. AI 결과나 기존 일부 구간 캐시 해시로 native 원본 일치를 선언하지 않는다. D의 SQLite/IPC 변경과 통합할 때 이 테이블/검사를 유지한다. 공통 파일을 가져오기 위해 현재 작업을 덮어쓰지 말고 필요 연결을 별도 integration 커밋으로 인계한다. 관련 단위 57개/타입/빌드 Electron의 로컬 경로 이동 인수는 통과했지만 실제 NAS·전체 팀 원본 등록과 native 내보내기/발행은 남는다. 자세한 근거는 주 앱 `docs/product/b2b-native-working-copy-2026-10-06.md`다.


## Codex의 작업 파일 저장 전송 공통 변경

beta `bc5c0beba`는 native 작업 파일 저장/명시 전송을 구현·커밋했다. 앞선 `fdc79e862`의 원본 식별/relink 위에 SQLite `b2b_working_exports`와 프로젝트 조회 index, `storedNativeSource`의 순수 로컬 읽기, `project:save-working-file`/`project:working-files`/`project:reveal-working-file`, `team-files:send-working`, ipc-contract `WorkingFileSnapshot` 및 en/ko `team.files.working`/오류 문구를 추가했다. AI SQLite/IPC/locale를 통합할 때 양쪽 기능을 보존한다. shared 생성 서버 계약/parser는 이 저장 단위에서 변경하지 않았다.

로컬 문서와 원본 조건의 고정 사본은 이후 편집/AI 결과 반영과 독립적이고 같은 키의 전송은 saved bytes를 유지한다. 로컬 revision은 서버 기준 revision이 아니다. 저장/working 파일 등록은 AI 결과 자동 게시·검토 공개·납품 확인을 뜻하지 않는다. F12의 원작업/서버 기준/검토 발행은 Codex가 계속 맡는다. 관련 단위 99개/앱 타입 6단계/실제 서버+빌드 Electron roundtrip 1개가 통과했다. D의 진행 중 폴더를 수정하거나 이 커밋을 강제로 합치지 않았다.
