import { appendFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const alertsLogUrl = new URL('../alerts.log', import.meta.url);
const denyDurationMs = 10 * 60 * 1000;
const blockReasons = [
  '새 외부 목적지 대량 전송',
  '업무 외 압축 파일 반출',
  'T1041 채널 반복 대량 전송',
  'T1048 비표준 경로 대량 전송',
];
// shortcut: 과제용 단일 프로세스 임시 규칙이며, 운영 연동이 필요할 때 공유 TTL 저장소로 교체한다.
const temporaryDenies = new Map();

const ruleKey = (sourceIp, destinationIp) => `${sourceIp}\u0000${destinationIp}`;

function isBlockCandidate(alert, decision) {
  const sourceIp = alert?.data?.srcip;
  const destinationIp = alert?.data?.dstip;
  return decision?.action === 'block'
    && decision.confidence >= 0.85
    && blockReasons.some(reason => decision.reason.includes(reason))
    && typeof alert?.data?.srcuser === 'string'
    && typeof sourceIp === 'string' && sourceIp.length > 0
    && typeof destinationIp === 'string' && destinationIp.length > 0
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
    destinationIp: alert.data.dstip,
    startsAt: new Date(startsAtMs).toISOString(),
    expiresAt: new Date(startsAtMs + denyDurationMs).toISOString(),
    evidenceAlertId: alert.id,
    patternName: decision.reason,
  });
  temporaryDenies.set(ruleKey(temporaryDenyRule.sourceIp, temporaryDenyRule.destinationIp), temporaryDenyRule);
  return { decision, temporaryDenyRule };
}

export function findTemporaryDeny(sourceIp, destinationIp, at = new Date()) {
  const key = ruleKey(sourceIp, destinationIp);
  const rule = temporaryDenies.get(key);
  const atMs = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!rule || !Number.isFinite(atMs) || atMs < Date.parse(rule.startsAt)) return null;
  if (atMs >= Date.parse(rule.expiresAt)) {
    temporaryDenies.delete(key);
    return null;
  }
  return rule;
}
