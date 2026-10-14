import { createHash, randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const VERSION = /^[A-Za-z0-9._-]{1,64}$/u;

export class NoteRestoreError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 503) {
  throw new NoteRestoreError(code, status);
}

export function resolveRestoreRequestId(value) {
  if (value === undefined) return randomUUID();
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    fail('invalid_restore_request_id', 400);
  }
  return value;
}

export function prepareRestoreRpcInput({ login, requestedId, requestId }) {
  if (typeof requestedId !== 'string' || !UUID.test(requestedId)) {
    fail('invalid_restore_target', 400);
  }
  if (login?.kind !== 'judge' || login.identity !== 'b'
      || !UUID_V4.test(login.userId ?? '') || !UUID_V4.test(login.runId ?? '')) {
    fail('restore_identity_not_allowed', 403);
  }
  if (!UUID_V4.test(requestId ?? '')) fail('invalid_restore_request_id', 400);
  return Object.freeze({
    p_note_id: requestedId,
    p_caller_id: login.userId,
    p_request_id: requestId,
    p_judge_run_id: login.runId,
  });
}

function validateRpcResult(data, input) {
  const result = Array.isArray(data) ? data[0] : data;
  const validOutcome = result?.duplicate === true
    ? result.restored === false && result.changed_rows === 0
    : result?.duplicate === false && result.restored === true && result.changed_rows === 1;
  if (!validOutcome || result.note_id !== input.p_note_id
      || result.owner_id !== input.p_caller_id
      || !SHA256.test(result.title_sha256 ?? '')
      || !SHA256.test(result.content_sha256 ?? '')
      || !VERSION.test(result.backup_version ?? '')
      || result.preserved_other_notes !== true
      || !UUID.test(result.audit_id ?? '')) {
    fail('restore_post_verification_failed');
  }
  return Object.freeze({
    id: result.note_id,
    ownerId: result.owner_id,
    titleSha256: result.title_sha256,
    contentSha256: result.content_sha256,
    backupVersion: result.backup_version,
  });
}

export async function executeRestoreRpc(supabase, input) {
  if (typeof supabase?.rpc !== 'function') fail('restore_transaction_unavailable');
  let response;
  try {
    response = await supabase.rpc('restore_single_verified_note', input);
  } catch {
    fail('restore_transaction_failed');
  }
  if (response?.error) fail('restore_transaction_failed');
  return validateRpcResult(response?.data, input);
}

// ── 10단계: 처리기가 직접 사본을 다시 읽어 검증하고, 복원 뒤 한 건을 다시 읽어 대조합니다 ──
// 지문 방식은 DB(create_note_with_initial_backup, restore_single_verified_note)와 같습니다.
//   titleSha256   = sha256(title UTF-8)
//   contentSha256 = sha256(content UTF-8)
//   recordSha256  = sha256(lower(noteId) + "\n" + lower(ownerId) + "\n" + titleSha256 + "\n" + contentSha256)
export const sha256Hex = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
export function noteHashes({ noteId, ownerId, title, content }) {
  const titleSha256 = sha256Hex(title);
  const contentSha256 = sha256Hex(content);
  const recordSha256 = sha256Hex(`${String(noteId).toLowerCase()}\n${String(ownerId).toLowerCase()}\n${titleSha256}\n${contentSha256}`);
  return { titleSha256, contentSha256, recordSha256 };
}
const same = (a, b) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

// 1) 복원 전에: 호출자 소유의 승인된 사본을 읽고 지문을 다시 계산해 저장값과 대조합니다.
//    사본이 없으면 404, 하나라도 다르면 409로 멈추고 RPC(복원)를 부르지 않습니다.
export async function readVerifiedBackup(supabase, { noteId, ownerId }) {
  if (typeof supabase?.from !== 'function') fail('backup_read_unavailable');
  let response;
  try {
    response = await supabase.from('vault_note_backups')
      .select('backup_id, backup_version, note_id, owner_id, title, content, title_sha256, content_sha256, record_sha256, verification_status, approved_for_restore')
      .eq('note_id', noteId).eq('owner_id', ownerId).eq('approved_for_restore', true)
      .maybeSingle();
  } catch {
    fail('backup_read_failed');
  }
  if (response?.error) fail('backup_read_failed');
  const backup = response?.data;
  if (!backup) fail('backup_not_found', 404);
  const hashes = noteHashes({ noteId: backup.note_id, ownerId: backup.owner_id, title: backup.title, content: backup.content });
  if (!same(backup.note_id, noteId) || !same(backup.owner_id, ownerId)
      || backup.verification_status !== 'passed' || backup.approved_for_restore !== true
      || hashes.titleSha256 !== backup.title_sha256
      || hashes.contentSha256 !== backup.content_sha256
      || hashes.recordSha256 !== backup.record_sha256) {
    fail('backup_unverified', 409);
  }
  return Object.freeze({ backupId: backup.backup_id, backupVersion: backup.backup_version,
    noteId: String(backup.note_id).toLowerCase(), ownerId: String(backup.owner_id).toLowerCase(), ...hashes });
}

// 2) 복원 뒤에: 메모 한 건을 다시 읽어 ID·소유자·제목/본문 지문이 검증한 사본과 같은지 대조합니다.
export async function verifyRestoredNote(supabase, backup) {
  let response;
  try {
    response = await supabase.from('notes').select('note_id, owner_id, title, content')
      .eq('note_id', backup.noteId).maybeSingle();
  } catch {
    fail('restore_reread_failed');
  }
  if (response?.error) fail('restore_reread_failed');
  const note = response?.data;
  if (!note) fail('restore_mismatch', 409);
  const hashes = noteHashes({ noteId: note.note_id, ownerId: note.owner_id, title: note.title, content: note.content });
  if (!same(note.note_id, backup.noteId) || !same(note.owner_id, backup.ownerId)
      || hashes.titleSha256 !== backup.titleSha256 || hashes.contentSha256 !== backup.contentSha256
      || hashes.recordSha256 !== backup.recordSha256) {
    fail('restore_mismatch', 409);
  }
  return Object.freeze({ id: backup.noteId, ownerId: backup.ownerId,
    titleSha256: hashes.titleSha256, contentSha256: hashes.contentSha256, recordSha256: hashes.recordSha256 });
}

// 복원 전체 순서: 사본 검증 → (통과했을 때만) 원자적 복원 RPC → RPC 결과 지문 대조 → 복원한 한 건 재대조
export async function restoreOneVerifiedNote(supabase, input) {
  const backup = await readVerifiedBackup(supabase, { noteId: input.p_note_id, ownerId: input.p_caller_id });
  const rpc = await executeRestoreRpc(supabase, input);
  if (!same(rpc.id, backup.noteId) || !same(rpc.ownerId, backup.ownerId)
      || rpc.titleSha256 !== backup.titleSha256 || rpc.contentSha256 !== backup.contentSha256) {
    fail('restore_mismatch', 409);
  }
  const after = await verifyRestoredNote(supabase, backup);
  return Object.freeze({ ...after, backupVersion: rpc.backupVersion });
}
