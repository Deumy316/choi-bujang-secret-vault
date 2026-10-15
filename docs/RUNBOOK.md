# BYTE BACK 설치·운영·복구 절차

이 문서는 공개 저장소를 새로 받은 사람이 현재 구성을 재현하기 위한 절차입니다. 명령은 저장소 소스에서 확인한 것만 적었으며, Production DB 변경·기기 승인·복원은 자동 실행하지 않습니다.

## 구성과 책임

| 구성 | 위치 | 역할 |
|---|---|---|
| ALEPH SDP 엔진 | 교육 과정 제공 | 검증한 요청을 학생 판정기로 전달하고 최종 판정을 수행하는 제공 구성요소 |
| 학생 판정기 | `src/decider.mjs` | 등록 기기, 추가 확인, 자료 구역 규칙 판정 |
| 탐지 규칙 | `src/detect.mjs` | 제공된 가상 사건에서 10분 과다 조회 회수 제안 |
| 회수·XDR 연습 | `xdr/`, `scripts/xdr-run.mjs` | 무차별 로그인·웹 주입 fixture 분류와 임시 거부 후보 산출 |
| 접속 앱 | `public/`, `api/device/` | PWA, 로그인, 기기 요청·상태·관리자 승인 화면 |
| 자료실 | `api/notes*`, Supabase `notes` | 인증·기기 승인·소유권을 적용한 메모 CRUD |
| 탈환 작전실 | `api/operations/status.js`, `src/operations-*.mjs` | 현재 상태 카드와 22개 회귀 계획 조회 |
| 정책 복구 | `backups/policy/`, `scripts/compare-policy-backup.mjs`, `scripts/restore-test-policy.mjs` | 기준점 검증·diff·격리 시험 정책 복원 |
| 메모 복구 | `src/note-restore.mjs`, `api/restore/`, `supabase/migrations/20261014000000*` | 승인 사본 한 건의 원자적 복원과 감사 추가 |

학생 코드는 제공 ALEPH SDP 엔진 자체를 포함하거나 대체하지 않습니다.

## 준비 도구와 설치

- Git
- Node.js 22 이상과 함께 설치되는 npm
- 전체 서버리스 API를 로컬에서 실행하려면 Vercel 호환 개발 런타임이 추가로 필요합니다. 이 저장소는 Vercel CLI 버전이나 `dev` 스크립트를 고정하지 않습니다.
- DB 구조를 새로 구성할 때만 Supabase 프로젝트와 SQL Editor 또는 동등한 마이그레이션 실행 수단이 필요합니다.

```powershell
git clone https://github.com/Deumy316/choi-bujang-secret-vault.git
cd choi-bujang-secret-vault
node --version
npm install
```

`package-lock.json`은 lockfile v3이며 `package.json`과 직접 의존성 버전이 일치합니다. 설치는 npm registry 네트워크와 해당 패키지 가용성에 의존합니다. 이번 제작에서는 새 Clone 설치를 실제 실행하지 않았습니다.

## 환경변수

값은 로컬 비추적 환경 설정이나 Vercel의 비밀 입력란에만 넣고 문서·Git·로그에 출력하지 않습니다.

| 이름 | 용도 | 없을 때 |
|---|---|---|
| `SUPABASE_URL` | Supabase Auth·DB 프로젝트 주소 | 로그인, 기기 상태, 메모와 복구 서버 함수가 안전하게 실패 |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase 접근과 JWT 검증 지원 | 위 서버 함수가 안전하게 실패 |
| `DEVICE_APPROVAL_ADMIN_SUBJECTS` | 쉼표로 구분한 승인 관리자 JWT `sub` UUID 목록 | 관리자 목록·결정 API 사용 불가 |

`VERCEL_GIT_PROVIDER`, `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_URL`은 Vercel 배포 빌드가 제공하는 신원 값입니다. 수동 비밀값으로 만들지 않습니다. 로그인 발급자·JWKS·audience와 공개 URL은 `aleph.config.json`에 공개 메타데이터로 기록됩니다.

## 로컬 빌드와 실행

정적 결과만 확인하는 소스 내 명령은 다음과 같습니다.

```powershell
npm run build -- --local
```

결과는 `public/`에 생성됩니다. 이 명령은 서버리스 API, Supabase, 운영 판정이나 Production 배포를 실행하지 않습니다. 정적 서버를 별도로 사용했다면 해당 프로세스에서 `Ctrl+C`로 중지합니다.

로그인·기기 승인·메모·작전실 상태 API까지 로컬에서 확인하려면 위 환경변수와 Vercel 호환 함수 런타임이 필요합니다. 저장소에 고정된 로컬 `start`/`dev` 명령이 없으므로 사용 중인 Vercel CLI의 공식 절차를 확인해야 합니다. 실행 프로세스는 `Ctrl+C`로 중지하며, 종료가 DB의 승인·메모·감사 행을 삭제하지는 않습니다.

Vercel CLI를 별도로 설치하고 프로젝트를 연결한 환경의 표준 실행 명령은 다음과 같습니다. CLI 버전은 이 저장소에서 고정하지 않았고 이번 제작에서 실행하지 않았으므로, 실제 접속 주소와 로그인 요구사항은 CLI 출력으로 확인합니다.

```powershell
vercel dev
```

선택적인 로컬 자기 점검 명령은 `package.json`의 `decider:test`, `detect:test`, `fixture:7`, `restore:test`, `test:r5`, `xdr:run`입니다. 이 결과는 공식 심판이나 Production 실측이 아닙니다. `xdr:run`은 `xdr/alerts.log`를 변경할 수 있으므로 기존 기록을 보존해야 할 때 실행하지 않습니다.

## 새 DB 준비

마이그레이션은 자동 적용되지 않습니다. 새 Supabase 프로젝트에서 실제 스키마·권한을 먼저 대조하고 다음 파일을 시간 순서로 검토·수동 적용합니다.

1. `20261014000000_restore_single_verified_note.sql`
2. `20261014000001_minimize_restore_table_privileges.sql`
3. `20261014000002_add_notes_note_id_unique.sql`
4. `20261014000003_create_note_with_initial_backup.sql`
5. `20261015000000_device_registrations.sql`

기존 데이터가 있는 DB에서는 중복 `note_id`, 기존 함수·테이블 충돌과 권한을 읽기 전용으로 먼저 확인합니다. 마이그레이션은 기존 메모를 검증 백업으로 소급 승인하지 않습니다.

## 정책 백업 확인과 복구

읽기 전용 비교:

```powershell
node scripts/compare-policy-backup.mjs
```

격리 시험 정책 dry-run:

```powershell
node scripts/restore-test-policy.mjs
```

실제 격리 시험 파일을 복원하려면 미리보기에서 확인한 정확한 기준점 버전을 사용합니다.

```powershell
node scripts/restore-test-policy.mjs --apply --approve=recovery-baseline-2026-10-14.1
```

이 스크립트는 `test/policy-sandbox/decider.mjs`만 대상으로 하며 운영 `src/decider.mjs`를 덮어쓰지 않습니다. 사본·버전·SHA-256·검증 기록이 하나라도 맞지 않으면 변경 없이 중단합니다.

## 자료실 메모 복구

대표 경로는 `POST /api/restore/:noteId`이며 기존 호환 경로도 `aleph.config.json`에 기록되어 있습니다. 호출에는 검증된 judge B JWT, 승인된 기기, 해당 호출자 소유의 승인 백업, 설치된 `restore_single_verified_note` RPC가 필요합니다. 서버는 ID·소유자·제목·본문·레코드 SHA-256을 확인하고 한 건 복원과 감사 추가를 같은 트랜잭션에서 처리합니다.

백업 부재나 검증 실패는 정상적인 무변경 중단입니다. 기존 메모를 현재 정상으로 추정해 백필하거나 승인하지 않습니다. 실제 Production 복원은 이 문서 절차 작성 과정에서 실행하지 않았습니다.

## 배포와 재현 확인

Vercel 설정은 `vercel.json`의 `npm run build`와 `public` 출력 디렉터리를 사용합니다. Git 연동 배포 후 다음을 대조합니다.

1. `/`가 공개 셸을 반환하는지 확인합니다.
2. `/aleph.json`의 `step`, 전체 `commit`, canonical `publicAppUrl`, `restoreRoute`가 Git의 설정과 같은지 확인합니다.
3. 무인증 보호 API가 자료를 반환하지 않는지 읽기 요청으로 확인합니다.
4. 로그인한 승인 기기에서만 메모와 작전실 상태가 보이는지 확인합니다.
5. 작전실에서 실행하지 않은 22개 회귀 항목과 공식 41종을 통과로 표시하지 않는지 확인합니다.

Vercel 배포를 중지하거나 비활성화하는 저장소 명령은 없습니다. 운영 중지는 Vercel 프로젝트의 접근 권한을 가진 관리자가 플랫폼에서 수행해야 하며, DB 삭제·환경변수 노출·Git 이력 변경과 혼동하지 않습니다.

## 제출 전 확인

- 12단계 제출 저장점의 `aleph.config.json` step은 12입니다.
- `src/decider.mjs`는 `docs/DECIDER_REQUEST.md`의 필드만 읽고 응답의 `ruleIds`는 `RULE_IDS`에 있는 규칙만 사용하도록 정적으로 확인했습니다.
- 새 Clone `npm install`, 전체 가상 요청, Production HTTP·DB 회귀와 공식 41종은 이 문서 작성 과정에서 실행하지 않았습니다.
- `bundle-notes.json`과 `artifacts/submission.json`, 비밀값과 개인정보는 커밋하지 않습니다.
