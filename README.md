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

## 8단계 중간 저장점: 자료마다 갈 수 있는 구역을 나눕니다

기존 UUID `id`는 그대로 유지하면서 일반 메모는 `vault:note:<UUID>`, 강사 공지는 `vault:instructor-notice:<UUID>` 형식의 `resourceId`로 구분합니다. API 주소와 기존 DB 레코드는 바꾸지 않았습니다.

자료 API는 검증된 로그인 사용자의 ID와 DB `owner_id`를 비교하며, 목록도 DB 조회와 응답 직전 필터에서 요청자 소유 자료만 남깁니다. 일반 사용자의 강사 공지 수정은 403으로 기본 거부하지만 신뢰 가능한 강사 권한 원천이 없어 정상 강사 수정은 아직 지원하지 않습니다.

판정기의 경로 기본 거부는 운영 등록부에 맞는 일반 접근 거부 `reasonCode`가 없어 구현하지 않았습니다. 기존 `device_registered`와 `step_up_required` 규칙은 그대로 유지합니다.

`node --test --test-isolation=none test/resource-id.test.mjs test/notes-ownership.test.mjs`로 자원 ID와 소유권 단위 검사를 다시 실행합니다. 실제 Supabase 계정·DB·RLS 통합과 배포 결과를 증명하는 시험은 아닙니다.

## 보너스 XDR

공식 시작 틀의 `xdr/fixtures/*.json`과 `scripts/xdr-run.mjs`를 사용합니다. 무차별 로그인은 28건을 `10/9/9`, 웹 주입은 26건을 `8/9/9`로 block/alert/record 분류하며 정상 이벤트 오차단은 없습니다.

웹 주입 검증은 `npm run xdr:run -- web-injection`으로 다시 실행합니다. 임시 거부 후보는 테스트 프로세스 메모리에서 출발 IP별 10분 동안만 유지되며 운영 방화벽에는 적용하지 않습니다.
