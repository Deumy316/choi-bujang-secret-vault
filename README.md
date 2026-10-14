# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. `/data.json`에는 같은 가상 메모가 공개됩니다. 이 공개 상태를 확인하는 것이 1단계의 출발점입니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

## 2단계 저장점

가상 메모를 정적 data.json에서 제거하고 Supabase로 이동했습니다.
화면은 Vercel 서버 함수 `/api/notes`를 통해 자료를 읽습니다.
Supabase 서버 전용 키는 Vercel 환경 변수에서만 사용하며 브라우저 코드에는 포함하지 않습니다.

현재 `/data.json`에는 메모 내용이 남아 있지 않습니다.
다만 과거 공개 Git 커밋이나 이전 배포에는 기존 가상 메모가 남아 있을 수 있습니다.
또한 현재 `/api/notes` 자체는 공개 주소이므로 인증·권한 제어는 이후 단계에서 보완해야 합니다.

## 3단계 저장점

Supabase Auth 이메일·비밀번호 로그인과 로그아웃을 적용했습니다.
브라우저는 로그인 세션의 access token을 Authorization 헤더로 서버 API에 전달합니다.
서버는 src/verify-login.mjs를 사용해 토큰을 검증하고, 로그인하지 않은 요청은 401 JSON 오류로 거부합니다.

로그인한 사용자는 가상 메모를 추가·수정·삭제할 수 있습니다.
메모 생성 시 서버에서 검증한 사용자 ID를 owner_id에 저장합니다.
현재 단계에서는 소유자 검사를 아직 하지 않으므로 다른 로그인 사용자가 타인의 메모를 접근할 수 있는 한계가 있으며, 이는 4단계에서 보완합니다.

배포 첫 화면에는 X-Content-Type-Options: nosniff 보안 헤더를 적용했습니다.

## 4단계 저장점

서버 API에서 검증된 사용자 ID와 메모의 owner_id를 비교해 소유권 검사를 적용했습니다.
목록 조회는 로그인한 사용자의 메모만 반환하며, 메모 생성 시 서버가 확인한 사용자 ID를 owner_id로 저장합니다.

한 건 조회·수정·삭제는 기존 행의 owner_id가 로그인 사용자와 일치할 때만 허용합니다.
URL이나 요청 본문에서 전달하는 owner_id는 신뢰하지 않습니다.
A와 B는 각자 자신의 메모만 조회·추가·수정·삭제할 수 있으며 상대방 메모 접근은 거부됩니다.

Supabase notes 테이블에는 RLS를 활성화하고 anon의 테이블 권한을 제거했습니다.
authenticated에는 SELECT·INSERT·UPDATE·DELETE만 허용하며 각 정책은 auth.uid() = owner_id 조건으로 제한합니다.

## 5단계 저장점

브라우저의 메모 읽기·추가·수정·삭제는 모두 Vercel 서버 함수를 통해 처리하도록 유지했습니다.
브라우저에서는 Supabase notes 테이블을 직접 호출하지 않습니다.

로그인도 `/api/auth/login` 서버 함수를 통해 처리하도록 변경하여 화면 코드에서 Supabase 공개 키와 createClient 사용을 제거했습니다.
로그인 후 받은 토큰은 서버의 메모 API 요청에만 사용합니다.

Supabase notes 테이블에서 PUBLIC·anon·authenticated의 직접 CRUD 권한을 모두 회수했습니다.
따라서 공개 키나 일반 로그인 토큰으로 원본 REST API를 직접 호출해도 메모 자료에 접근할 수 없습니다.

서버 함수는 기존 SUPABASE_SECRET_KEY를 사용하며, 4단계에서 만든 로그인 검증과 owner_id 소유권 검사는 그대로 유지합니다.

## 6단계 진행 기록: 등록한 기기만 자료실에 들어옵니다

판정기 규칙 ID `device_registered`를 추가했습니다. 요청의 `deviceRegistered`가 `true`인 등록 기기는 `allow / approved`로 판정하고, `false`이거나 누락된 요청은 `deny / device_not_registered`로 거부합니다.

`npm run decider:test`를 실행한 뒤 등록 기기의 허용 결과, 미등록 기기의 거부 결과, 등록 정보가 누락된 요청의 거부 결과를 차례로 확인합니다. 이 시험은 판정기에 전달하는 가상 요청 검증이며 실제 인증서·CA·개인키 설치나 운영 접속 증거가 아닙니다.

## 7단계 저장점: 평소와 다른 접속은 다시 확인합니다

판정기는 엔진 계약의 필드만 사용하며 클라이언트 헤더로 누락된 기기 상태나 추가 확인 결과를 보완하지 않습니다. `judge_fixture` 가상 사건에서 새벽 시각·처음 보는 네트워크·대량 위험 사건이 모두 겹치면 `step_up / step_up_required`로 추가 확인을 요청하며, 지역 변화만으로는 차단하지 않습니다.

추가 확인을 마친 새 가상 요청은 엔진 계약의 `stepUp.verified`가 참이고 `authAgeSeconds`가 0~900초일 때 허용합니다. 현재 실제 경로에는 신뢰 가능한 이상 접속 신호와 동일 사용자의 재로그인 완료 시각 계약이 없으므로 이 복합 판정은 가상 사건에만 적용됩니다.

`npm.cmd run decider:test`로 등록 기기·위조 헤더·복합 이상·추가 확인 결과를 확인하고, `npm.cmd run fixture:7`로 정상 사건의 `allow`와 복합 이상 사건의 `step_up`을 확인합니다. 두 명령은 로컬 가상 요청 연습이며 실제 심판 판정이나 운영 접속 증거가 아닙니다.

## 8단계 저장점: 자료마다 갈 수 있는 구역을 나눕니다

기존 UUID `id`는 그대로 유지하면서 일반 메모는 `vault:note:<UUID>`, 강사 공지는 `vault:instructor-notice:<UUID>` 형식의 `resourceId`로 구분합니다. API 주소와 기존 DB 레코드는 바꾸지 않았습니다.

자료 API는 검증된 로그인 사용자의 ID와 DB `owner_id`를 비교하며, 목록도 DB 조회와 응답 직전 필터에서 요청자 소유 자료만 남깁니다. 일반 사용자의 강사 공지 수정은 403으로 기본 거부하지만 신뢰 가능한 강사 권한 원천이 없어 정상 강사 수정은 아직 지원하지 않습니다.

판정기는 `zone_access` 규칙으로 검증된 `service`, `method`, `path`, `route`의 정확한 조합만 허용합니다. 전체 목록, 공지 쓰기, 기능 이름이 자료 ID 자리에 들어간 경로와 알 수 없는 경로는 `zone_access_denied`로 거부하며, 기존 `device_registered`와 `step_up_required` 규칙도 그대로 유지합니다.

`node --test --test-isolation=none test/resource-id.test.mjs test/notes-ownership.test.mjs`로 자원 ID와 소유권 단위 검사를 다시 실행합니다. 실제 Supabase 계정·DB·RLS 통합과 배포 결과를 증명하는 시험은 아닙니다.

## 9단계 저장점: 도플갱어를 찾고 권한을 거둡니다

탐지기는 공식 가상 사건의 `at`, `method`, `identity.sub`만 읽고 동일 가명 사용자별 GET 요청을 시각순으로 집계합니다. 임의의 10분 구간에서 120건을 초과하면 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }`를 반환하며, 서로 다른 사용자의 조회나 10분 밖의 사건은 합산하지 않습니다.

`propose_revocation`은 로컬 탐지 결과에 따른 회수 제안일 뿐 실제 권한 회수나 접속 차단이 아닙니다. 공식 사건 입력에는 네트워크 변화와 기기 식별자가 없으므로 복합 네트워크 탐지와 특정 기기 회수는 구현하지 않았습니다.

`npm.cmd run detect:test`로 정상 30건, 경계 120건, 폭주 121·200건, 사용자 분리, 시간 구간 분리의 가상 사건 6개를 확인합니다. 이 로컬 시험은 운영 사건 전달이나 실제 회수 집행의 증거가 아닙니다.

## 보너스 XDR

공식 시작 틀의 `xdr/fixtures/*.json`과 `scripts/xdr-run.mjs`를 사용합니다. 무차별 로그인은 28건을 `10/9/9`, 웹 주입은 26건을 `8/9/9`로 block/alert/record 분류하며 정상 이벤트 오차단은 없습니다.

웹 주입 검증은 `npm run xdr:run -- web-injection`으로 다시 실행합니다. 임시 거부 후보는 테스트 프로세스 메모리에서 출발 IP별 10분 동안만 유지되며 운영 방화벽에는 적용하지 않습니다.

## 10단계 제작 4: 복구 후 1~9단계 회귀시험 계획

이 절은 기존 1~9단계 기록을 대체하지 않습니다. 새 복구 기준점은 현재 정책으로 만든 로컬 기준점이며 침해 이전 백업이 아닙니다. Production에는 `20261014000000`~`20261014000003` SQL이 수동 적용되어 복원 RPC, 최소 권한 테이블, `note_id` UNIQUE 인덱스와 신규 메모 생성 RPC가 설치되어 있습니다. 기존 메모 4건은 자동 백업하지 않았으며 시험 계정 B의 검증된 사전 백업은 0건입니다. 공식 심판 복원 요청 계약은 여전히 미확인입니다.

신규 `POST /api/notes`는 검증된 로그인 사용자의 ID만 소유자로 사용하고 `create_note_with_initial_backup` RPC에서 메모와 승인된 최초 사본을 한 트랜잭션으로 생성합니다. 이후 PUT/DELETE는 최초 사본을 변경하지 않습니다. 기존 메모를 정상 원본으로 간주하거나 소급 백업하지 않습니다.

복원 요청의 `judge_run_id`는 JWT의 실행 ID를 유지하고 `request_id`는 호출별 UUID로 분리합니다. 같은 복원 요청을 재시도할 클라이언트는 UUID v4 `Idempotency-Key` 헤더를 동일하게 보내며, 생략하면 서버가 새 키를 발급해 응답 헤더에 돌려줍니다.

복원 권한은 별도의 고정 subject 환경변수를 사용하지 않습니다. 공식 issuer가 서명한 `role=judge`, `aleph_identity=b` JWT의 UUID `sub`를 호출자 ID로 사용하고, RPC가 승인 백업과 현재 메모의 `owner_id` 일치를 다시 검사합니다.

기본 복원 경로는 `POST /api/notes/restore`이며 본문 `{ "id": "UUID" }`를 받습니다. 호환 경로 `POST /api/notes/:id/restore`도 같은 처리기를 사용하되 URL의 ID만 대상으로 삼고, 본문 ID가 다르거나 다른 필드가 있으면 인증 확인 뒤 거부합니다. 공식 `restoreRoute` 계약은 확인되지 않아 설정값은 기존 `/api/notes/restore`를 유지합니다. 두 경로 모두 승인된 B 백업이 필요하며 현재 Production 승인 백업은 0건이므로 실제 복원 성공은 미검증입니다.

상태는 `통과`(이미 실행한 로컬 시험), `미실행`(아직 실행 증거 없음), `중단`(선행 복원 실패로 실행하지 않음)으로 기록합니다. 로컬 가상 요청 결과를 운영 검증이나 공식 심판 통과로 해석하지 않습니다.

### 복원 선행 게이트

| 순서 | 확인 항목과 실행 명령 | 기대 결과 | 실제 결과 | 상태 |
| --- | --- | --- | --- | --- |
| R1 | 기준점 비교: `node scripts/compare-policy-backup.mjs` | 버전 `recovery-baseline-2026-10-14.1`, SHA-256 일치, 현재 정책과 변경 없음 | 기준점 무결성과 변경 없음 확인 | 통과 |
| R2 | 시험 정책 미리보기: `node scripts/restore-test-policy.mjs` | 기본 동작은 dry-run이며 운영 `src/decider.mjs`를 변경하지 않음 | dry-run 및 운영 정책 불변 확인 | 통과 |
| R3 | 정책 안전성: `node --test --test-isolation=none test/policy-backup.test.mjs test/policy-restore.test.mjs` | 백업 변조·검증 누락·경로 이탈은 거부되고 격리 파일만 원자적으로 복원됨 | 비교 3/3, 복원 3/3 통과 | 통과 |
| R4 | 메모 복원 단위시험: `node --test --test-isolation=none test/note-restore.test.mjs` | 검증된 B의 `sub`만 RPC 호출자 ID로 전달하고 A·잘못된 대상·소유자 불일치·DB 오류를 거부하며 동일 멱등 키 재시도를 재사용함 | API/RPC 경계 4/4 통과 | 통과 |
| R4-DB | 빈 격리 PostgreSQL 16의 `byteback_restore_test`에서 `test/sql/note-restore.integration.sql` 실행 | 변조·삭제 복원, 다른 메모 보존, 감사 추가, 권한·무결성 실패 롤백 | 임시 로컬 DB에서 통과; Production SQL은 수동 적용됐으나 실제 복원은 미실행 | 통과(격리) |
| R5 | 격리 HTTP·DB에서 `POST /api/notes/restore` 호출 | DB 반영과 사후 내용 해시가 일치하고 다른 메모·감사 기록은 불변 | Production RPC는 설치됐지만 검증된 B 백업 0건, 실제 HTTP 복원 및 심판 계약 미확인 | 미실행 |

R1~R5 중 해당 실행 환경에 필요한 게이트가 실패하면 아래 회귀시험을 시작하지 않습니다. 특히 기준점·메모 백업의 해시 또는 검증 기록 불일치, 복원 대상 경로 이탈, 원자적 교체 실패, RPC 오류, 사후 SHA-256 불일치, 지정한 한 건 외의 변경은 즉시 중단 조건입니다. 실제 메모 복원을 검증해야 하는 실행에서는 R5가 통과하기 전 HTTP·DB 회귀시험을 실행하지 않습니다.

### 1~9단계 회귀 순서

| 순서 | 단계와 실행 명령 또는 요청 | 정상 요청 기대 결과 | 금지 요청 기대 결과 | 실제 결과 | 상태 |
| --- | --- | --- | --- | --- | --- |
| 1 | 1단계 정적 화면: 격리 배포에서 `GET /`, `GET /data.json` | 화면은 열리고 공개 가능한 가상 자료만 표시됨 | `/data.json`에서 비공개 메모가 노출되지 않음 | 복구 후 HTTP 확인 안 함 | 미실행 |
| 2 | 2단계 서버 자료 경로: 인증된 `GET /api/notes` | 서버 API가 요청자 자료를 반환함 | 정적 파일이나 브라우저 코드가 DB 원문·서버 키를 노출하지 않음 | 격리 DB·HTTP 확인 안 함 | 미실행 |
| 3 | 3단계 로그인: `POST /api/auth/login` 후 Bearer 토큰으로 메모 API 호출 | 유효한 A/B 시험 계정은 각자 인증됨 | 무토큰·변조·만료 토큰은 401로 거부됨 | 실제 계정·HTTP 확인 안 함 | 미실행 |
| 4 | 4단계 소유권: `node --test --test-isolation=none test/notes-ownership.test.mjs test/resource-id.test.mjs` | A의 자기 자료 접근과 올바른 자원 ID는 허용됨 | B→A GET·PUT·DELETE와 A 자료 목록 노출은 거부됨 | 로컬 7/7 통과; DB·HTTP는 확인 안 함 | 통과(단위) |
| 5 | 5단계 원본 DB 차단: 격리 환경에서 Vercel API와 Supabase REST를 각각 호출 | 인증된 서버 API CRUD만 동작함 | 공개 키·일반 사용자 토큰의 원본 REST CRUD는 거부됨 | 실제 RLS·DB·HTTP 확인 안 함 | 미실행 |
| 6 | 6단계 등록 기기: `npm.cmd run decider:test` | `deviceRegistered: true`인 정상 단건 요청은 `allow` | false·누락·헤더 위조는 `deny / device_not_registered` | 로컬 판정기 전체 24/24 통과에 포함 | 통과(가상) |
| 7 | 7단계 추가 확인: `npm.cmd run decider:test`; 보조 확인 `npm.cmd run fixture:7` | 정상 접속은 `allow`, 검증된 최신 추가 확인은 `allow` | 복합 이상·헤더 위조·901초 결과는 `step_up / step_up_required` | decider 사례는 통과; `fixture:7` 복구 후 재실행 안 함 | 일부 통과·일부 미실행 |
| 8 | 8단계 자료 구역: 위 4단계 단위시험과 `npm.cmd run decider:test` | A 자기 메모의 허용된 단건 경로만 허용됨 | B→A 접근, 전체 목록, 공지 쓰기, route 불일치, 기능명·미지 경로는 `zone_access_denied` | 소유권 7/7 및 decider 24/24 로컬 통과; DB·HTTP는 확인 안 함 | 통과(단위·가상) |
| 9 | 9단계 과다 조회: `npm.cmd run detect:test`; 선택적 XDR `npm.cmd run xdr:run -- web-injection` | 30건·경계 120건과 사용자·시간 분리는 `observe` | 같은 사용자의 10분 내 121건 초과는 `propose_revocation / burst_read` | 복구 후 재실행 안 함; 운영 사건 전달·회수 집행도 미확인 | 미실행 |

각 실행 뒤에는 실제 결과와 시각을 이 표에 기록하고, 예상과 다르면 `통과`로 바꾸지 않습니다. 전체 HTTP·DB 회귀시험은 검증된 B 백업, 격리 시험 DB, 적용된 RPC, 확인된 호출 계약이 준비된 뒤에만 진행합니다. 명령 실행 화면은 프로젝트 터미널이며, HTTP·DB 결과 확인 화면은 격리 시험 배포의 응답과 시험 DB 감사 화면입니다. 정상 결과는 본인·등록 기기·검증된 추가 확인·허용 구역 요청의 성공이고, 반드시 거부되어야 할 결과는 무인증, B→A, 미등록 기기, 추가 확인 미완료, 구역 이탈, 과다 조회입니다.

### 10단계 로컬·격리 검증 기록 (2026-10-14)

`npm.cmd run restore:test`로 ES256 judge JWT 검증, 정책 비교·시험 정책 복원, 메모 생성·복원 입력·응답 검증 및 JavaScript UTF-8 SHA-256 고정 벡터를 함께 확인합니다. 신규 생성 시험을 포함한 전체 명령은 이번 저장점 직전에 재실행하지 않았으며, 가장 최근 최소 인증·복원 시험은 6/6 통과했습니다. `npm.cmd run test:r5`, `npm.cmd run decider:test`, `npm.cmd run fixture:7`, `npm.cmd run detect:test`의 기존 결과는 각각 2/2, 24/24, 정상 allow·복합 이상 step_up, 6/6 통과였습니다. 모두 로컬 fixture 결과이며 운영 심판 판정이 아닙니다.

PostgreSQL 통합시험은 운영 DB가 아닌 빈 임시 PostgreSQL 16 클러스터의 `byteback_restore_test` DB에서 `psql -X -v ON_ERROR_STOP=1 -f test/sql/note-restore.integration.sql`로 실행합니다. DB 이름이 다르면 시험 파일이 즉시 중단합니다. 실제 실행에서 마이그레이션 적용, JS·PostgreSQL 해시 일치, 변조 메모 갱신, 삭제 메모 재생성, 타 소유자·미승인 백업 거부, 다른 메모 보존, 복원별 감사 한 줄 추가, 감사 추가 실패 시 전체 롤백을 확인했습니다.

Production Supabase에는 `20261014000000`~`20261014000003` SQL을 수동 적용했지만 백업·감사 행은 0건이고 검증된 B 사전 백업도 없습니다. 실제 judge JWT 기반 HTTP 복원, Production DB 반영, 공식 심판 계약과 평가는 미확인입니다. `xdr:run`은 기존 `xdr/alerts.log`를 보존하기 위해 이번 회귀시험에서 실행하지 않았습니다.
