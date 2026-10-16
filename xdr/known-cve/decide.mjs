const PATTERNS = Object.freeze({
  cve: 'CVE-2021-44228',
  technique: 'T1190',
  remoteLookup: /\$\{jndi:(?:ldap|ldaps|rmi|dns):\/\/[^}\s]+}/i,
});
const MATCH = 'CVE-2021-44228 / T1190 원격 조회 형태';
const NO_MATCH = '일치하는 알려진 취약점 악용 패턴 없음';

function result(confidence, reason) {
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}

export function decide(alert) {
  try {
    const level = Number(alert?.rule?.level);
    const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
    const input = [alert?.data?.url, alert?.data?.useragent]
      .filter(value => typeof value === 'string')
      .join('\n');
    const hasT1190 = mitre.includes(PATTERNS.technique);

    if (hasT1190 && level >= 10 && PATTERNS.remoteLookup.test(input)) return result(0.95, MATCH);
    if (hasT1190 && level >= 5) return result(0.6, 'T1190 경보이나 완전한 원격 조회 형태 없음');
    return result(0.1, NO_MATCH);
  } catch {
    return result(0, NO_MATCH);
  }
}
