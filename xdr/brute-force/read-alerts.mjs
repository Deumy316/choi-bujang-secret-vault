import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../fixtures/brute-force.json', import.meta.url);

export async function readAlerts(file = fixtureUrl) {
  const alerts = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(alerts)) throw new TypeError('경보 원본은 JSON 배열이어야 합니다.');

  const extracted = alerts.map((alert, index) => {
    const line = {
      timestamp: alert?.timestamp,
      sourceIp: alert?.data?.srcip,
      account: alert?.data?.srcuser,
      ruleLevel: alert?.rule?.level,
      description: alert?.rule?.description,
    };
    if (Object.values(line).some(value => value === undefined)) {
      throw new TypeError(`${index + 1}번째 경보에 필요한 필드가 없습니다.`);
    }
    return line;
  });

  if (alerts.length !== extracted.length) throw new Error('경보 원본과 추출 건수가 다릅니다.');
  return { sourceCount: alerts.length, extracted };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { sourceCount, extracted } = await readAlerts();
  for (const line of extracted) console.log(JSON.stringify(line));
  console.error(`원본 ${sourceCount}건, 추출 ${extracted.length}건: 일치`);
}
