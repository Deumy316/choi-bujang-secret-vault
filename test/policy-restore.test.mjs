import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadPolicyBaseline } from '../scripts/compare-policy-backup.mjs';
import { restoreTestPolicy } from '../scripts/restore-test-policy.mjs';
import { isOwner } from '../src/note-access.mjs';

const { backup, backupFiles } = loadPolicyBaseline();

test('변조된 시험 정책을 승인 복원하고 A 허용·B 차단을 확인한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-restore-'));
  const target = join(root, 'decider.mjs');
  try {
    writeFileSync(target, `${backupFiles['src/decider.mjs']}// changed\n`, 'utf8');
    const preview = restoreTestPolicy({ backup, backupFiles, targetPath: target, allowedRoot: root });
    assert.equal(preview.changes[0].changed, true);
    assert.equal(preview.applied, false);
    assert.throws(() => restoreTestPolicy({
      backup,
      backupFiles,
      targetPath: target,
      allowedRoot: root,
      apply: true,
    }), /정확한 기준점 버전/);

    const restored = restoreTestPolicy({
      backup,
      backupFiles,
      targetPath: target,
      allowedRoot: root,
      apply: true,
      approval: backup.version,
    });
    assert.equal(restored.applied, true);
    assert.equal(readFileSync(target, 'utf8'), backupFiles['src/decider.mjs']);

    const A = '11111111-1111-4111-8111-111111111111';
    const B = '22222222-2222-4222-8222-222222222222';
    const note = { owner_id: A };
    assert.equal(isOwner(note, A), true);
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal(isOwner(note, B), false, method);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('백업 사본이 변조되면 시험 정책을 유지하고 중단한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-restore-'));
  const target = join(root, 'decider.mjs');
  try {
    writeFileSync(target, '// keep\n', 'utf8');
    assert.throws(() => restoreTestPolicy({
      backup,
      backupFiles: { 'src/decider.mjs': `${backupFiles['src/decider.mjs']}// tampered\n` },
      targetPath: target,
      allowedRoot: root,
      apply: true,
      approval: backup.version,
    }), /해시/);
    assert.equal(readFileSync(target, 'utf8'), '// keep\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('격리 경로 밖의 대상은 복원 전에 거부한다', () => {
  const root = mkdtempSync(join(tmpdir(), 'policy-restore-'));
  try {
    assert.throws(() => restoreTestPolicy({
      backup,
      backupFiles,
      targetPath: join(root, '..', 'decider.mjs'),
      allowedRoot: root,
      apply: true,
      approval: backup.version,
    }), /격리된 시험 정책/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
