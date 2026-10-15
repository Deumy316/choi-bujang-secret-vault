import { createHash, randomBytes } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TOKEN = /^[A-Za-z0-9_-]{43}$/u;
const COOKIE_NAME = '__Host-byteback_device';
const STATES = new Set(['pending', 'approved', 'rejected', 'revoked']);

export class DeviceApprovalError extends Error {
  constructor(code, status) {
    super(code);
    this.name = 'DeviceApprovalError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status = 503) {
  throw new DeviceApprovalError(code, status);
}

function validLogin(login) {
  return UUID.test(login?.userId ?? '');
}

export function deviceTokenHash(token) {
  if (!TOKEN.test(token ?? '')) fail('invalid_device_credential', 403);
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function readDeviceToken(cookieHeader) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 8192) return null;
  const prefix = `${COOKIE_NAME}=`;
  const part = cookieHeader.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  const token = part?.slice(prefix.length) ?? '';
  return TOKEN.test(token) ? token : null;
}

export function deviceCookie(token) {
  if (!TOKEN.test(token ?? '')) fail('invalid_device_credential');
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=15552000`;
}

export function clearDeviceCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function createSupabaseDeviceStore(supabase) {
  if (typeof supabase?.from !== 'function') fail('device_store_unavailable');
  return Object.freeze({
    async find(userId, tokenHash) {
      const result = await supabase.from('device_registrations')
        .select('registration_id, user_id, token_hash, status, expires_at')
        .eq('user_id', userId).eq('token_hash', tokenHash).maybeSingle();
      if (result.error) fail('device_store_unavailable');
      return result.data;
    },
    async findById(registrationId) {
      const result = await supabase.from('device_registrations')
        .select('registration_id, user_id, token_hash, status, expires_at')
        .eq('registration_id', registrationId).maybeSingle();
      if (result.error) fail('device_store_unavailable');
      return result.data;
    },
    async create(record) {
      const result = await supabase.from('device_registrations').insert(record)
        .select('registration_id, user_id, token_hash, status, expires_at').single();
      if (result.error || !result.data) fail('device_request_failed');
      return result.data;
    },
    async update(registrationId, values, expectedStatuses) {
      const query = supabase.from('device_registrations').update(values)
        .eq('registration_id', registrationId).in('status', expectedStatuses)
        .gt('expires_at', new Date().toISOString());
      const result = await query
        .select('registration_id, user_id, token_hash, status, expires_at').maybeSingle();
      if (result.error) fail('device_update_failed');
      return result.data;
    },
  });
}

function hasValidExpiry(record) {
  if (typeof record?.expires_at !== 'string') return false;
  const expiresAt = Date.parse(record.expires_at);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function getDeviceApprovalStatus({ store, login, cookieHeader }) {
  if (!validLogin(login)) fail('login_required', 401);
  const token = readDeviceToken(cookieHeader);
  if (!token) return Object.freeze({ status: 'unknown' });
  const record = await store.find(login.userId, deviceTokenHash(token));
  if (record && !hasValidExpiry(record)) {
    return Object.freeze({ status: 'expired', registrationId: record.registration_id });
  }
  const status = STATES.has(record?.status) ? record.status : 'unknown';
  return Object.freeze({ status, registrationId: record?.registration_id });
}

export async function requestDeviceApproval({ store, login, cookieHeader }) {
  if (!validLogin(login)) fail('login_required', 401);
  const existingToken = readDeviceToken(cookieHeader);
  if (existingToken) {
    const existing = await store.find(login.userId, deviceTokenHash(existingToken));
    if (existing && hasValidExpiry(existing)
        && ['pending', 'approved'].includes(existing.status)) {
      return Object.freeze({ status: existing.status, cookie: null });
    }
  }

  const token = randomBytes(32).toString('base64url');
  const record = await store.create({
    user_id: login.userId,
    token_hash: deviceTokenHash(token),
    status: 'pending',
  });
  if (record.user_id !== login.userId || record.status !== 'pending'
      || !hasValidExpiry(record)) {
    fail('device_request_failed');
  }
  return Object.freeze({ status: 'pending', cookie: deviceCookie(token) });
}

export async function requireApprovedDevice(input) {
  const result = await getDeviceApprovalStatus(input);
  if (result.status !== 'approved') fail('device_not_approved', 403);
  return result;
}

export async function unregisterDevice({ store, login, cookieHeader }) {
  if (!validLogin(login)) fail('login_required', 401);
  const token = readDeviceToken(cookieHeader);
  if (!token) fail('device_registration_not_found', 404);
  const record = await store.find(login.userId, deviceTokenHash(token));
  if (!record) fail('device_registration_not_found', 404);
  if (!hasValidExpiry(record)) fail('device_credential_expired', 409);
  if (!['pending', 'approved'].includes(record.status)) {
    fail('device_transition_not_allowed', 409);
  }
  const updated = await store.update(record.registration_id, {
    status: 'revoked',
    revoked_at: new Date().toISOString(),
    decision_actor: login.userId,
  }, ['pending', 'approved']);
  if (!updated) fail('device_state_conflict', 409);
  if (updated.user_id !== login.userId || updated.status !== 'revoked') {
    fail('device_update_failed');
  }
  return Object.freeze({ status: 'revoked', cookie: clearDeviceCookie() });
}

export function parseAdminSubjects(value) {
  if (typeof value !== 'string' || !value.trim()) return Object.freeze([]);
  const subjects = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (!subjects.every((item) => UUID.test(item))) fail('device_admin_configuration_invalid');
  return Object.freeze([...new Set(subjects)]);
}

export async function decideDeviceApproval({ store, login, adminSubjects,
  registrationId, action }) {
  if (!validLogin(login)) fail('login_required', 401);
  if (!adminSubjects.length) fail('device_admin_unavailable');
  if (!adminSubjects.includes(login.userId)) fail('device_admin_required', 403);
  if (!UUID.test(registrationId ?? '') || !['approve', 'reject', 'revoke'].includes(action)) {
    fail('invalid_device_decision', 400);
  }
  const record = await store.findById(registrationId);
  if (!record) fail('device_registration_not_found', 404);
  if (record.user_id === login.userId) fail('device_self_approval_forbidden', 403);
  if (!hasValidExpiry(record)) fail('device_credential_expired', 409);

  const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'revoked';
  const expectedStatuses = action === 'revoke' ? ['pending', 'approved'] : ['pending'];
  if (!expectedStatuses.includes(record.status)) fail('device_transition_not_allowed', 409);
  const now = new Date().toISOString();
  const updated = await store.update(registrationId, {
    status,
    decision_actor: login.userId,
    decided_at: action === 'revoke' ? null : now,
    revoked_at: action === 'revoke' ? now : null,
  }, expectedStatuses);
  if (!updated) fail('device_state_conflict', 409);
  if (updated.status !== status) fail('device_update_failed');
  return Object.freeze({ status });
}
