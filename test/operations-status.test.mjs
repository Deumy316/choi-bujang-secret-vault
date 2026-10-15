import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildOperationsStatus,
  readBundledPolicyStatus,
} from '../src/operations-status.mjs';

test('작전실은 검증한 정책 상태와 미실행·미확인 상태를 구분한다', () => {
  const policy = readBundledPolicyStatus();
  assert.equal(policy.status, 'verified_local');
  assert.equal(policy.application, 'matches_current_bundle');

  const result = buildOperationsStatus({
    deviceStatus: 'pending',
    policyStatus: policy,
    checkedAt: '2026-10-15T00:00:00.000Z',
    restoreRoute: '/api/restore/:noteId',
  });
  assert.equal(result.decision.device.status, 'pending');
  assert.equal(result.attackSuite.status, 'not_run');
  assert.equal(result.attackSuite.expectedTotal, 41);
  assert.equal(result.attackSuite.specification, 'not_found_in_repository');
  assert.equal(result.verification.checks.length, 22);
  assert.ok(result.verification.checks.every(check => check.executed === false
    && check.status === 'not_run' && check.actual === null
    && check.requestId === null && check.checkedAt === null));
  assert.equal(result.detection.xdrEventCount, null);
  assert.equal(result.recovery.noteRestore.status, 'configured_not_measured');
  assert.doesNotMatch(JSON.stringify(result), /token|password|content|userId/iu);
});

test('작전실 API는 인증과 no-store 응답을 유지한다', async () => {
  const source = await readFile('api/operations/status.js', 'utf8');
  assert.match(source, /authenticatedDeviceContext/u);
  assert.match(source, /cookieHeader: req\.headers\.cookie/u);
  assert.match(source, /preventPrivateResponseCaching/u);
  assert.doesNotMatch(source, /xdr\/alerts\.log/u);
});
