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

export function parseRestoreAdminSubjects(value) {
  if (typeof value !== 'string' || !value.trim()) fail('missing_restore_admins');
  const subjects = value.split(',').map(item => item.trim());
  if (subjects.some(item => !UUID_V4.test(item)) || new Set(subjects).size !== subjects.length) {
    fail('invalid_restore_admins');
  }
  return new Set(subjects);
}

export function isRestoreAdmin(login, subjects) {
  return login?.kind === 'judge' && subjects instanceof Set && subjects.has(login.userId);
}

export function prepareRestoreRpcInput({ login, requestedId }) {
  if (typeof requestedId !== 'string' || !UUID.test(requestedId)) {
    fail('invalid_restore_target', 400);
  }
  if (login?.kind !== 'judge' || login.identity !== 'b'
      || !UUID_V4.test(login.userId ?? '') || !UUID_V4.test(login.runId ?? '')) {
    fail('restore_identity_not_allowed', 403);
  }
  return Object.freeze({
    p_note_id: requestedId,
    p_caller_id: login.userId,
    p_request_id: login.runId,
    p_judge_run_id: login.runId,
  });
}

function validateRpcResult(data, input) {
  const result = Array.isArray(data) ? data[0] : data;
  if (result?.duplicate === true) fail('duplicate_restore', 409);
  if (result?.restored !== true || result.note_id !== input.p_note_id
      || result.owner_id !== input.p_caller_id
      || !SHA256.test(result.title_sha256 ?? '')
      || !SHA256.test(result.content_sha256 ?? '')
      || !VERSION.test(result.backup_version ?? '')
      || result.changed_rows !== 1 || result.preserved_other_notes !== true
      || !UUID.test(result.audit_id ?? '')) {
    fail('restore_post_verification_failed');
  }
  return Object.freeze({
    id: result.note_id,
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
