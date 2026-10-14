import assert from 'node:assert/strict';
import test from 'node:test';
import { noteHashes, restoreOneVerifiedNote } from '../src/note-restore.mjs';

// 10단계: 처리기가 사본을 다시 읽어 검증하고, 복원 뒤 한 건을 다시 읽어 대조하는지 확인(가짜 DB, 심판 판정 아님)
const NOTE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = '22222222-2222-4222-8222-222222222222';
const ORIGINAL = { title: '원래 제목 ', content: '원래 본문\n' };   // 앞뒤 공백·줄바꿈까지 원래 바이트
const input = { p_note_id: NOTE, p_caller_id: B, p_request_id: '33333333-3333-4333-8333-333333333333', p_judge_run_id: '44444444-4444-4444-8444-444444444444' };

function fakeDb({ backup, noteAfter, rpcResult }) {
  const calls = { rpc: 0 };
  const table = (rows) => ({
    select() { return this; }, eq() { return this; },
    async maybeSingle() { return { data: rows, error: null }; },
  });
  return {
    calls,
    from(name) { return table(name === 'vault_note_backups' ? backup : noteAfter); },
    async rpc() { calls.rpc += 1; return { data: [rpcResult], error: null }; },
  };
}

function goodBackup() {
  const h = noteHashes({ noteId: NOTE, ownerId: B, ...ORIGINAL });
  return { backup_id: 'b1', backup_version: 'initial-create-v1', note_id: NOTE, owner_id: B, ...ORIGINAL,
    title_sha256: h.titleSha256, content_sha256: h.contentSha256, record_sha256: h.recordSha256,
    verification_status: 'passed', approved_for_restore: true };
}
function rpcOk() {
  const h = noteHashes({ noteId: NOTE, ownerId: B, ...ORIGINAL });
  return { restored: true, duplicate: false, changed_rows: 1, note_id: NOTE, owner_id: B,
    title_sha256: h.titleSha256, content_sha256: h.contentSha256, backup_version: 'initial-create-v1',
    preserved_other_notes: true, audit_id: '55555555-5555-4555-8555-555555555555' };
}

test('검증된 사본만 복원하고, 복원한 한 건의 ID·소유자·지문이 사본과 같음을 다시 확인한다', async () => {
  const db = fakeDb({ backup: goodBackup(), noteAfter: { note_id: NOTE, owner_id: B, ...ORIGINAL }, rpcResult: rpcOk() });
  const out = await restoreOneVerifiedNote(db, input);
  assert.equal(db.calls.rpc, 1);
  assert.equal(out.id, NOTE);
  assert.equal(out.ownerId, B);
  assert.equal(out.contentSha256, noteHashes({ noteId: NOTE, ownerId: B, ...ORIGINAL }).contentSha256);
});

test('사본 내용이나 지문이 어긋나면 복원(RPC)을 부르지 않고 backup_unverified로 멈춘다', async () => {
  const bad = { ...goodBackup(), content: '몰래 바뀐 사본' };
  const db = fakeDb({ backup: bad, noteAfter: null, rpcResult: rpcOk() });
  await assert.rejects(restoreOneVerifiedNote(db, input), /backup_unverified/);
  assert.equal(db.calls.rpc, 0);
  const db2 = fakeDb({ backup: { ...goodBackup(), owner_id: '11111111-1111-4111-8111-111111111111' }, noteAfter: null, rpcResult: rpcOk() });
  await assert.rejects(restoreOneVerifiedNote(db2, input), /backup_unverified/);
  assert.equal(db2.calls.rpc, 0);
});

test('사본이 없으면 404로 멈춘다', async () => {
  const db = fakeDb({ backup: null, noteAfter: null, rpcResult: rpcOk() });
  await assert.rejects(restoreOneVerifiedNote(db, input), (e) => e.code === 'backup_not_found' && e.status === 404);
  assert.equal(db.calls.rpc, 0);
});

test('복원 뒤 다시 읽은 메모의 바이트·소유자가 사본과 다르면 restore_mismatch', async () => {
  const trimmed = { note_id: NOTE, owner_id: B, title: ORIGINAL.title.trim(), content: ORIGINAL.content.trim() };
  await assert.rejects(restoreOneVerifiedNote(fakeDb({ backup: goodBackup(), noteAfter: trimmed, rpcResult: rpcOk() }), input), /restore_mismatch/);
  const otherOwner = { note_id: NOTE, owner_id: '11111111-1111-4111-8111-111111111111', ...ORIGINAL };
  await assert.rejects(restoreOneVerifiedNote(fakeDb({ backup: goodBackup(), noteAfter: otherOwner, rpcResult: rpcOk() }), input), /restore_mismatch/);
});
