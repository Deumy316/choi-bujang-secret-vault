import { createRequire } from 'node:module';
import { getDeviceApprovalStatus } from '../../src/device-approval.mjs';
import { authenticatedDeviceContext, sendDeviceError } from '../../src/device-api.mjs';

const require = createRequire(import.meta.url);
const config = require('../../aleph.config.json');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const context = await authenticatedDeviceContext(req, config);
    const result = await getDeviceApprovalStatus({
      ...context,
      cookieHeader: req.headers.cookie,
    });
    return res.status(200).json({ status: result.status });
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
