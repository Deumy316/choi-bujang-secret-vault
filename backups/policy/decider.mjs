// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'zone_access']);

const NOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function checkZoneAccess({ service, method, path, route }) {
  if (service !== 'notes') return false;
  if (method === 'POST') return path === '/notes' && route === 'POST /notes';
  if (!['GET', 'PUT', 'DELETE'].includes(method)) return false;

  const match = typeof path === 'string' && path.match(/^\/notes\/([^/]+)$/u);
  if (!match || route !== `${method} /notes/:id`) return false;
  return (method === 'GET' && match[1] === 'demo') || NOTE_ID.test(match[1]);
}

export async function decide(request) {
  // 계약 필드만 사용하며, 출처가 검증되지 않은 신호나 클라이언트 헤더는 읽지 않습니다.
  const { requestId, deviceRegistered, stepUp, recentEvents, signals } = request;

  if (deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[0]],
    };
  }

  if (!checkZoneAccess(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId,
      decision: 'deny',
      reasonCode: 'zone_access_denied',
      ruleIds: [RULE_IDS[2]],
    };
  }

  // judge_fixture는 로컬 가상 사건에만 쓰며 실제 위치나 접속 이력의 증거가 아닙니다.
  const needsStepUp = signals?.source === 'judge_fixture'
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour < 6
    && signals.network === 'unusual'
    && Array.isArray(recentEvents)
    && recentEvents.some(event => event?.kind === 'risk_signal' && event.count >= 20);
  const stepUpVerified = stepUp?.verified === true
    && Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;

  if (needsStepUp && !stepUpVerified) {
    return {
      schema: 'aleph.decision.v1',
      requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[1]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: [RULE_IDS[0]],
  };
}
