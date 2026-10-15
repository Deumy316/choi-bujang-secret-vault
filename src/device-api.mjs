import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import {
  createSupabaseDeviceStore,
  DeviceApprovalError,
} from './device-approval.mjs';

let verifier;

export async function authenticatedDeviceContext(req, config) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new DeviceApprovalError('server_configuration_error', 500);
  }
  verifier ??= createLoginVerifier({
    config,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  });
  const login = await verifier(req.headers.authorization);
  if (!login) throw new DeviceApprovalError('login_required', 401);
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return Object.freeze({ login, store: createSupabaseDeviceStore(supabase) });
}

export function sendDeviceError(res, error) {
  if (error instanceof DeviceApprovalError) {
    return res.status(error.status).json({ error: error.code });
  }
  return res.status(503).json({ error: 'device_service_unavailable' });
}
