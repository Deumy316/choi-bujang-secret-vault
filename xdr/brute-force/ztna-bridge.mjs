import assert from 'node:assert/strict';
import { appendFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';
import { readAlerts } from './read-alerts.mjs';

const alertsLogUrl = new URL('../alerts.log', import.meta.url);
const denyDurationMs = 10 * 60 * 1000;
// ponytail: 로컬 단일 프로세스용 규칙이며, 여러 인스턴스에서 쓸 때 공유 TTL 저장소로 교체한다.
const temporaryDenies = new Map();

async function logDecision(alert, alertNumber, decision) {
  await appendFile(alertsLogUrl, `${JSON.stringify({
    at: alert.timestamp,
    action: decision.action,
    evidenceAlertNumber: alertNumber,
    patternName: decision.reason,
  })}\n`, 'utf8');
}

export async function ingestAlert(alert, alertNumber) {
  if (!Number.isInteger(alertNumber) || alertNumber < 1) {
    throw new TypeError('근거 경보 번호는 1 이상의 정수여야 합니다.');
  }

  const decision = await decide(alert);
  if (decision.action === 'alert' || decision.action === 'block') {
    await logDecision(alert, alertNumber, decision);
  }
  if (decision.action !== 'block') return { decision, temporaryDenyRule: null };

  const startsAtMs = Date.parse(alert.timestamp);
  const temporaryDenyRule = Object.freeze({
    sourceIp: alert.sourceIp,
    startsAt: new Date(startsAtMs).toISOString(),
    expiresAt: new Date(startsAtMs + denyDurationMs).toISOString(),
    evidenceAlertNumber: alertNumber,
    patternName: decision.reason,
  });
  temporaryDenies.set(alert.sourceIp, temporaryDenyRule);
  return { decision, temporaryDenyRule };
}

export function findTemporaryDeny(sourceIp, at = new Date()) {
  const rule = temporaryDenies.get(sourceIp);
  if (!rule) return null;

  const atMs = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!Number.isFinite(atMs)) throw new TypeError('임시 거부 확인 시각이 올바르지 않습니다.');
  if (atMs < Date.parse(rule.startsAt)) return null;
  if (atMs >= Date.parse(rule.expiresAt)) {
    temporaryDenies.delete(sourceIp);
    return null;
  }
  return rule;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const previousLog = await readFile(alertsLogUrl, 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const { extracted } = await readAlerts();
  const outcomes = [];
  for (const [index, alert] of extracted.entries()) {
    outcomes.push(await ingestAlert(alert, index + 1));
  }

  const active = findTemporaryDeny('198.51.100.23', '2026-10-08T00:02:00.000Z');
  assert(active);
  assert.deepEqual(Object.keys(active).sort(), [
    'evidenceAlertNumber', 'expiresAt', 'patternName', 'sourceIp', 'startsAt',
  ]);
  assert.equal(findTemporaryDeny('198.51.100.23', '2026-10-07T23:59:59.000Z'), null);
  assert.equal(findTemporaryDeny('203.0.113.200', '2026-10-08T00:02:00.000Z'), null);
  assert.equal(findTemporaryDeny('198.51.100.23', active.expiresAt), null);
  assert(outcomes.slice(20).every(item => item.temporaryDenyRule === null));

  let ambiguous;
  for (let index = 0; index < 5; index += 1) {
    ambiguous = await ingestAlert({
      timestamp: `2026-10-08T11:00:${String(index * 10).padStart(2, '0')}.000+0900`,
      sourceIp: `203.0.113.${100 + index}`,
      account: 'alert-only-test-user',
      ruleLevel: 5,
      description: 'Repeated failed login',
    }, extracted.length + index + 1);
  }
  assert.equal(ambiguous.decision.action, 'alert');
  assert.equal(ambiguous.temporaryDenyRule, null);

  const newLog = (await readFile(alertsLogUrl, 'utf8')).slice(previousLog.length).trim().split(/\r?\n/);
  assert(newLog.every(line => {
    const item = JSON.parse(line);
    return ['alert', 'block'].includes(item.action)
      && Object.keys(item).sort().join(',') === 'action,at,evidenceAlertNumber,patternName'
      && !/password|passwd|token|secret|account/i.test(line);
  }));
  console.log('PASS: block만 임시 거부, IP 격리, 만료, alert/block 로그, 정상·record 비차단');
}
