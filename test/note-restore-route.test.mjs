import assert from 'node:assert/strict';
import test from 'node:test';
import pathRestoreHandler, {
  createPathRestoreHandler,
} from '../api/notes/[id]/restore.js';

const NOTE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

test('동적 복원 경로도 로그인 없는 요청을 401로 거부한다', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = 'https://student-fixture.example.org';
  process.env.SUPABASE_SECRET_KEY = 'test-only-server-key';
  try {
    const res = response();
    await pathRestoreHandler({
      method: 'POST', headers: {}, query: { id: NOTE_ID }, body: {},
    }, res);
    assert.equal(res.statusCode, 401);
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});

test('본문 ID가 경로 ID와 다르면 기존 처리기의 400 규칙으로 보낸다', async () => {
  const handler = createPathRestoreHandler(async (req, res) => {
    const invalid = Object.keys(req.body).some(key => key !== 'id');
    return res.status(invalid ? 400 : 200).json({ id: req.body.id });
  });
  const res = response();
  await handler({
    query: { id: NOTE_ID },
    body: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.id, NOTE_ID);
});

test('정상 요청은 URL ID만 기존 복원 처리기로 전달한다', async () => {
  let forwarded;
  const handler = createPathRestoreHandler(async (req, res) => {
    forwarded = req.body;
    return res.status(200).json({ restored: true, id: req.body.id });
  });
  const res = response();
  await handler({ query: { id: NOTE_ID }, body: {} }, res);
  assert.deepEqual(forwarded, { id: NOTE_ID });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { restored: true, id: NOTE_ID });
});
