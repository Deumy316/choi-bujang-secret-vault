// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.

export async function runAttackChecks(config) {
  if (![5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) {
    throw new Error('5~12단계 공격 점검은 해당 step에서 실행해야 합니다.');
  }

  if (config.step >= 11) {
    const deviceRoutes = [
      'GET /api/device/status',
      'POST /api/device/request',
      'POST /api/device/unregister',
      'POST /api/device/admin',
    ];

    if (!deviceRoutes.every((route) => config.allowedRoutes?.includes(route))) {
      throw new Error('11단계 기기 승인 API 경로 설정을 확인해 주세요.');
    }
  }

  if (config.step >= 12 && !config.allowedRoutes?.includes('GET /api/operations/status')) {
    throw new Error('12단계 탈환 작전실 상태 API 경로 설정을 확인해 주세요.');
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
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let staticData = null;
  let staticNotesVisible = false;

  if (staticResponse.status === 200) {
    try {
      staticData = await staticResponse.json();
      staticNotesVisible =
        Array.isArray(staticData?.notes) && staticData.notes.length > 0;
    } catch {
      staticData = null;
    }
  }

  const staticShapeValid = staticData && typeof staticData === 'object'
    && !Array.isArray(staticData) && Array.isArray(staticData.notes);
  const sampleExposed = staticShapeValid
    && JSON.stringify(staticData).includes(config.sampleMarker);
  if (!staticShapeValid || staticNotesVisible || sampleExposed) {
    throw new Error('공개 data.json 응답 검증에 실패했습니다.');
  }

  // 2. 로그인 없는 API 요청이 계속 차단되는지 확인
  const apiResponse = await fetch(new URL('/api/notes', app), {
    method: 'GET',
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
    typeof apiError === 'object' &&
    !Array.isArray(apiError) &&
    typeof apiError.error === 'string' &&
    apiError.error.length > 0 &&
    !('notes' in apiError);

  if (!anonymousBlocked) {
    throw new Error('로그인 없는 자료 API가 계약대로 거부되지 않았습니다.');
  }

  // 3. 4단계 배포 식별 정보가 정상 공개되는지 확인
  const identityResponse = await fetch(new URL('/aleph.json', app), {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let identityAvailable = false;

  if (identityResponse.ok) {
    try {
      const identity = await identityResponse.json();

      identityAvailable =
        identity && typeof identity === 'object' && !Array.isArray(identity) &&
        identity.step === config.step &&
        typeof identity.repoUrl === 'string' &&
        identity.repoUrl.toLowerCase() === config.repoUrl.toLowerCase() &&
        identity.publicAppUrl === config.publicAppUrl &&
        typeof identity.commit === 'string' &&
        /^[0-9a-f]{40}$/iu.test(identity.commit);
    } catch {
      identityAvailable = false;
    }
  }

  if (!identityAvailable) {
    throw new Error('배포 식별 정보 검증에 실패했습니다.');
  }

  const attempts = [
    {
      attackId: 'public_static_note_read',
      expected: '공개 data.json에서 가상 메모를 읽지 못함',
      observed: `HTTP ${staticResponse.status}`,
    },
    {
      attackId: 'anonymous_api_note_read',
      expected: '로그인 없는 자료 API 요청을 401 또는 403 JSON 오류로 거부',
      observed: `HTTP ${apiResponse.status}`,
    },
    {
      attackId: 'deployment_identity_available',
      expected: `배포 주소의 /aleph.json에서 ${config.step}단계 식별 정보를 확인`,
      observed: `HTTP ${identityResponse.status}`,
    },
  ];

  if (config.step >= 6) {
    attempts.push({
      attackId: 'unregistered_device_read',
      expected: '미등록 기기의 자료실 읽기 요청을 device_not_registered로 거부',
      observed: 'not_run',
    });
  }

  if (config.step >= 7) {
    attempts.push({
      attackId: 'unusual_access_step_up',
      expected: '정상 가상 요청은 allow, 복합 이상은 step_up, 추가 확인한 새 요청은 allow',
      observed: 'not_run',
    });
  }

  if (config.step >= 10) {
    if (!['/api/notes/restore', '/api/restore/:noteId'].includes(config.restoreRoute)
        || !config.allowedRoutes?.includes(`POST ${config.restoreRoute}`)) {
      throw new Error('10단계 복원 API 경로 설정을 확인해 주세요.');
    }

    attempts.push({
      attackId: 'anonymous_note_restore',
      expected: '인증 없는 메모 복원 요청을 401 JSON 오류로 거부',
      observed: 'not_run',
    });
  }

  return attempts;
}
