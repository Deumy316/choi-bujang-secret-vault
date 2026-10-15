const planned = (id, stage, name, requestType, kind, expected, source) => Object.freeze({
  id,
  stage,
  name,
  requestType,
  kind,
  expected,
  actual: null,
  requestId: null,
  checkedAt: null,
  executed: false,
  status: 'not_run',
  evidenceSource: `검증 계획: ${source}`,
  targetEnvironment: 'not_recorded',
  targetCommit: null,
  suite: 'project_regression',
});

const CHECKS = Object.freeze([
  planned('S01-NORMAL', 1, '배포 루트 화면 조회', 'GET /', 'normal', 'HTTP 200', 'README 1단계'),
  planned('S01-FORBIDDEN', 1, '공개 경로의 보호 메모 노출 확인', 'GET /data.json', 'forbidden', '보호 메모 미노출', 'src/attack-check.mjs'),
  planned('S02-NORMAL', 2, '서버 자료 API 사용', 'GET /api/notes', 'normal', '인증·기기 승인 후 HTTP 200', 'README 2단계'),
  planned('S02-FORBIDDEN', 2, '비로그인 자료 API 접근', 'GET /api/notes', 'forbidden', 'HTTP 401 또는 403', 'src/attack-check.mjs'),
  planned('S03-NORMAL', 3, '정상 로그인', 'POST /api/auth/login', 'normal', 'HTTP 200', 'README 3단계'),
  planned('S03-FORBIDDEN', 3, '잘못된 로그인', 'POST /api/auth/login', 'forbidden', '인증 거부', 'README 3단계'),
  planned('S04-NORMAL', 4, '본인 메모 한 건 조회', 'GET /api/notes/:id', 'normal', 'HTTP 200', 'README 4단계'),
  planned('S04-FORBIDDEN', 4, '다른 소유자 메모 조회', 'GET /api/notes/:id', 'forbidden', 'HTTP 403 또는 404', 'README 4단계'),
  planned('S05-NORMAL', 5, '서버 중계 자료 조회', 'GET /api/notes', 'normal', 'HTTP 200', 'README 5단계'),
  planned('S05-FORBIDDEN', 5, '원본 REST API 직접 접근', 'GET originalApiUrl', 'forbidden', '접근 거부', 'README 5단계'),
  planned('S06-NORMAL', 6, '등록 기기 판정', 'decide(request)', 'normal', 'allow / approved', 'docs/DECIDER_REQUEST.md'),
  planned('S06-FORBIDDEN', 6, '미등록 기기 판정', 'decide(request)', 'forbidden', 'deny / device_not_registered', 'docs/DECIDER_REQUEST.md'),
  planned('S07-NORMAL', 7, '일상 접속 판정', 'decide(request)', 'normal', 'allow', 'scripts/fixture-7.mjs'),
  planned('S07-FORBIDDEN', 7, '복합 이상 접속 판정', 'decide(request)', 'forbidden', 'step_up / step_up_required', 'scripts/fixture-7.mjs'),
  planned('S08-NORMAL', 8, '본인 자료 구역 접근', 'decide(request)', 'normal', 'allow', 'README 8단계'),
  planned('S08-FORBIDDEN', 8, '다른 자료 구역 접근', 'decide(request)', 'forbidden', 'deny / zone_access_denied', 'README 8단계'),
  planned('S09-NORMAL', 9, '정상 조회량 탐지', 'detect(events)', 'normal', 'observe', 'docs/DETECT_EVENTS.md'),
  planned('S09-FORBIDDEN', 9, '10분 초과 조회 탐지', 'detect(events)', 'forbidden', 'propose_revocation / burst_read', 'docs/DETECT_EVENTS.md'),
  planned('S10-NORMAL', 10, '승인 사본 단건 복원', 'POST /api/restore/:noteId', 'normal', '복원 후 ID·소유자·해시 일치', 'README 10단계'),
  planned('S10-FORBIDDEN', 10, '미검증 사본 복원', 'POST /api/restore/:noteId', 'forbidden', '무변경 중단', 'README 복원 실행 게이트'),
  planned('S11-NORMAL', 11, '승인 기기의 보호 자료 접근', 'GET /api/notes', 'normal', 'HTTP 200', 'README 11단계'),
  planned('S11-FORBIDDEN', 11, '미승인·취소·만료 기기 접근', 'GET /api/notes', 'forbidden', 'HTTP 403', 'README 11단계'),
]);

export function listVerificationChecks() {
  return CHECKS;
}

export const regressionPlan = Object.freeze({
  plannedTotal: CHECKS.length,
  evidenceCount: CHECKS.filter(check => check.executed).length,
  status: 'not_run',
  evidenceSource: 'static_plan_only',
});

export const bundleSelfCheck = Object.freeze({
  expectedTotal: 6,
  getCheckCount: 3,
  notRunCount: 3,
  status: 'results_unavailable',
  evidenceSource: 'source_contract_only',
  targetEnvironment: 'bundle_local',
});

export const officialAttackSuite = Object.freeze({
  expectedTotal: 41,
  specification: 'not_found_in_repository',
  executedCount: null,
  status: 'unknown',
  evidenceSource: 'not_available',
});
