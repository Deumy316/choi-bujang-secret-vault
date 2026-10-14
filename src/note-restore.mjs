import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;

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

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function noteBackupDigest(backup) {
  return sha256(canonicalJson({
    schema: backup.schema,
    version: backup.version,
    createdAt: backup.createdAt,
    source: backup.source,
    note: backup.note,
    verification: backup.verification,
  }));
}

export function validatePrivateNoteBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)
      || backup.schema !== 'aleph.note-restore.v1'
      || typeof backup.version !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/u.test(backup.version)
      || !validDate(backup.createdAt) || backup.source !== 'private_server_backup') {
    fail('invalid_note_backup');
  }
  const note = backup.note;
  if (!note || typeof note !== 'object' || !UUID.test(note.id ?? '') || !UUID.test(note.ownerId ?? '')
      || typeof note.title !== 'string' || note.title.length < 1 || note.title.length > 200
      || typeof note.content !== 'string' || note.content.length < 1
      || Buffer.byteLength(note.content, 'utf8') > 100 * 1024
      || !SHA256.test(note.contentSha256 ?? '') || sha256(note.content) !== note.contentSha256) {
    fail('invalid_note_backup_content');
  }
  const verification = backup.verification;
  if (verification?.status !== 'passed' || !validDate(verification.verifiedAt)
      || Date.parse(verification.verifiedAt) < Date.parse(backup.createdAt)
      || !Array.isArray(verification.checks)
      || !verification.checks.some(check => check?.name === 'note-backup-export' && check.passed === true)
      || verification.checks.some(check => typeof check?.name !== 'string' || check.passed !== true)) {
    fail('unverified_note_backup');
  }
  const digest = noteBackupDigest(backup);
  if (backup.integrity?.algorithm !== 'sha256' || backup.integrity.envelopeSha256 !== digest) {
    fail('note_backup_integrity_mismatch');
  }
  return Object.freeze({ ...backup, note: Object.freeze({ ...note }) });
}

export function parsePrivateNoteBackup(encoded) {
  if (typeof encoded !== 'string' || encoded.length < 1 || encoded.length > 256 * 1024
      || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)) fail('missing_private_note_backup');
  let bytes;
  try { bytes = Buffer.from(encoded, 'base64'); } catch { fail('invalid_note_backup'); }
  if (bytes.toString('base64') !== encoded) fail('invalid_note_backup');
  let backup;
  try { backup = JSON.parse(bytes.toString('utf8')); } catch { fail('invalid_note_backup'); }
  return validatePrivateNoteBackup(backup);
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

export async function restoreVerifiedNote({ backup, requestedId, allowedOwnerId, transaction }) {
  const verified = validatePrivateNoteBackup(backup);
  if (requestedId !== verified.note.id) fail('restore_target_not_allowed', 403);
  if (!UUID.test(allowedOwnerId ?? '') || verified.note.ownerId !== allowedOwnerId) {
    fail('restore_owner_not_allowed', 403);
  }
  if (typeof transaction !== 'function') fail('restore_transaction_unavailable');

  const result = await transaction({
    id: verified.note.id,
    ownerId: verified.note.ownerId,
    title: verified.note.title,
    content: verified.note.content,
    contentSha256: verified.note.contentSha256,
    backupVersion: verified.version,
  });
  if (result?.duplicate === true) fail('duplicate_restore', 409);
  if (result?.restored !== true || result.id !== verified.note.id
      || result.ownerId !== verified.note.ownerId || result.contentSha256 !== verified.note.contentSha256
      || result.changedRows !== 1 || result.preservedOtherNotes !== true) {
    fail('restore_post_verification_failed');
  }
  return Object.freeze({ id: verified.note.id, backupVersion: verified.version });
}
