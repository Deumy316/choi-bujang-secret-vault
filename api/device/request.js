import { createRequire } from 'node:module';
import { requestDeviceApproval } from '../../src/device-approval.mjs';
import { authenticatedDeviceContext, sendDeviceError } from '../../src/device-api.mjs';

const require = createRequire(import.meta.url);
const config = require('../../aleph.config.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const context = await authenticatedDeviceContext(req, config);
    const result = await requestDeviceApproval({
      ...context,
      cookieHeader: req.headers.cookie,
    });
    if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
    return res.status(202).json({ status: result.status });
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
