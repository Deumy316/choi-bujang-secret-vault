import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/web-injection.json', import.meta.url);
const textOrNull = value => typeof value === 'string' ? value : null;

export async function readAlerts(file = fixtureUrl) {
  const fixture = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(fixture?.alerts)) {
    throw new TypeError('경보 원본의 alerts는 JSON 배열이어야 합니다.');
  }

  const extracted = fixture.alerts.map(alert => ({
    timestamp: textOrNull(alert?.timestamp),
    sourceIp: textOrNull(alert?.data?.srcip),
    account: textOrNull(alert?.data?.srcuser),
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: textOrNull(alert?.rule?.description),
  }));

  if (fixture.alerts.length !== extracted.length) {
    throw new Error('경보 원본과 추출 건수가 다릅니다.');
  }
  return { sourceCount: fixture.alerts.length, extracted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sourceCount, extracted } = await readAlerts();
  console.log(JSON.stringify({
    sourceCount,
    extractedCount: extracted.length,
    matches: sourceCount === extracted.length,
  }));
}
