import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildOperationsStatus,
  readBundledPolicyStatus,
} from '../src/operations-status.mjs';

test('작전실은 검증한 정책 상태와 미실행·미확인 상태를 구분한다', () => {
  const policy = readBundledPolicyStatus();
  assert.equal(policy.status, 'verification_incomplete');
  assert.equal(policy.fileHashCheck, 'matches');
  assert.equal(policy.application, 'matches_current_bundle');
  assert.equal(policy.sourceCommitCheck, 'unverifiable');
  assert.equal(policy.runtimeApplication, 'not_observed');

  const result = buildOperationsStatus({
    deviceStatus: 'pending',
    policyStatus: policy,
    checkedAt: '2026-10-15T00:00:00.000Z',
    restoreRoute: '/api/restore/:noteId',
  });
  assert.equal(result.decision.device.status, 'pending');
  assert.equal(result.attackSuite.expectedTotal, 41);
  assert.equal(result.attackSuite.specification, 'not_found_in_repository');
  assert.equal(result.attackSuite.executedCount, null);
  assert.equal(result.attackSuite.status, 'unknown');
  assert.deepEqual(result.verification.plan, {
    plannedTotal: 22,
    evidenceCount: 0,
    status: 'not_run',
    evidenceSource: 'static_plan_only',
  });
  assert.deepEqual(result.bundleSelfCheck, {
    expectedTotal: 6,
    getCheckCount: 3,
    notRunCount: 3,
    status: 'results_unavailable',
    evidenceSource: 'source_contract_only',
    targetEnvironment: 'bundle_local',
  });
  assert.equal(result.verification.checks.length, 22);
  assert.ok(result.verification.checks.every(check => check.executed === false
    && check.status === 'not_run' && check.actual === null
    && check.requestId === null && check.checkedAt === null));
  assert.equal(result.detection.xdrEventCount, null);
  assert.equal(result.decision.policy.status, 'verification_incomplete');
  assert.equal(result.recovery.noteRestore.status, 'configured_not_measured');
  assert.doesNotMatch(JSON.stringify(result), /token|password|content|userId/iu);
});

test('작전실 화면은 정책 해시·원본 커밋·운영 적용을 분리한다', async () => {
  const source = await readFile('public/index.html', 'utf8');
  const statusSource = await readFile('src/operations-status.mjs', 'utf8');
  assert.match(source, /<dt>정책 파일 해시<\/dt>/u);
  assert.match(source, /<dt>원본 커밋<\/dt>/u);
  assert.match(source, /<dt>운영 정책 적용<\/dt>/u);
  assert.doesNotMatch(source, /verified_local/u);
  assert.doesNotMatch(statusSource, /\(\)\s*=>\s*true/u);
});

test('작전실 화면은 회귀 계획·Bundle 자기 점검·공식 총공세를 분리한다', async () => {
  const source = await readFile('public/index.html', 'utf8');
  assert.match(source, /A\. 회귀 검증 계획/u);
  assert.match(source, /B\. Bundle 자기 점검/u);
  assert.match(source, /C\. 공식 총공세/u);
  assert.match(source, /로컬 Bundle 실행 결과는 운영 서버에서 읽지 않음/u);
  assert.match(source, /실제 심판 결과 미확인/u);
  assert.doesNotMatch(source, /공식 공격 실행 0건/u);
});

test('작전실 API는 인증과 no-store 응답을 유지한다', async () => {
  const source = await readFile('api/operations/status.js', 'utf8');
  assert.match(source, /authenticatedDeviceContext/u);
  assert.match(source, /cookieHeader: req\.headers\.cookie/u);
  assert.match(source, /preventPrivateResponseCaching/u);
  assert.doesNotMatch(source, /xdr\/alerts\.log/u);
});
