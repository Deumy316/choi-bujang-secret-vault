import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { readAlerts } from './brute-force/read-alerts.mjs';
import { ingestAlert } from './brute-force/ztna-bridge.mjs';

const scenario = process.argv[2];
const fixtureUrl = new URL('./fixtures/brute-force.json', import.meta.url);
const logUrl = new URL('./alerts.log', import.meta.url);
const resultUrl = new URL('./brute-force/result.json', import.meta.url);

function isExpectedNormal(alert) {
  return alert.data.outcome === 'success'
    || (alert.data.outcome === 'failure' && alert.rule.description === 'Single failed login');
}

async function runBruteForce() {
  const source = JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const { sourceCount, extracted } = await readAlerts(fixtureUrl);
  assert.equal(sourceCount, 23, 'Wazuh 시험 경보는 23건이어야 합니다.');
  assert.equal(source.length, extracted.length, '원본과 추출 경보 건수가 다릅니다.');

  const ordered = extracted.map((alert, index) => ({
    alert,
    source: source[index],
    alertNumber: index + 1,
  })).sort((left, right) => Date.parse(left.alert.timestamp) - Date.parse(right.alert.timestamp));

  await writeFile(logUrl, '', 'utf8');
  const outcomes = [];
  for (const item of ordered) {
    const outcome = await ingestAlert(item.alert, item.alertNumber);
    outcomes.push({ ...item, ...outcome });
  }

  const counts = { block: 0, alert: 0, record: 0 };
  for (const item of outcomes) counts[item.decision.action] += 1;
  const falseBlocks = outcomes.filter(item => isExpectedNormal(item.source)
    && item.decision.action === 'block').length;
  const expectedNormal = outcomes.filter(item => isExpectedNormal(item.source));

  assert.equal(sourceCount, counts.block + counts.alert + counts.record,
    '전체 건수와 분류 건수 합계가 다릅니다.');
  assert.equal(expectedNormal.length, 3, '시험 데이터의 정상 이벤트 기준을 확인해 주세요.');
  assert.equal(falseBlocks, 0, '정상 이벤트가 잘못 차단되었습니다.');
  assert(outcomes.every(item => (item.decision.action === 'block')
    === (item.temporaryDenyRule !== null)), 'block 외 판정에 임시 거부 규칙이 생겼습니다.');

  const result = {
    testData: {
      official: false,
      description: '공식 제공 경보가 아닌 자체 제작 Wazuh 형식 시험 데이터',
    },
    total: sourceCount,
    counts,
    falseBlocks,
    evidence: outcomes.filter(item => item.decision.action !== 'record').map(item => ({
      alertNumber: item.alertNumber,
      action: item.decision.action,
      patternName: item.decision.reason,
    })),
    jevConnected: false,
  };
  await writeFile(resultUrl, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`XDR 완료: total=${result.total}, block=${counts.block}, alert=${counts.alert}, record=${counts.record}, falseBlocks=${falseBlocks}`);
}

try {
  if (scenario !== 'brute-force') throw new Error('지원하는 시험 이름은 brute-force입니다.');
  await runBruteForce();
} catch (error) {
  console.error(`XDR 실행 첫 오류: ${error.message}`);
  process.exitCode = 1;
}
