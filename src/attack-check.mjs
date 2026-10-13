// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.

import { fixtureRequests } from '../scripts/fixture-7.mjs';
import { decide } from './decider.mjs';

export async function runAttackChecks(config) {
  if (![5, 6, 7, 8, 9].includes(config.step)) {
    throw new Error('5~8단계 공격 점검은 해당 step에서 실행해야 합니다.');
  }

  let app;

  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 확인해 주세요.');
  }

  if (
    app.protocol !== 'https:' ||
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== '/' ||
    app.hostname.endsWith('.example')
  ) {
    throw new Error('aleph.config.json의 실제 배포 주소를 확인해 주세요.');
  }

  // 1. 공개 data.json에 메모가 다시 노출되지 않았는지 확인
  const staticResponse = await fetch(new URL('/data.json', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let staticNotesVisible = false;

  if (staticResponse.ok) {
    try {
      const data = await staticResponse.json();

      staticNotesVisible =
        Array.isArray(data?.notes) &&
        data.notes.length > 0;
    } catch {
      staticNotesVisible = false;
    }
  }

  // 2. 로그인 없는 API 요청이 계속 차단되는지 확인
  const apiResponse = await fetch(new URL('/api/notes', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let apiError = null;

  try {
    apiError = await apiResponse.json();
  } catch {
    apiError = null;
  }

  const anonymousBlocked =
    (apiResponse.status === 401 || apiResponse.status === 403) &&
    apiError &&
    typeof apiError.error === 'string' &&
    apiError.error.length > 0;

  // 3. 4단계 배포 식별 정보가 정상 공개되는지 확인
  const identityResponse = await fetch(new URL('/aleph.json', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let identityAvailable = false;

  if (identityResponse.ok) {
    try {
      const identity = await identityResponse.json();

      identityAvailable =
        identity?.step === config.step &&
        typeof identity?.repoUrl === 'string' &&
        typeof identity?.publicAppUrl === 'string';
    } catch {
      identityAvailable = false;
    }
  }

  const attempts = [
    {
      attackId: 'public_static_note_read',
      expected: '공개 data.json에서 가상 메모를 읽지 못함',
      observed: staticNotesVisible
        ? '공개 data.json에 가상 메모가 남아 있음'
        : `공개 data.json에서 가상 메모가 확인되지 않음 (HTTP ${staticResponse.status})`,
    },
    {
      attackId: 'anonymous_api_note_read',
      expected: '로그인 없는 자료 API 요청을 401 또는 403 JSON 오류로 거부',
      observed: anonymousBlocked
        ? `로그인 없는 자료 API 요청이 JSON 오류로 차단됨 (HTTP ${apiResponse.status})`
        : `로그인 없는 자료 API 요청 차단 조건을 만족하지 못함 (HTTP ${apiResponse.status})`,
    },
    {
      attackId: 'deployment_identity_available',
      expected: `배포 주소의 /aleph.json에서 ${config.step}단계 식별 정보를 확인`,
      observed: identityAvailable
        ? `/aleph.json에서 ${config.step}단계 배포 식별 정보를 확인함`
        : `/aleph.json의 ${config.step}단계 배포 식별 정보를 확인하지 못함 (HTTP ${identityResponse.status})`,
    },
  ];

  if (config.step >= 6) {
    const { normal } = fixtureRequests();
    const request = { ...normal, deviceRegistered: false };
    const response = await decide(request);
    const unregisteredDeviceBlocked =
      response && typeof response === 'object' && !Array.isArray(response) &&
      Object.keys(response).sort().join(',') === 'decision,reasonCode,requestId,ruleIds,schema' &&
      response.schema === 'aleph.decision.v1' &&
      response.requestId === request.requestId &&
      response.decision === 'deny' &&
      response.reasonCode === 'device_not_registered' &&
      Array.isArray(response.ruleIds) &&
      response.ruleIds.includes('device_registered');

    attempts.push({
      attackId: 'unregistered_device_read',
      expected: '미등록 기기의 자료실 읽기 요청을 device_not_registered로 거부',
      observed: unregisteredDeviceBlocked
        ? '미등록 기기의 가상 요청을 device_not_registered로 거부함'
        : '미등록 기기의 가상 요청이 요구한 판정으로 거부되지 않음',
    });
  }

  if (config.step >= 7) {
    const { normal, suspicious } = fixtureRequests();
    const verified = {
      ...suspicious,
      stepUp: { verified: true, authAgeSeconds: 60 },
    };
    const [normalResponse, suspiciousResponse, verifiedResponse] = await Promise.all([
      decide(normal),
      decide(suspicious),
      decide(verified),
    ]);
    const expectedDecisions = normalResponse?.decision === 'allow'
      && suspiciousResponse?.decision === 'step_up'
      && suspiciousResponse?.reasonCode === 'step_up_required'
      && verifiedResponse?.decision === 'allow';

    attempts.push({
      attackId: 'unusual_access_step_up',
      expected: '정상 가상 요청은 allow, 복합 이상은 step_up, 추가 확인한 새 요청은 allow',
      observed: expectedDecisions
        ? '정상 allow, 복합 이상 step_up, 추가 확인한 새 요청 allow를 확인함'
        : `정상 ${normalResponse?.decision}, 복합 이상 ${suspiciousResponse?.decision}, 추가 확인 ${verifiedResponse?.decision}`,
    });
  }

  return attempts;
}
