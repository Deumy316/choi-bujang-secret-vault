import { createRequire } from 'node:module';
import { authenticatedDeviceContext, sendDeviceError } from '../../src/device-api.mjs';
import { getDeviceApprovalStatus } from '../../src/device-approval.mjs';
import { preventPrivateResponseCaching } from '../../src/http-security.mjs';
import { buildOperationsStatus, readBundledPolicyStatus } from '../../src/operations-status.mjs';

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
    const device = await getDeviceApprovalStatus({
      ...context,
      cookieHeader: req.headers.cookie,
    });
    return res.status(200).json(buildOperationsStatus({
      deviceStatus: device.status,
      policyStatus: readBundledPolicyStatus(),
      checkedAt: new Date().toISOString(),
      restoreRoute: config.restoreRoute,
    }));
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
