import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import {
  restoreOneVerifiedNote,
  NoteRestoreError,
  prepareRestoreRpcInput,
  resolveRestoreRequestId,
} from '../../src/note-restore.mjs';

var require = createRequire(import.meta.url);
var config = require('../../aleph.config.json');
var verifyLogin;

function getVerifier() {
  if (!verifyLogin) {
    verifyLogin = createLoginVerifier({
      config: config,
      supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    });
  }
  return verifyLogin;
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  let login;
  try { login = await getVerifier()(req.headers.authorization); }
  catch { return res.status(500).json({ error: 'Login verification error' }); }
  if (!login) return res.status(401).json({ error: 'Login required' });

  const body = req.body || {};
  if (typeof body.id !== 'string' || Object.keys(body).some(key => key !== 'id')) {
    return res.status(400).json({ error: 'Only the approved note id is accepted' });
  }

  try {
    const requestId = resolveRestoreRequestId(req.headers['idempotency-key']);
    res.setHeader('Idempotency-Key', requestId);
    const input = prepareRestoreRpcInput({
      login,
      requestedId: body.id,
      requestId,
    });
    // 사본을 다시 읽어 지문 검증 → 통과 시에만 복원 → 복원한 한 건을 다시 읽어 ID·소유자·지문 대조
    const restored = await restoreOneVerifiedNote(getSupabase(), input);
    // 10단계: 되살린 한 건의 ID·소유자·내용 해시를 응답에 함께 돌려줍니다(RPC가 사본과 대조를 마친 값, 본문은 넣지 않음).
    return res.status(200).json({
      id: restored.id, owner: 'self', ownerMatchesCaller: restored.ownerId === login.userId,
      titleSha256: restored.titleSha256, contentSha256: restored.contentSha256,
      backupVersion: restored.backupVersion, restored: true,
    });
  } catch (error) {
    if (error instanceof NoteRestoreError) {
      return res.status(error.status).json({ error: error.code });
    }
    return res.status(503).json({ error: 'Restore failed' });
  }
}
