import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !ruleIds.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious } = fixtureRequests();
  const notePath = `/notes/${randomUUID()}`;
  const checks = [
    { name: '등록 기기의 정상 요청', request: normal, decision: 'allow' },
    { name: '정상 메모 한 건 수정', request: { ...normal, requestId: randomUUID(),
      method: 'PUT', path: notePath, route: 'PUT /notes/:id' }, decision: 'allow' },
    { name: '정상 메모 생성', request: { ...normal, requestId: randomUUID(),
      method: 'POST', path: '/notes', route: 'POST /notes' }, decision: 'allow' },
    { name: '정상 메모 한 건 삭제', request: { ...normal, requestId: randomUUID(),
      method: 'DELETE', path: notePath, route: 'DELETE /notes/:id' }, decision: 'allow' },
    { name: '읽기 전용 공식 demo 수정', request: { ...normal, requestId: randomUUID(),
      method: 'PUT', route: 'PUT /notes/:id' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '읽기 전용 공식 demo 삭제', request: { ...normal, requestId: randomUUID(),
      method: 'DELETE', route: 'DELETE /notes/:id' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '메모 전체 목록', request: { ...normal, requestId: randomUUID(),
      path: '/notes', route: 'GET /notes' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '슬래시가 붙은 메모 전체 목록', request: { ...normal, requestId: randomUUID(),
      path: '/notes/', route: 'GET /notes' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '다른 서비스의 단건 경로', request: { ...normal, requestId: randomUUID(),
      service: 'notices', path: notePath }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '일치하지 않는 단건 route', request: { ...normal, requestId: randomUUID(),
      path: notePath, route: 'GET /notices/:id' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '강사 공지 수정', request: { ...normal, requestId: randomUUID(),
      method: 'PUT', path: '/notes/vault:instructor-notice:demo',
      route: 'PUT /notes/:id' }, decision: 'deny', reasonCode: 'zone_access_denied' },
    { name: '강사 공지 생성', request: { ...normal, requestId: randomUUID(),
      method: 'POST', path: '/notes/vault:instructor-notice:demo',
      route: 'POST /notes/:id' }, decision: 'deny', reasonCode: 'zone_access_denied' },
    { name: '강사 공지 패치', request: { ...normal, requestId: randomUUID(),
      method: 'PATCH', path: '/notes/vault:instructor-notice:demo',
      route: 'PATCH /notes/:id' }, decision: 'deny', reasonCode: 'zone_access_denied' },
    { name: '강사 공지 삭제', request: { ...normal, requestId: randomUUID(),
      method: 'DELETE', path: '/notes/vault:instructor-notice:demo',
      route: 'DELETE /notes/:id' }, decision: 'deny', reasonCode: 'zone_access_denied' },
    { name: '자료 위치의 기능 경로', request: { ...normal, requestId: randomUUID(),
      path: '/notes/export' }, decision: 'deny', reasonCode: 'zone_access_denied' },
    { name: '알 수 없는 경로', request: { ...normal, requestId: randomUUID(),
      path: '/unknown', route: 'GET /unknown' }, decision: 'deny',
      reasonCode: 'zone_access_denied' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
    { name: '기기 등록 정보가 누락된 가상 요청', request: { ...normal,
      requestId: randomUUID(), deviceRegistered: undefined }, decision: 'deny',
      reasonCode: 'device_not_registered' },
    { name: '위조 헤더로 누락된 기기 등록 정보를 보완할 수 없음', request: { ...normal,
      requestId: randomUUID(), deviceRegistered: undefined,
      headers: { 'x-device-registered': 'true', 'x-region': 'local' } }, decision: 'deny',
      reasonCode: 'device_not_registered' },
  ];
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '지역만 달라진 접속', request: { ...normal, requestId: randomUUID(),
        signals: { ...normal.signals, region: 'foreign' } }, decision: 'allow' },
      { name: '위조 재로그인 헤더로 추가 확인을 우회할 수 없음', request: { ...suspicious,
        requestId: randomUUID(), headers: { 'x-step-up-verified': 'true' } },
      decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '계약 범위를 벗어난 추가 확인 시각', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 901 } },
      decision: 'step_up', reasonCode: 'step_up_required' },
      { name: '다시 확인한 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow' },
    );
  }
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    results.push({ name: item.name, passed: valid });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
