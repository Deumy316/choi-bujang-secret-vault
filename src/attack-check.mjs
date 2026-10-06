// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.

export async function runAttackChecks(config) {
  if (config.step !== 2) {
    throw new Error('2단계 공격 점검은 step 2에서 실행해야 합니다.');
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

  // 1. 예전 정적 data.json에 가상 메모가 남아 있는지 확인
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

  // 2. 새 서버 API가 인증 없이 호출되는 현재 한계 확인
  const apiResponse = await fetch(new URL('/api/notes', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let anonymousApiReadable = false;

  if (apiResponse.ok) {
    try {
      const data = await apiResponse.json();

      anonymousApiReadable =
        Array.isArray(data?.notes) &&
        data.notes.length > 0;
    } catch {
      anonymousApiReadable = false;
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
      expected: '현재 단계의 서버 API 공개 범위를 확인',
      observed: anonymousApiReadable
        ? '인증 없는 서버 API 요청으로 가상 메모 목록이 조회됨'
        : `인증 없는 서버 API 요청에서 가상 메모 목록이 조회되지 않음 (HTTP ${apiResponse.status})`,
    },
  ];
}