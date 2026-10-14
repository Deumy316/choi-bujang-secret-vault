import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  isRestoreAdmin,
  noteBackupDigest,
  parsePrivateNoteBackup,
  parseRestoreAdminSubjects,
  restoreVerifiedNote,
  validatePrivateNoteBackup,
} from '../src/note-restore.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONTENT = 'public fictional restore fixture';

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function makeBackup(version = 'new-baseline-1') {
  const backup = {
    schema: 'aleph.note-restore.v1',
    version,
    createdAt: '2026-10-14T01:00:00.000Z',
    source: 'private_server_backup',
    note: {
      id: TARGET,
      ownerId: B,
      title: 'fictional title',
      content: CONTENT,
      contentSha256: hash(CONTENT),
    },
    verification: {
      status: 'passed',
      verifiedAt: '2026-10-14T01:01:00.000Z',
      checks: [{ name: 'note-backup-export', passed: true }],
    },
  };
  backup.integrity = { algorithm: 'sha256', envelopeSha256: noteBackupDigest(backup) };
  return backup;
}

function isolatedTransaction(notes, restoredVersions, audit) {
  return async note => {
    if (restoredVersions.has(note.backupVersion)) return { duplicate: true };
    const beforeOther = [...notes.entries()].filter(([id]) => id !== note.id);
    const next = new Map(notes);
    next.set(note.id, { id: note.id, ownerId: note.ownerId, title: note.title, content: note.content });
    const afterOther = [...next.entries()].filter(([id]) => id !== note.id);
    assert.deepEqual(afterOther, beforeOther);
    assert.deepEqual(audit, ['existing-audit-entry']);
    notes.clear();
    for (const [id, value] of next) notes.set(id, value);
    restoredVersions.add(note.backupVersion);
    return {
      restored: true,
      duplicate: false,
      id: note.id,
      ownerId: note.ownerId,
      contentSha256: hash(note.content),
      changedRows: 1,
      preservedOtherNotes: true,
    };
  };
}

test('변조된 B 메모 한 건만 복원하고 다른 메모와 감사 기록을 보존한다', async () => {
  const notes = new Map([
    [TARGET, { id: TARGET, ownerId: B, title: 'changed', content: 'changed' }],
    [OTHER, { id: OTHER, ownerId: A, title: 'other', content: 'other' }],
  ]);
  const audit = ['existing-audit-entry'];
  await restoreVerifiedNote({
    backup: makeBackup(),
    requestedId: TARGET,
    allowedOwnerId: B,
    transaction: isolatedTransaction(notes, new Set(), audit),
  });
  assert.equal(notes.get(TARGET).content, CONTENT);
  assert.equal(notes.get(OTHER).content, 'other');
  assert.deepEqual(audit, ['existing-audit-entry']);
});

test('삭제된 B 메모를 같은 ID와 소유자로 재생성하고 중복 복원을 거부한다', async () => {
  const notes = new Map([[OTHER, { id: OTHER, ownerId: A, content: 'other' }]]);
  const versions = new Set();
  const transaction = isolatedTransaction(notes, versions, ['existing-audit-entry']);
  const backup = makeBackup('new-baseline-2');
  await restoreVerifiedNote({ backup, requestedId: TARGET, allowedOwnerId: B, transaction });
  assert.equal(notes.get(TARGET).id, TARGET);
  assert.equal(notes.get(TARGET).ownerId, B);
  await assert.rejects(
    restoreVerifiedNote({ backup, requestedId: TARGET, allowedOwnerId: B, transaction }),
    /duplicate_restore/,
  );
});

test('권한·대상 ID·소유자·내용 해시 위반을 거부한다', async () => {
  const admins = parseRestoreAdminSubjects(ADMIN);
  assert.equal(isRestoreAdmin({ kind: 'judge', userId: ADMIN }, admins), true);
  assert.equal(isRestoreAdmin({ kind: 'student', userId: ADMIN }, admins), false);
  assert.equal(isRestoreAdmin({ kind: 'judge', userId: A }, admins), false);

  const transaction = async () => assert.fail('transaction must not run');
  await assert.rejects(restoreVerifiedNote({
    backup: makeBackup(), requestedId: OTHER, allowedOwnerId: B, transaction,
  }), /restore_target_not_allowed/);
  await assert.rejects(restoreVerifiedNote({
    backup: makeBackup(), requestedId: TARGET, allowedOwnerId: A, transaction,
  }), /restore_owner_not_allowed/);

  const badHash = makeBackup();
  badHash.note.contentSha256 = '0'.repeat(64);
  badHash.integrity.envelopeSha256 = noteBackupDigest(badHash);
  assert.throws(() => validatePrivateNoteBackup(badHash), /invalid_note_backup_content/);
});

test('백업 봉투 위조와 사후 검증 실패를 거부한다', async () => {
  const valid = makeBackup();
  const encoded = Buffer.from(JSON.stringify(valid), 'utf8').toString('base64');
  assert.equal(parsePrivateNoteBackup(encoded).note.id, TARGET);

  const unverified = makeBackup();
  unverified.verification.checks = [];
  unverified.integrity.envelopeSha256 = noteBackupDigest(unverified);
  assert.throws(() => validatePrivateNoteBackup(unverified), /unverified_note_backup/);

  const forged = makeBackup();
  forged.note.title = 'forged';
  assert.throws(() => validatePrivateNoteBackup(forged), /note_backup_integrity_mismatch/);

  await assert.rejects(restoreVerifiedNote({
    backup: makeBackup(),
    requestedId: TARGET,
    allowedOwnerId: B,
    transaction: async note => ({
      restored: true,
      id: note.id,
      ownerId: note.ownerId,
      contentSha256: '0'.repeat(64),
      changedRows: 1,
      preservedOtherNotes: true,
    }),
  }), /restore_post_verification_failed/);
});
