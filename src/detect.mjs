// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
const TEN_MINUTES_MS = 10 * 60 * 1000;
const BURST_READ_THRESHOLD = 120;

export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  return events.map(event => {
    const { at, method, identity } = event ?? {};
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))
        || typeof method !== 'string' || typeof identity?.sub !== 'string'
        || identity.sub.length === 0) {
      throw new TypeError('invalid_detection_event');
    }
    return { at, method, subject: identity.sub };
  });
}

function analyzeGetReads(events) {
  const reads = readDetectionEvents(events)
    .filter(event => event.method === 'GET')
    .map(event => ({ ...event, time: Date.parse(event.at) }))
    .sort((a, b) => a.time - b.time);
  const windows = new Map();
  const maximums = new Map();
  let firstExceededSubject = null;

  for (const event of reads) {
    const window = windows.get(event.subject) ?? { times: [], left: 0 };
    window.times.push(event.time);
    while (event.time - window.times[window.left] > TEN_MINUTES_MS) window.left += 1;
    const count = window.times.length - window.left;
    maximums.set(event.subject, Math.max(maximums.get(event.subject) ?? 0, count));
    windows.set(event.subject, window);
    if (firstExceededSubject === null && count > BURST_READ_THRESHOLD) {
      firstExceededSubject = event.subject;
    }
  }

  return { maximums, firstExceededSubject };
}

export function countGetReadsInTenMinutes(events) {
  const { maximums } = analyzeGetReads(events);
  return maximums;
}

export function detect(events) {
  const { firstExceededSubject } = analyzeGetReads(events);
  if (firstExceededSubject !== null) {
    return {
      action: 'propose_revocation',
      reasonCode: 'burst_read',
      subject: firstExceededSubject,
    };
  }
  return { action: 'observe' };
}
