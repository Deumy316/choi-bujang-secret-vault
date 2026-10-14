const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const BACKUP_VERSION = 'initial-create-v1';

export class NoteCreateError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'NoteCreateError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 503) {
  throw new NoteCreateError(code, status);
}

export function prepareCreateNoteRpcInput({ login, noteId, title, content }) {
  if (!UUID.test(login?.userId ?? '')) fail('invalid_note_owner', 403);
  if (!UUID.test(noteId ?? '')) fail('invalid_note_id', 400);
  if (typeof title !== 'string' || title.length < 1 || title.length > 200
      || typeof content !== 'string' || content.length < 1
      || Buffer.byteLength(content, 'utf8') > 100 * 1024) {
    fail('invalid_note_content', 400);
  }
  return Object.freeze({
    p_note_id: noteId,
    p_owner_id: login.userId,
    p_title: title,
    p_content: content,
  });
}

export async function executeCreateNoteRpc(supabase, input) {
  if (typeof supabase?.rpc !== 'function') fail('note_create_transaction_unavailable');
  let response;
  try {
    response = await supabase.rpc('create_note_with_initial_backup', input);
  } catch {
    fail('note_create_transaction_failed');
  }
  if (response?.error) fail('note_create_transaction_failed');

  const result = Array.isArray(response?.data) ? response.data[0] : response?.data;
  if (result?.created !== true || result.backup_created !== true
      || result.note_id !== input.p_note_id || result.owner_id !== input.p_owner_id
      || result.backup_version !== BACKUP_VERSION
      || !SHA256.test(result.title_sha256 ?? '')
      || !SHA256.test(result.content_sha256 ?? '')
      || !SHA256.test(result.record_sha256 ?? '')) {
    fail('note_create_post_verification_failed');
  }
  return Object.freeze({ id: result.note_id });
}
