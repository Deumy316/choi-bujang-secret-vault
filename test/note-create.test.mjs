import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeCreateNoteRpc,
  prepareCreateNoteRpcInput,
} from '../src/note-create.mjs';

const OWNER = '22222222-2222-4222-8222-222222222222';
const NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('new note input uses the verified login owner and no client backup fields', () => {
  assert.deepEqual(prepareCreateNoteRpcInput({
    login: { userId: OWNER },
    noteId: NOTE_ID,
    title: 'Original title',
    content: 'Original content',
  }), {
    p_note_id: NOTE_ID,
    p_owner_id: OWNER,
    p_title: 'Original title',
    p_content: 'Original content',
  });
  assert.throws(() => prepareCreateNoteRpcInput({
    login: { userId: 'not-a-uuid' },
    noteId: NOTE_ID,
    title: 'Title',
    content: 'Content',
  }), /invalid_note_owner/);
});

test('create RPC result must confirm both the note and initial backup', async () => {
  const input = prepareCreateNoteRpcInput({
    login: { userId: OWNER },
    noteId: NOTE_ID,
    title: 'Original title',
    content: 'Original content',
  });
  const supabase = {
    rpc: async (name, args) => {
      assert.equal(name, 'create_note_with_initial_backup');
      assert.deepEqual(args, input);
      return {
        error: null,
        data: [{
          created: true,
          backup_created: true,
          note_id: NOTE_ID,
          owner_id: OWNER,
          title_sha256: '1'.repeat(64),
          content_sha256: '2'.repeat(64),
          record_sha256: '3'.repeat(64),
          backup_version: 'initial-create-v1',
        }],
      };
    },
  };
  assert.deepEqual(await executeCreateNoteRpc(supabase, input), { id: NOTE_ID });
  await assert.rejects(executeCreateNoteRpc({
    rpc: async () => ({ error: { message: 'private detail' }, data: null }),
  }, input), error => error.code === 'note_create_transaction_failed'
    && !error.message.includes('private detail'));
  await assert.rejects(executeCreateNoteRpc({
    rpc: async () => ({ error: null, data: [{ created: true }] }),
  }, input), /note_create_post_verification_failed/);
});
