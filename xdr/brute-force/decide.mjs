const BLOCK_REASON = 'MITRE T1110 고수준 반복 로그인 실패';
const ALERT_REASON = 'MITRE T1110 추가 확인이 필요한 로그인 실패';
const RECORD_REASON = '무차별 로그인 공격 근거 없음';

function decision(action, confidence, reason) {
  return { action, confidence, reason };
}

export function decide(alert) {
  const level = Number(alert?.rule?.level);
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description
    : '';
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const count = Number(alert?.data?.count ?? 0);
  const accounts = typeof alert?.data?.accounts === 'string'
    ? alert.data.accounts.split(',').filter(Boolean).length
    : 0;
  const hasSource = typeof alert?.data?.srcip === 'string'
    && typeof alert?.data?.srcuser === 'string';
  const isT1110 = mitre.includes('T1110');

  if (!Number.isFinite(level) || !description || !hasSource) {
    return decision('record', 0, RECORD_REASON);
  }
  if (isT1110 && level >= 10 && (count >= 10 || accounts >= 3)) {
    return decision('block', 0.95, BLOCK_REASON);
  }
  if (isT1110 && level >= 5 && (count >= 3 || accounts >= 3)) {
    return decision('alert', 0.65, ALERT_REASON);
  }
  return decision('record', 0.1, RECORD_REASON);
}
