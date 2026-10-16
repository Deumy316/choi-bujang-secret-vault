const PATTERNS = Object.freeze([
  {
    name: '의심스러운 서비스 등록·변경',
    technique: 'T1543',
    description: /서명 없.*서비스|서비스.*서명(?:이)? 없|서비스 실행 파일이 바뀌|평소 목록에 없는 서비스/u,
  },
  {
    name: '낯선 예약 작업',
    technique: 'T1053',
    description: /처음 보는 예약 작업|예약 작업 이름이 임의 문자열|시작 프로그램과 예약 작업/u,
  },
  {
    name: '시작 폴더 변경',
    technique: 'T1543',
    description: /시작 (?:폴더|프로그램).*평소 목록에 없|시작 프로그램과 예약 작업/u,
  },
]);

const NO_MATCH = '일치하는 지속성 패턴 없음';

function result(confidence, reason) {
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}

export function decide(alert) {
  try {
    const level = Number(alert?.rule?.level);
    const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
    const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';
    const count = Number(alert?.data?.count ?? 0);
    const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
    const matched = PATTERNS.filter(pattern => mitre.includes(pattern.technique)
      && pattern.description.test(description));
    const strongSupport = /\\(?:Temp|Startup)\\/iu.test(path)
      || (Number.isFinite(count) && count >= 3)
      || (mitre.includes('T1543') && mitre.includes('T1053'));

    if (level >= 10 && matched.length > 0 && strongSupport) {
      return result(0.95, matched.map(pattern => pattern.name).join(' + '));
    }
    if (level >= 5 && mitre.some(technique => technique === 'T1543' || technique === 'T1053')) {
      const reviewPattern = mitre.includes('T1053') ? PATTERNS[1] : /시작/u.test(description) ? PATTERNS[2] : PATTERNS[0];
      return result(0.6, `${reviewPattern.name} 검토`);
    }
    return result(0.1, NO_MATCH);
  } catch {
    return result(0, NO_MATCH);
  }
}
