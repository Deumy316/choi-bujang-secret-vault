import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeRestoreRpc,
  isRestoreAdmin,
  parseRestoreAdminSubjects,
  prepareRestoreRpcInput,
} from '../src/note-restore.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUDIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function judge(overrides = {}) {
  return { kind: 'judge', userId: B, runId: RUN, identity: 'b', ...overrides };
}

test('관리자 허용목록은 judge subject에만 적용된다', () => {
  const admins = parseRestoreAdminSubjects(B);
  assert.equal(isRestoreAdmin(judge(), admins), true);
  assert.equal(isRestoreAdmin(judge({ kind: 'student' }), admins), false);
  assert.equal(isRestoreAdmin(judge({ userId: A }), admins), false);
});

test('검증된 B judge의 sub를 4개 RPC 인자로 변환한다', () => {
  const input = prepareRestoreRpcInput({
    login: judge(),
    requestedId: TARGET,
  });
  assert.deepEqual(input, {
    p_note_id: TARGET,
    p_caller_id: B,
    p_request_id: RUN,
    p_judge_run_id: RUN,
  });
  assert.equal('title' in input || 'content' in input || 'owner_id' in input, false);
});

test('A identity와 잘못된 대상 ID를 RPC 호출 전에 거부한다', () => {
  assert.throws(() => prepareRestoreRpcInput({
    login: judge({ identity: 'a' }), requestedId: TARGET,
  }), /restore_identity_not_allowed/);
  assert.throws(() => prepareRestoreRpcInput({
    login: judge(), requestedId: 'not-a-uuid',
  }), /invalid_restore_target/);
});

test('RPC 반환을 검증하고 RPC 부재·DB 오류·중복을 원문 없이 거부한다', async () => {
  const input = prepareRestoreRpcInput({
    login: judge(), requestedId: TARGET,
  });
  const supabase = {
    rpc: async (name, args) => {
      assert.equal(name, 'restore_single_verified_note');
      assert.deepEqual(args, input);
      return {
        error: null,
        data: [{
          restored: true,
          duplicate: false,
          note_id: TARGET,
          owner_id: B,
          title_sha256: '1'.repeat(64),
          content_sha256: '2'.repeat(64),
          backup_version: 'verified-backup-1',
          changed_rows: 1,
          preserved_other_notes: true,
          audit_id: AUDIT,
        }],
      };
    },
  };
  assert.deepEqual(await executeRestoreRpc(supabase, input), {
    id: TARGET,
    backupVersion: 'verified-backup-1',
  });
  await assert.rejects(executeRestoreRpc({}, input), /restore_transaction_unavailable/);
  await assert.rejects(executeRestoreRpc({
    rpc: async () => ({ data: null, error: { message: 'internal detail' } }),
  }, input), error => error.code === 'restore_transaction_failed'
    && !error.message.includes('internal detail'));
  await assert.rejects(executeRestoreRpc({
    rpc: async () => ({ data: [{ duplicate: true }], error: null }),
  }, input), /duplicate_restore/);
  await assert.rejects(executeRestoreRpc({
    rpc: async () => ({
      error: null,
      data: [{
        restored: true,
        duplicate: false,
        note_id: TARGET,
        owner_id: A,
        title_sha256: '1'.repeat(64),
        content_sha256: '2'.repeat(64),
        backup_version: 'verified-backup-1',
        changed_rows: 1,
        preserved_other_notes: true,
        audit_id: AUDIT,
      }],
    }),
  }, input), /restore_post_verification_failed/);
});
