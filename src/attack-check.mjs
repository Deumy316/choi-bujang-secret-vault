// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.

export async function runAttackChecks(config) {
  if (config.step !== 5) {
    throw new Error('5단계 공격 점검은 step 5에서 실행해야 합니다.');
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
        identity?.step === 5 &&
        typeof identity?.repoUrl === 'string' &&
        typeof identity?.publicAppUrl === 'string';
    } catch {
      identityAvailable = false;
    }
  }

  return [
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
      expected: '배포 주소의 /aleph.json에서 5단계 식별 정보를 확인',
      observed: identityAvailable
        ? '/aleph.json에서 5단계 배포 식별 정보를 확인함'
        : `/aleph.json의 5단계 배포 식별 정보를 확인하지 못함 (HTTP ${identityResponse.status})`,
    },
  ];
}