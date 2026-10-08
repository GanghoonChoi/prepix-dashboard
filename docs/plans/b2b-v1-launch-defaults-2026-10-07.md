# 유저 위임 기본값 (2026-10-07), 언제든 변경

유저가 남은 결정을 메인 추천대로 하라고 위임했다("다 너의 추천대로 하면 되겠는데?"). 아래 값은 **승인된 사업 값이 아니라 위임받은 출시 기본값**이며 언제든 바꿀 수 있다. 숫자는 코드 로직에 넣지 않고, 서버가 이미 읽는 설정(`B2B_*_JSON`·환경 변수)의 모양 그대로 한 파일에 모았다.

- 값의 원본: 서버 `backend/scripts/fixtures/b2b-launch-defaults.cjs`
- 검증: 서버 `backend/src/b2b/launch-defaults.spec.ts` — 각 값을 운영 파서(`parseTeamProduct`·`parseBillingSettings`·`parseStatementSettings`·`parseLegalRetention`·`parseTeamDeletionPolicy`·`parseFilePolicy`·`parseOpsPolicy`)로 읽고 견적 금액·달력·보관 연수를 단언한다.
- 미리보기(가짜 PG로 판매): `B2B_TEST_ENABLED=true B2B_TEST_NEW_TEAMS=true B2B_TEST_BILLING=true B2B_TEST_LAUNCH_DEFAULTS=true`(+ 지원 허용을 볼 때 `B2B_TEST_OPS_POLICY_JSON`에 운영자 명단) — `workspaces-preview.cjs`가 아래 env를 주입한다. 실환경은 같은 JSON을 같은 env 이름으로 넣는다.
- 바꾸는 법: 파일의 값을 고치고 `version`을 올린다(상품·견적은 버전별로 보존되므로 같은 버전 문자열로 다른 값을 넣으면 거절된다). 시험이 새 값을 단언하도록 함께 고친다.
- **법무 확인 필요**: 보관 기간, 공휴일 목록, 환불·청약철회 문구, 결제 재시도 고지.

## 상품 (`B2B_PRODUCT_JSON`)

| 항목 | 값 | 비고 |
| --- | --- | --- |
| 팀 기본 상품 (Business) | 편집 좌석 3개 포함 = **최소 3석**, 공급가 월 387,000원(**부가세 별도**, 결제액 425,700원) | 유저 결정 2026-10-08: 1석 공급가 129,000원, 3인 이상. 상품 버전 `business-2026-10-v1`. (이전 값: 2석 77,000원 부가세 포함) |
| 추가 좌석 | **공급가 월 129,000원(부가세 별도)** | 합계 공급가 = 129,000 × 좌석 수. 부가세 10%는 결제 시 더해진다 |
| 좌석당 AI | 개인 요금제 `plan_definitions.id='creator'`와 같음 → `seatAiUnits` 36,000초(600분) | 팀원 간 사용량 공유(풀링)는 별도 프로젝트. **운영 값은 실제 `creator` 행과 같아야 한다**(시험이 시드와 대조) |
| 저장 용량 | 팀 기본 3TB(3×10^12 바이트) | 초과 시 업로드 차단(`B2B_FILE_STORAGE_FULL`), 자동 과금 없음 — 이미 구현 |
| 전송 포함량 | 3TB | **미위임 임시값**(저장만 하고 집행하는 코드 없음) |
| 저장 추가 팩 | 1TB, 공급가 30,000(33,000원) | **미위임 임시값**(스키마가 필수로 요구). 상품 책임자 확인 |
| 반올림·유효기간 | 부가세 10%, 금액 `half_up`, 제공량 `floor`, 견적 15분, 주문 30분 | |

## 결제 (`B2B_BILLING_SETTINGS_JSON`, PG `B2B_TOSS_*`)

| 항목 | 값 |
| --- | --- |
| 표시 | 부가세 포함 금액 표시(공급가·부가세는 명세에 분리) |
| PG | 토스페이먼츠(기존 연동), v1은 **카드만**(`B2B_TOSS_METHODS_JSON=["카드"]`). 계좌이체·세금계산서는 나중 |
| 자동결제 | 기간 끝(E) 8일 전 첫 청구, 실패 시 **7일에 걸쳐 3번 재시도**(1일·3일·3일 뒤), 모두 E 전. E가 지나면 구매는 복구로 바뀐다 |
| 환불 | 이미 구현된 법정 하한: 7일 안·미사용이면 전액(청약철회), 기간 중에는 남은 기간 비례. 정책 버전 `launch-refund-2026-10-07` |
| 자동결제 동의 갱신 | 상품 버전이 바뀔 때 31일 전 안내·30일 동의 창(기존 로컬 값 유지, 미위임) |
| 메일 | 기존 이메일 공급자 그대로(문서만) |

## 명세서 (`B2B_BILLING_SETTINGS_JSON.statements`)

- KST 한 달의 명세는 **그 달이 끝난 뒤 첫 한국 영업일**에 발행(`issueBusinessDay: 1`, 주말 제외).
- 공휴일 목록 2026–2027(대체공휴일·2026-06-03 지방선거일 포함). 음력 날짜·임시공휴일은 **운영·법무 확인 필요**(예: 제헌절 공휴일 재지정 여부). 목록은 삭제 정책·지원 허용 달력과 같은 값을 쓴다.
  - 2026: 01-01, 02-16~18, 03-02, 05-05, 05-25, 06-03, 08-17, 09-24, 09-25, 10-05, 10-09, 12-25
  - 2027: 01-01, 02-08, 02-09, 03-01, 05-05, 05-13, 08-16, 09-14~16, 10-04, 10-11, 12-27
- 고객 명세서에는 AI 항목이 없다(결정 #2, 새 회차부터; 이미 발행한 PDF는 바이트 그대로).

## 보관 (`B2B_LEGAL_RETENTION_JSON`) — 법무 확인 필요

| 기록 | 기간 | 설정 |
| --- | --- | --- |
| 거래·결제·청약철회 | 5년 | `transactionYears` |
| 소비자 불만·분쟁 | 3년 | `disputeYears` |
| 접속 기록 | 2년 | `accessLogYears` |
| 감사 기록 | 3년 | 문서만 — 이 값을 읽어 파기하는 코드가 아직 없다 |
| 지원 건 | 3년 | 문서만 — 같음 |
| 알림 | 1년 | 문서만 — 같음 |

## 팀 삭제 (`B2B_TEAM_DELETION_POLICY_JSON`)

- `sourceBusyStaleSeconds` 3600, 영업일 달력 = 위 공휴일 목록(`validThrough` 2027-12-31).
- 나머지(`quiesceSeconds` 300, `objectLeaseSeconds` 120, `objectRetrySeconds` 60, `maxObjectAttempts` 10, `backupPurgeDays` 30)는 **미위임 임시값**(문서 범위 안).
- 백업: Cloudflare R2 별도 버킷 + 버킷 잠금(결정 #19). 서버 `B2B_BACKUP_ADAPTER=s3`, `B2B_BACKUP_S3_{BUCKET,ENDPOINT,ACCESS_KEY,SECRET_KEY,REGION,PATH_STYLE}`. 잠금 규칙은 `tombstones/` 접두사에만. 실제 버킷·키는 실환경 작업(서버 `docs/b2b-team-lifecycle-deletion.md` §7).

## 지원 접근 (`B2B_OPS_POLICY_JSON`)

- 승인자 = 콘솔 `approve` 권한을 가진 운영자(운영자 명단은 실환경 값).
- 허용 1건 최대 **24시간**(`grants.maxMinutes` 1440), 행동 `list`·`download`. 달력은 위 공휴일 목록.

## 장애 대응 (문서만)

- 첫 응답: **1영업일 안**.
- 보상: 장애 시간만큼 **기간 비례 크레딧**.

## 파일 정책 (`B2B_FILE_POLICY_JSON`)

| 항목 | 위임 값 | 지금 설정 |
| --- | --- | --- |
| 영상 | mp4/mov/mxf/mkv/webm/avi | `mov`(mp4·mov), `matroska`(mkv·webm), `avi`. **mxf는 검사기 허용 목록에 없음** |
| 오디오 | wav/mp3/aac/m4a/flac | `wav`, `mp3`, `flac`, m4a는 `mov`. **aac(ADTS)는 없음** |
| 이미지 | jpg/jpeg/png/tif/tiff/psd | `jpeg_pipe`, `png_pipe`. **tif/tiff/psd는 없음** |
| 프로젝트 파일 | prproj/drp/fcpxml/xml/aep/aaf/edl/srt/vtt | **검사기가 다루지 못함**(미디어가 아님). 앱 고유 작업 파일(`native`, 64MiB·소스 2,000)만 |
| 최대 크기 | 파일당 50GB | **2,147,483,647바이트(약 2GiB)** — 검사기(ClamD) 상한. 이보다 크게 설정하면 업로드 전체가 꺼진다 |

허용 목록(`FILE_FORMATS`)은 "제한된 자족 형식만"이라는 보안 규칙이라 이번 위임으로 넓히지 않았다. 50GB와 미지원 형식은 대용량 검사 경로·형식별 검사기가 필요한 **열린 항목**이다.

## 공유 링크

- 기본 만료 7일 그대로, 직접 지정 상한 30일(`B2B_REVIEW_SHARE_MAX_DAYS`, **미설정이면 30**).

## 철회된 위임 항목

- 21번(팀 범위에서 사본을 지울 수 없는 STT/TTS 공급자 거절)은 **철회** — 유저: "팀 공간은 개인과 동일". 팀 범위도 개인과 같은 공급자를 쓰고, 공급자가 보관하는 사본은 개인과 같은 수동 런북(서버 `docs/personal-ai-proxy.md` §8)으로 처리한다.
