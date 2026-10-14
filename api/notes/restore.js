import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import {
  executeRestoreRpc,
  isRestoreAdmin,
  NoteRestoreError,
  parseRestoreAdminSubjects,
  prepareRestoreRpcInput,
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

  let admins;
  try { admins = parseRestoreAdminSubjects(process.env.NOTE_RESTORE_ADMIN_SUBJECTS); }
  catch { return res.status(503).json({ error: 'Restore unavailable' }); }
  if (!isRestoreAdmin(login, admins)) return res.status(403).json({ error: 'Restore permission required' });

  const body = req.body || {};
  if (typeof body.id !== 'string' || Object.keys(body).some(key => key !== 'id')) {
    return res.status(400).json({ error: 'Only the approved note id is accepted' });
  }

  try {
    const input = prepareRestoreRpcInput({
      login,
      requestedId: body.id,
    });
    const restored = await executeRestoreRpc(getSupabase(), input);
    return res.status(200).json({ id: restored.id, backupVersion: restored.backupVersion, restored: true });
  } catch (error) {
    if (error instanceof NoteRestoreError) {
      return res.status(error.status).json({ error: error.code });
    }
    return res.status(503).json({ error: 'Restore failed' });
  }
}
