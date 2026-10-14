import assert from 'node:assert/strict';
import test from 'node:test';
import pathRestoreHandler from '../api/restore/[noteId].js';
import { createRestorePathHandler } from '../src/restore-route.mjs';

const NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function response() {
  return {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; },
    setHeader() {},
  };
}

test('새 복원 경로도 로그인 없는 요청을 401로 거부한다', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://student-fixture.example.org';
  process.env.SUPABASE_SECRET_KEY = 'test-only-server-key';
  try {
    const res = response();
    await pathRestoreHandler({
      method: 'POST', headers: {}, url: `/api/restore/${NOTE_ID}`, body: {},
    }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});

test('본문이나 쿼리의 다른 ID는 기존 처리기의 400 규칙으로 보낸다', async () => {
  const handler = createRestorePathHandler(async (req, res) => {
    const invalid = Object.keys(req.body).some(key => key !== 'id');
    return res.status(invalid ? 400 : 200).json({ id: req.body.id });
  });
  for (const request of [
    { url: `/api/restore/${NOTE_ID}`, body: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } },
    { url: `/api/restore/${NOTE_ID}?noteId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, body: {} },
  ]) {
    const res = response();
    await handler({ method: 'POST', headers: {}, ...request }, res);
    assert.equal(res.statusCode, 400);
  }
});

test('잘못된 UUID를 거부하고 정상 URL ID만 기존 처리기로 전달한다', async () => {
  const seen = [];
  const handler = createRestorePathHandler(async (req, res) => {
    seen.push(req.body);
    const invalid = Object.keys(req.body).some(key => key !== 'id');
    return res.status(invalid ? 400 : 200).json({ id: req.body.id });
  });
  const bad = response();
  await handler({ method: 'POST', headers: {}, url: '/api/restore/not-a-uuid', body: {} }, bad);
  assert.equal(bad.statusCode, 400);

  const good = response();
  await handler({ method: 'POST', headers: {}, url: `/api/restore/${NOTE_ID}`, body: {} }, good);
  assert.equal(good.statusCode, 200);
  assert.deepEqual(seen.at(-1), { id: NOTE_ID });
});
