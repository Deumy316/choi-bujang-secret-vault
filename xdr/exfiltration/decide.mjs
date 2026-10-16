const PATTERNS = Object.freeze([
  { name: '새 외부 목적지 대량 전송', technique: 'T1041/T1048' },
  { name: '업무 외 압축 파일 반출', technique: 'T1048' },
  { name: 'T1041 채널 반복 대량 전송', technique: 'T1041' },
  { name: 'T1048 비표준 경로 대량 전송', technique: 'T1048' },
  { name: '자료 유출 단일 신호', technique: 'T1041/T1048' },
]);

const NO_MATCH = '일치하는 자료 유출 패턴 없음';
const NOVEL_DESTINATION = /처음 보는 (?:목적지|주소)|평소에 쓰지 않던 포트|외부 주소/u;
const OFF_HOURS = /수업 시간 밖|업무 시간 밖/u;
const APPROVED_DESTINATION = /승인된|평소 목적지|수업 자료 주소|평소 저장소/u;

function result(confidence, reason) {
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}

export function decide(alert) {
  try {
    const level = Number(alert?.rule?.level);
    const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
    const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
    const bytes = Number(alert?.data?.bytes ?? 0);
    const files = Number(alert?.data?.files ?? 0);
    const count = Number(alert?.data?.count ?? 0);
    const destinationKnown = typeof alert?.data?.dstip === 'string' && alert.data.dstip.length > 0;
    const scopeKnown = destinationKnown
      && typeof alert?.data?.srcip === 'string'
      && typeof alert?.data?.srcuser === 'string';
    const hasProtocolEvidence = mitre.includes('T1041') || mitre.includes('T1048');
    const large = Number.isFinite(bytes) && bytes >= 50_000_000;
    const repeated = (Number.isFinite(count) && count >= 3)
      || (Number.isFinite(files) && files >= 2)
      || /반복|연속|자료실 전체|목적지 두 곳/u.test(description);
    const novel = NOVEL_DESTINATION.test(description);
    const offHours = OFF_HOURS.test(description);
    const compressed = /압축 파일/u.test(description);
    const approved = alert?.data?.approved === true || APPROVED_DESTINATION.test(description);
    const matched = [];

    if (hasProtocolEvidence && large && novel && (repeated || compressed)) matched.push(PATTERNS[0].name);
    if (mitre.includes('T1048') && large && novel && offHours && compressed) matched.push(PATTERNS[1].name);
    if (mitre.includes('T1041') && large && repeated) matched.push(PATTERNS[2].name);
    if (mitre.includes('T1048') && large
      && (repeated || offHours || /평소에 쓰지 않던 포트/u.test(description))) matched.push(PATTERNS[3].name);

    if (level >= 10 && matched.length > 0 && !approved) {
      return result(scopeKnown ? 0.95 : 0.75, matched.join(' + '));
    }
    if (level >= 5 && hasProtocolEvidence) return result(0.6, PATTERNS[4].name);
    return result(0.1, NO_MATCH);
  } catch {
    return result(0, NO_MATCH);
  }
}
