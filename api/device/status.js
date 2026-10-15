import { createRequire } from 'node:module';
import { getDeviceApprovalStatus } from '../../src/device-approval.mjs';
import { authenticatedDeviceContext, sendDeviceError } from '../../src/device-api.mjs';
import { preventPrivateResponseCaching } from '../../src/http-security.mjs';

const require = createRequire(import.meta.url);
const config = require('../../aleph.config.json');

export default async function handler(req, res) {
  preventPrivateResponseCaching(res);
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
    const response = { status: result.status };
    if (result.registrationId) response.registrationId = result.registrationId;
    return res.status(200).json(response);
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
