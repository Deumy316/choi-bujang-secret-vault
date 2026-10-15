import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  decideDeviceApproval,
  getDeviceApprovalStatus,
  requestDeviceApproval,
  requireApprovedDevice,
  unregisterDevice,
} from '../src/device-approval.mjs';
import { preventPrivateResponseCaching } from '../src/http-security.mjs';

const USER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

function memoryStore() {
  const records = [];
  const updates = [];
  return {
    async find(userId, tokenHash) {
      return records.find((record) => record.user_id === userId
        && record.token_hash === tokenHash) ?? null;
    },
    async findById(registrationId) {
      return records.find((record) => record.registration_id === registrationId) ?? null;
    },
    async create(record) {
      const created = {
        registration_id: randomUUID(),
        expires_at: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
        ...record,
      };
      records.push(created);
      return created;
    },
    async update(registrationId, values, expectedStatuses) {
      updates.push([...expectedStatuses]);
      const record = records.find((item) => item.registration_id === registrationId);
      if (!record || !expectedStatuses.includes(record.status)
          || Date.parse(record.expires_at) <= Date.now()) return null;
      Object.assign(record, values);
      return record;
    },
    records,
    updates,
  };
}

test('요청자는 대기만 만들고 별도 관리자가 승인한 기기만 접근한다', async () => {
  const store = memoryStore();
  const login = { userId: USER };
  const request = await requestDeviceApproval({ store, login });
  assert.equal(request.status, 'pending');
  assert.match(request.cookie, /HttpOnly; Secure; SameSite=Strict/u);
  assert.doesNotMatch(JSON.stringify(request), /token_hash/u);

  const cookieHeader = request.cookie.split(';')[0];
  assert.equal((await getDeviceApprovalStatus({ store, login, cookieHeader })).status, 'pending');
  await assert.rejects(
    requireApprovedDevice({ store, login, cookieHeader }),
    (error) => error.code === 'device_not_approved' && error.status === 403,
  );

  const registrationId = (await getDeviceApprovalStatus({ store, login, cookieHeader }))
    .registrationId;
  await assert.rejects(
    decideDeviceApproval({ store, login, adminSubjects: [USER], registrationId,
      action: 'approve' }),
    (error) => error.code === 'device_self_approval_forbidden' && error.status === 403,
  );
  await decideDeviceApproval({ store, login: { userId: ADMIN }, adminSubjects: [ADMIN],
    registrationId, action: 'approve' });
  assert.equal((await requireApprovedDevice({ store, login, cookieHeader })).status, 'approved');

  await unregisterDevice({ store, login, cookieHeader });
  await assert.rejects(
    requireApprovedDevice({ store, login, cookieHeader }),
    (error) => error.code === 'device_not_approved' && error.status === 403,
  );
  await assert.rejects(
    decideDeviceApproval({ store, login: { userId: ADMIN }, adminSubjects: [ADMIN],
      registrationId, action: 'approve' }),
    (error) => error.code === 'device_transition_not_allowed' && error.status === 409,
  );
});

test('거부·취소는 재승인되지 않고 동시 승인·취소는 조건부 갱신된다', async () => {
  const login = { userId: USER };
  const admin = { userId: ADMIN };

  const rejectedStore = memoryStore();
  const rejectedRequest = await requestDeviceApproval({ store: rejectedStore, login });
  const rejectedCookie = rejectedRequest.cookie.split(';')[0];
  const rejectedId = (await getDeviceApprovalStatus({
    store: rejectedStore, login, cookieHeader: rejectedCookie,
  })).registrationId;
  await decideDeviceApproval({ store: rejectedStore, login: admin, adminSubjects: [ADMIN],
    registrationId: rejectedId, action: 'reject' });
  await assert.rejects(
    decideDeviceApproval({ store: rejectedStore, login: admin, adminSubjects: [ADMIN],
      registrationId: rejectedId, action: 'approve' }),
    (error) => error.code === 'device_transition_not_allowed' && error.status === 409,
  );

  const racingStore = memoryStore();
  const racingRequest = await requestDeviceApproval({ store: racingStore, login });
  const racingCookie = racingRequest.cookie.split(';')[0];
  const racingId = (await getDeviceApprovalStatus({
    store: racingStore, login, cookieHeader: racingCookie,
  })).registrationId;
  await Promise.allSettled([
    decideDeviceApproval({ store: racingStore, login: admin, adminSubjects: [ADMIN],
      registrationId: racingId, action: 'approve' }),
    decideDeviceApproval({ store: racingStore, login: admin, adminSubjects: [ADMIN],
      registrationId: racingId, action: 'revoke' }),
  ]);
  assert.equal(racingStore.records[0].status, 'revoked');
  assert.ok(racingStore.updates.some((states) => states.join(',') === 'pending'));
  assert.ok(racingStore.updates.some((states) => states.join(',') === 'pending,approved'));
});

test('만료 시각이 없거나 지난 자격증명은 거부하고 새 요청만 허용한다', async () => {
  const login = { userId: USER };
  for (const expiresAt of [null, new Date(Date.now() - 1000).toISOString()]) {
    const store = memoryStore();
    const request = await requestDeviceApproval({ store, login });
    const cookieHeader = request.cookie.split(';')[0];
    store.records[0].expires_at = expiresAt;
    assert.equal((await getDeviceApprovalStatus({ store, login, cookieHeader })).status,
      'expired');
    await assert.rejects(
      requireApprovedDevice({ store, login, cookieHeader }),
      (error) => error.code === 'device_not_approved' && error.status === 403,
    );
    const replacement = await requestDeviceApproval({ store, login, cookieHeader });
    assert.equal(replacement.status, 'pending');
    assert.notEqual(replacement.cookie.split(';')[0], cookieHeader);
  }
});

test('보호 API와 DB 초안은 서버 승인 게이트와 최소 권한을 유지한다', async () => {
  const handlers = await Promise.all([
    readFile('api/notes.js', 'utf8'),
    readFile('api/notes/[id].js', 'utf8'),
    readFile('api/notes/restore.js', 'utf8'),
  ]);
  assert.ok(handlers.every((source) => source.includes('requireApprovedDevice')));
  assert.ok(handlers.every((source) => source.includes('preventPrivateResponseCaching')));

  const headers = new Map();
  preventPrivateResponseCaching({ setHeader(name, value) { headers.set(name, value); } });
  assert.equal(headers.get('Cache-Control'), 'private, no-store');

  const aliases = await Promise.all([
    readFile('api/notes/[id]/restore.js', 'utf8'),
    readFile('api/restore/[noteId].js', 'utf8'),
  ]);
  assert.ok(aliases.every((source) => source.includes('restoreHandler')));

  const sql = await readFile(
    'supabase/migrations/20261015000000_device_registrations.sql', 'utf8',
  );
  assert.match(sql, /enable row level security/u);
  assert.match(sql, /revoke all.*public, anon, authenticated/u);
  assert.match(sql, /grant select, insert, update.*service_role/u);
  assert.match(sql, /expires_at timestamptz not null default/u);
  assert.doesNotMatch(sql, /grant[^;]*delete/iu);

  const approval = await readFile('src/device-approval.mjs', 'utf8');
  assert.match(approval, /\.in\('status', expectedStatuses\)/u);
  assert.match(approval, /\.gt\('expires_at'/u);
});
