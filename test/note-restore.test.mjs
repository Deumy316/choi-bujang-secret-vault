import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeRestoreRpc,
  prepareRestoreRpcInput,
  resolveRestoreRequestId,
} from '../src/note-restore.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const REQUEST = '44444444-4444-4444-8444-444444444444';
const REQUEST_2 = '55555555-5555-4555-8555-555555555555';
const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUDIT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function judge(overrides = {}) {
  return { kind: 'judge', userId: B, runId: RUN, identity: 'b', ...overrides };
}

test('검증된 judge B는 별도 subject 허용목록 없이 복원 입력을 만든다', () => {
  const input = prepareRestoreRpcInput({
    login: judge(), requestedId: TARGET, requestId: REQUEST,
  });
  assert.equal(input.p_caller_id, B);
});

test('검증된 B judge의 sub를 4개 RPC 인자로 변환한다', () => {
  const input = prepareRestoreRpcInput({
    login: judge(),
    requestedId: TARGET,
    requestId: REQUEST,
  });
  assert.deepEqual(input, {
    p_note_id: TARGET,
    p_caller_id: B,
    p_request_id: REQUEST,
    p_judge_run_id: RUN,
  });
  assert.equal(resolveRestoreRequestId(REQUEST), REQUEST);
  assert.match(resolveRestoreRequestId(undefined), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  assert.throws(() => resolveRestoreRequestId('not-a-uuid'), /invalid_restore_request_id/);
  const second = prepareRestoreRpcInput({
    login: judge(), requestedId: TARGET, requestId: REQUEST_2,
  });
  assert.equal(second.p_judge_run_id, RUN);
  assert.notEqual(second.p_request_id, input.p_request_id);
  assert.equal('title' in input || 'content' in input || 'owner_id' in input, false);
});

test('일반 학생·judge A와 잘못된 대상 ID를 RPC 호출 전에 거부한다', () => {
  assert.throws(() => prepareRestoreRpcInput({
    login: judge({ kind: 'student' }), requestedId: TARGET, requestId: REQUEST,
  }), /restore_identity_not_allowed/);
  assert.throws(() => prepareRestoreRpcInput({
    login: judge({ identity: 'a' }), requestedId: TARGET, requestId: REQUEST,
  }), /restore_identity_not_allowed/);
  assert.throws(() => prepareRestoreRpcInput({
    login: judge(), requestedId: 'not-a-uuid', requestId: REQUEST,
  }), /invalid_restore_target/);
});

test('RPC 반환을 검증하고 같은 요청 재시도는 성공으로 재사용한다', async () => {
  const input = prepareRestoreRpcInput({
    login: judge(), requestedId: TARGET, requestId: REQUEST,
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
  assert.deepEqual(await executeRestoreRpc({
    rpc: async () => ({
      error: null,
      data: [{
        restored: false,
        duplicate: true,
        note_id: TARGET,
        owner_id: B,
        title_sha256: '1'.repeat(64),
        content_sha256: '2'.repeat(64),
        backup_version: 'verified-backup-1',
        changed_rows: 0,
        preserved_other_notes: true,
        audit_id: AUDIT,
      }],
    }),
  }, input), { id: TARGET, backupVersion: 'verified-backup-1' });
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
