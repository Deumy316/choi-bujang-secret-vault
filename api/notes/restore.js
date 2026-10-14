import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import {
  isRestoreAdmin,
  NoteRestoreError,
  parsePrivateNoteBackup,
  parseRestoreAdminSubjects,
  restoreVerifiedNote,
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

function validSeparatedTestDatabase() {
  if (typeof process.env.TEST_SUPABASE_URL !== 'string'
      || typeof process.env.SUPABASE_URL !== 'string'
      || typeof process.env.TEST_SUPABASE_SECRET_KEY !== 'string'
      || !process.env.TEST_SUPABASE_SECRET_KEY.trim()
      || process.env.TEST_SUPABASE_SECRET_KEY === process.env.SUPABASE_SECRET_KEY) return false;
  try {
    const test = new URL(process.env.TEST_SUPABASE_URL);
    const production = new URL(process.env.SUPABASE_URL);
    return test.protocol === 'https:' && production.protocol === 'https:'
      && !test.username && !test.password && !test.search && !test.hash
      && test.origin !== production.origin;
  } catch {
    return false;
  }
}

function getTestSupabase() {
  return createClient(process.env.TEST_SUPABASE_URL, process.env.TEST_SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!process.env.SUPABASE_SECRET_KEY) return res.status(500).json({ error: 'Server configuration error' });

  let login;
  try { login = await getVerifier()(req.headers.authorization); }
  catch { return res.status(500).json({ error: 'Login verification error' }); }
  if (!login) return res.status(401).json({ error: 'Login required' });

  let admins;
  try { admins = parseRestoreAdminSubjects(process.env.NOTE_RESTORE_ADMIN_SUBJECTS); }
  catch { return res.status(503).json({ error: 'Restore unavailable' }); }
  if (!isRestoreAdmin(login, admins)) return res.status(403).json({ error: 'Restore permission required' });
  if (!validSeparatedTestDatabase()) return res.status(503).json({ error: 'Separated test database required' });

  const body = req.body || {};
  if (typeof body.id !== 'string' || Object.keys(body).some(key => key !== 'id')) {
    return res.status(400).json({ error: 'Only the approved note id is accepted' });
  }

  try {
    const backup = parsePrivateNoteBackup(process.env.NOTE_RESTORE_BACKUP_B64);
    const supabase = getTestSupabase();
    const restored = await restoreVerifiedNote({
      backup,
      requestedId: body.id,
      allowedOwnerId: process.env.NOTE_RESTORE_OWNER_ID_B,
      // shortcut: the isolated DB must provide this atomic RPC, add its migration only when a test DB exists.
      transaction: async note => {
        const { data, error } = await supabase.rpc('restore_single_verified_note', {
          p_note_id: note.id,
          p_owner_id: note.ownerId,
          p_title: note.title,
          p_content: note.content,
          p_content_sha256: note.contentSha256,
          p_backup_version: note.backupVersion,
        });
        if (error) throw new NoteRestoreError('restore_transaction_failed', 503);
        const result = Array.isArray(data) ? data[0] : data;
        return {
          restored: result?.restored === true,
          duplicate: result?.duplicate === true,
          id: result?.note_id,
          ownerId: result?.owner_id,
          contentSha256: result?.content_sha256,
          changedRows: result?.changed_rows,
          preservedOtherNotes: result?.preserved_other_notes === true,
        };
      },
    });
    return res.status(200).json({ id: restored.id, backupVersion: restored.backupVersion, restored: true });
  } catch (error) {
    if (error instanceof NoteRestoreError) {
      return res.status(error.status).json({ error: error.code });
    }
    return res.status(503).json({ error: 'Restore failed' });
  }
}
