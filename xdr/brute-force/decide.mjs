import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readAlerts } from './read-alerts.mjs';

const patterns = JSON.parse(await readFile(new URL('./patterns.json', import.meta.url), 'utf8'));
const pattern = Object.fromEntries(patterns.map(item => [item.id, item]));
const windowMs = 120_000;
// ponytail: 프로세스 내 시험 기록이며, 여러 인스턴스나 재시작을 다룰 때 공유 저장소로 교체한다.
let failures = [];

function outcome(alert) {
  if (/login succeeded|successful login/i.test(alert.description)) return 'success';
  if (/failed login|login failed|authentication failure/i.test(alert.description)) return 'failure';
  return 'other';
}

function result(action, confidence, reason) {
  return { action, confidence: Math.max(0, Math.min(1, confidence)), reason };
}

export async function decide(alert) {
  const time = Date.parse(alert?.timestamp);
  if (!Number.isFinite(time) || typeof alert?.sourceIp !== 'string'
      || typeof alert?.account !== 'string' || typeof alert?.description !== 'string') {
    throw new TypeError('판정할 경보의 시각, 출발 IP, 계정, 설명이 필요합니다.');
  }

  if (outcome(alert) !== 'failure') return result('record', 0, '일치하는 공격 패턴 없음');

  failures.push({ ...alert, time });
  failures = failures.filter(item => item.time >= time - windowMs && item.time <= time);

  const sameIp = failures.filter(item => item.sourceIp === alert.sourceIp);
  const sameAccount = failures.filter(item => item.account === alert.account);
  const distinctAccounts = new Set(sameIp.map(item => item.account)).size;
  const multi = pattern['t1110.source_ip_multiple_accounts'];
  const ipBurst = pattern['t1110.source_ip_burst'];
  const accountBurst = pattern['t1110.account_burst'];

  if (alert.ruleLevel >= 10 && /repeated failed login/i.test(alert.description)) {
    return result('block', 0.9, ipBurst.name);
  }

  if (sameIp.length >= multi.condition.minimumAttempts
      && distinctAccounts >= multi.condition.minimumDistinctAccounts) {
    const confidence = 0.9 + Math.min(0.1,
      (sameIp.length - multi.condition.minimumAttempts) * 0.01
      + (distinctAccounts - multi.condition.minimumDistinctAccounts) * 0.02);
    return result('block', confidence, multi.name);
  }

  if (sameIp.length >= ipBurst.condition.minimumAttempts) {
    return result('alert', Math.min(0.84,
      0.65 + (sameIp.length - ipBurst.condition.minimumAttempts) * 0.02), ipBurst.name);
  }

  if (sameAccount.length >= accountBurst.condition.minimumAttempts) {
    return result('alert', Math.min(0.84,
      0.55 + (sameAccount.length - accountBurst.condition.minimumAttempts) * 0.03), accountBurst.name);
  }

  return result('record', 0, '일치하는 공격 패턴 없음');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { extracted } = await readAlerts();
  const decisions = [];
  for (const alert of extracted) decisions.push(await decide(alert));

  const ambiguous = [];
  for (let index = 0; index < 5; index += 1) {
    ambiguous.push(await decide({
      timestamp: `2026-10-08T11:00:${String(index * 10).padStart(2, '0')}.000+0900`,
      sourceIp: `192.0.2.${100 + index}`,
      account: 'ambiguous-test-user',
      ruleLevel: 5,
      description: 'Repeated failed login',
    }));
  }

  assert(decisions.slice(0, 20).every(item => item.action === 'block'));
  assert(decisions.slice(20).every(item => item.action === 'record'));
  assert.equal(ambiguous.at(-1).action, 'alert');
  assert.equal(decisions.at(-1).action, 'record');
  assert([...decisions, ...ambiguous].every(item => item.confidence >= 0 && item.confidence <= 1));
  console.log('PASS: 명확한 공격=block, 애매한 공격/Jev 미응답=alert, 정상=record, confidence=0~1');
}
