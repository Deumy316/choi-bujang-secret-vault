const PATTERNS = Object.freeze([
  { name: '관리자 그룹 계정 탈취', technique: 'T1078' },
  { name: '권한 상승 취약점 악용 성공', technique: 'T1068' },
  { name: '업무 외 관리자 권한 사용', technique: 'T1078' },
  { name: '권한 변경 단일 신호', technique: 'T1068/T1078' },
]);

const NO_MATCH = '일치하는 권한 탈취 패턴 없음';
const GROUP_CHANGE = /관리자 그룹에 (?:추가|들어가)|관리자 그룹 추가|다시 관리자로 들어/u;
const PRIVILEGE_SUCCESS = /관리자 명령을 실행|관리자 권한으로 바뀌|권한 명령을 실행|명령 실행이 같이|다른 계정의 권한/u;
const UNUSUAL_CONTEXT = /원격 주소|방금 관리자가 된|수업 시간 밖|처음 보는 주소|평범한 계정|곧바로|같은 주소에서 계정|요청 주소는 처음|업무처럼 보이지 않는 시각|다른 계정의 권한|1분 뒤/u;

function result(confidence, reason) {
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}

export function decide(alert) {
  try {
    const level = Number(alert?.rule?.level);
    const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
    const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
    const group = typeof alert?.data?.group === 'string' ? alert.data.group.toLowerCase() : '';
    const count = Number(alert?.data?.count ?? 0);
    const identityKnown = typeof alert?.data?.srcuser === 'string'
      && typeof alert?.data?.srcip === 'string';
    const unusual = UNUSUAL_CONTEXT.test(description)
      || (Number.isFinite(count) && count >= 2)
      || (mitre.includes('T1068') && mitre.includes('T1078'));
    const matched = [];

    if (mitre.includes('T1078') && group === 'administrators'
      && GROUP_CHANGE.test(description) && unusual) matched.push(PATTERNS[0].name);
    // T1068 표기와 성공 결과를 함께 요구해 단순 그룹 변경을 취약점 악용으로 보지 않는다.
    if (mitre.includes('T1068') && PRIVILEGE_SUCCESS.test(description)
      && !/취소|실패|이어서 명령은 없/u.test(description) && unusual) matched.push(PATTERNS[1].name);
    if (/수업 시간 밖|업무처럼 보이지 않는 시각/u.test(description)
      && (GROUP_CHANGE.test(description) || PRIVILEGE_SUCCESS.test(description))
      && unusual) matched.push(PATTERNS[2].name);

    if (level >= 10 && matched.length > 0) {
      return result(identityKnown ? 0.95 : 0.75, matched.join(' + '));
    }
    if (level >= 5 && mitre.some(technique => technique === 'T1068' || technique === 'T1078')) {
      return result(0.6, PATTERNS[3].name);
    }
    return result(0.1, NO_MATCH);
  } catch {
    return result(0, NO_MATCH);
  }
}
