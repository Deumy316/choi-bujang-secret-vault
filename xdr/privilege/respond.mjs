import { appendFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const alertsLogUrl = new URL('../alerts.log', import.meta.url);
const denyDurationMs = 10 * 60 * 1000;
const blockReasons = ['관리자 그룹 계정 탈취', '권한 상승 취약점 악용 성공', '업무 외 관리자 권한 사용'];
// shortcut: 과제용 단일 프로세스 임시 규칙이며, 운영 연동이 필요할 때 공유 TTL 저장소로 교체한다.
const temporaryDenies = new Map();

const ruleKey = (account, sourceIp) => `${account}\u0000${sourceIp}`;

function isBlockCandidate(alert, decision) {
  const account = alert?.data?.srcuser;
  const sourceIp = alert?.data?.srcip;
  return decision?.action === 'block'
    && decision.confidence >= 0.85
    && blockReasons.some(reason => decision.reason.includes(reason))
    && typeof account === 'string' && account.length > 0
    && typeof sourceIp === 'string' && sourceIp.length > 0
    && typeof alert?.id === 'string'
    && Number.isFinite(Date.parse(alert?.timestamp));
}

async function logDecision(alert, decision) {
  await appendFile(alertsLogUrl, `${JSON.stringify({
    at: alert?.timestamp ?? null,
    action: decision.action,
    evidenceAlertId: alert?.id ?? null,
    patternName: decision.reason,
  })}\n`, 'utf8');
}

export async function respond(alert, decision = decide(alert)) {
  if (decision?.action === 'alert' || decision?.action === 'block') {
    await logDecision(alert, decision);
  }
  if (!isBlockCandidate(alert, decision)) return { decision, temporaryDenyRule: null };

  const startsAtMs = Date.parse(alert.timestamp);
  const temporaryDenyRule = Object.freeze({
    account: alert.data.srcuser,
    sourceIp: alert.data.srcip,
    startsAt: new Date(startsAtMs).toISOString(),
    expiresAt: new Date(startsAtMs + denyDurationMs).toISOString(),
    evidenceAlertId: alert.id,
    patternName: decision.reason,
  });
  temporaryDenies.set(ruleKey(temporaryDenyRule.account, temporaryDenyRule.sourceIp), temporaryDenyRule);
  return { decision, temporaryDenyRule };
}

export function findTemporaryDeny(account, sourceIp, at = new Date()) {
  const key = ruleKey(account, sourceIp);
  const rule = temporaryDenies.get(key);
  const atMs = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!rule || !Number.isFinite(atMs) || atMs < Date.parse(rule.startsAt)) return null;
  if (atMs >= Date.parse(rule.expiresAt)) {
    temporaryDenies.delete(key);
    return null;
  }
  return rule;
}
