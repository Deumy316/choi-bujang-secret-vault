const PATTERNS = Object.freeze([
  {
    name: 'SQL Injection',
    url: [
      /\bunion(?:\s|\+)+(?:all(?:\s|\+)+)?select\b/i,
      /(?:'|%27)\s*or\s+(?:'[^']*'\s*=\s*'[^']*'|\d+\s*=\s*\d+)/i,
      /\b(?:sleep|benchmark)\s*\([^)]*\)|\binformation_schema\b.*\bselect\b/i,
    ],
    description: /\bSQL(?:\s+Injection|i)\b|SQL\s*(?:주입|구문|표식)|데이터베이스\s*조회|명령\s*구분자/i,
  },
  {
    name: 'XSS',
    url: [
      /<\s*script\b[^>]*>/i,
      /<\s*(?:img|svg)\b[^>]*\bon(?:error|load)\s*=/i,
      /javascript\s*:[^?#]*(?:alert|eval|document\.)\s*\(/i,
    ],
    description: /\b(?:XSS|Cross[- ]Site Scripting)\b|스크립트\s*(?:태그|실행|삽입|표기|표식)/i,
  },
  {
    name: 'Path Traversal',
    url: [
      /(?:\.\.[/\\]){2,}/,
      /\.\.[/\\]+(?:etc[/\\]+passwd|windows[/\\]+win\.ini)\b/i,
      /(?:(?:%2e){2}(?:%2f|%5c)){2,}/i,
    ],
    description: /\b(?:Path|Directory) Traversal\b|경로\s*(?:순회|이탈|상위|거슬러)|상위\s*경로/i,
  },
]);

const NO_PATTERN = '일치하는 공격 패턴 없음';

function decodeUrl(value) {
  let decoded = typeof value === 'string' ? value.replace(/\+/g, ' ') : '';
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

function result(confidence, reason) {
  const safeConfidence = Math.max(0, Math.min(1, confidence));
  const action = safeConfidence >= 0.85 ? 'block'
    : safeConfidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence: safeConfidence, reason };
}

export function decide(alert) {
  try {
    const level = Number(alert?.rule?.level);
    const count = Number(alert?.data?.count ?? 0);
    const description = typeof alert?.rule?.description === 'string'
      ? alert.rule.description
      : '';
    const url = decodeUrl(alert?.data?.url);
    const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
    const hasSource = typeof alert?.data?.srcip === 'string';
    const matched = PATTERNS.find(pattern => pattern.description.test(description)
      || pattern.url.some(expression => expression.test(url)));

    if (!Number.isFinite(level) || (!description && !url)) return result(0, NO_PATTERN);

    const isT1190 = mitre.includes('T1190');
    const repeated = Number.isFinite(count) && count >= 3;
    if (isT1190 && level >= 10 && repeated && hasSource) {
      return result(0.95, matched?.name ?? PATTERNS.map(pattern => pattern.name).join(' / '));
    }
    if (isT1190 && level >= 5) {
      return result(matched ? 0.65 : 0.55,
        matched?.name ?? PATTERNS.map(pattern => pattern.name).join(' / '));
    }
    return result(matched ? 0.4 : 0.1, matched?.name ?? NO_PATTERN);
  } catch {
    return result(0, NO_PATTERN);
  }
}
