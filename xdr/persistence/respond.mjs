import { appendFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const alertsLogUrl = new URL('../alerts.log', import.meta.url);
const denyDurationMs = 10 * 60 * 1000;
const blockReasons = ['의심스러운 서비스 등록·변경', '낯선 예약 작업', '시작 폴더 변경'];
// shortcut: 과제용 단일 프로세스 임시 규칙이며, 운영 연동이 필요할 때 공유 TTL 저장소로 교체한다.
const temporaryDenies = new Map();

function isBlockCandidate(alert, decision) {
  const mitre = Array.isArray(alert?.rule?.mitre) ? alert.rule.mitre : [];
  const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';
  const count = Number(alert?.data?.count ?? 0);
  const strongSupport = /\\(?:Temp|Startup)\\/iu.test(path)
    || (Number.isFinite(count) && count >= 3)
    || (mitre.includes('T1543') && mitre.includes('T1053'));
  return decision?.action === 'block'
    && decision.confidence >= 0.85
    && blockReasons.some(reason => decision.reason.includes(reason))
    && mitre.some(technique => technique === 'T1543' || technique === 'T1053')
    && Number(alert?.rule?.level) >= 10
    && strongSupport
    && typeof alert?.id === 'string'
    && typeof alert?.data?.srcip === 'string'
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
    sourceIp: alert.data.srcip,
    startsAt: new Date(startsAtMs).toISOString(),
    expiresAt: new Date(startsAtMs + denyDurationMs).toISOString(),
    evidenceAlertId: alert.id,
    patternName: decision.reason,
  });
  temporaryDenies.set(temporaryDenyRule.sourceIp, temporaryDenyRule);
  return { decision, temporaryDenyRule };
}

export function findTemporaryDeny(sourceIp, at = new Date()) {
  const rule = temporaryDenies.get(sourceIp);
  const atMs = at instanceof Date ? at.getTime() : Date.parse(at);
  if (!rule || !Number.isFinite(atMs) || atMs < Date.parse(rule.startsAt)) return null;
  if (atMs >= Date.parse(rule.expiresAt)) {
    temporaryDenies.delete(sourceIp);
    return null;
  }
  return rule;
}
