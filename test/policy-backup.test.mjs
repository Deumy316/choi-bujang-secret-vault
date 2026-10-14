import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { backupDigest, comparePolicyBackup } from '../scripts/compare-policy-backup.mjs';

const content = "export const RULE_IDS = Object.freeze(['device_registered']);\n";

function verifiedBackup() {
  const backup = {
    schema: 'aleph.policy-backup.v1',
    version: 'safe-1',
    createdAt: '2026-10-01T00:00:00.000Z',
    sourceCommit: '1'.repeat(40),
    files: [{
      path: 'src/decider.mjs',
      backupPath: 'backups/policy/decider.mjs',
      byteLength: Buffer.byteLength(content, 'utf8'),
      sha256: createHash('sha256').update(content).digest('hex'),
    }],
    verification: {
      status: 'passed',
      scope: 'local_only',
      verifiedAt: '2026-10-01T00:01:00.000Z',
      checks: [
        { name: 'decider:test', passed: true, passedCount: 24, totalCount: 24 },
        { name: 'ownership-resource:test', passed: true, passedCount: 7, totalCount: 7 },
      ],
      notRun: [{ name: 'database-http-integration', status: 'not_run' }],
    },
  };
  const digest = backupDigest(backup);
  backup.integrity = { algorithm: 'sha256', sha256: digest };
  backup.verification.backupSha256 = digest;
  return backup;
}

test('검증된 백업은 파일별 기존 값과 복원 예정 값을 비교한다', () => {
  const result = comparePolicyBackup(verifiedBackup(), { 'src/decider.mjs': `${content}// changed\n` },
    { 'src/decider.mjs': content });
  assert.equal(result.version, 'safe-1');
  assert.equal(result.changes[0].target, 'src/decider.mjs');
  assert.equal(result.changes[0].changed, true);
});

test('무결성 해시가 다르면 비교를 중단한다', () => {
  const backup = verifiedBackup();
  assert.throws(() => comparePolicyBackup(backup, { 'src/decider.mjs': content },
    { 'src/decider.mjs': `${content}// tampered\n` }), /해시/);
});

test('검증 근거가 없으면 비교를 중단한다', () => {
  const backup = verifiedBackup();
  backup.verification.checks = [];
  const digest = backupDigest(backup);
  backup.integrity.sha256 = digest;
  backup.verification.backupSha256 = digest;
  assert.throws(() => comparePolicyBackup(backup, { 'src/decider.mjs': content },
    { 'src/decider.mjs': content }), /검증 근거/);
});
