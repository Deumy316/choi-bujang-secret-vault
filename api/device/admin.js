import { createRequire } from 'node:module';
import {
  decideDeviceApproval,
  listPendingDeviceApprovals,
  parseAdminSubjects,
} from '../../src/device-approval.mjs';
import { authenticatedDeviceContext, sendDeviceError } from '../../src/device-api.mjs';
import { preventPrivateResponseCaching } from '../../src/http-security.mjs';

const require = createRequire(import.meta.url);
const config = require('../../aleph.config.json');

export default async function handler(req, res) {
  preventPrivateResponseCaching(res);
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  try {
    const context = await authenticatedDeviceContext(req, config);
    const adminSubjects = parseAdminSubjects(process.env.DEVICE_APPROVAL_ADMIN_SUBJECTS);
    if (req.method === 'GET') {
      const requests = await listPendingDeviceApprovals({ ...context, adminSubjects });
      return res.status(200).json({ requests });
    }
    const body = req.body || {};
    if (Object.keys(body).some((key) => !['registrationId', 'action'].includes(key))) {
      return res.status(400).json({ error: 'invalid_device_decision' });
    }
    const result = await decideDeviceApproval({
      ...context,
      adminSubjects,
      registrationId: body.registrationId,
      action: body.action,
    });
    return res.status(200).json({ status: result.status });
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
