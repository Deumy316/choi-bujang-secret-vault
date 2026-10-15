import { createRequire } from 'node:module';
import { decideDeviceApproval, parseAdminSubjects } from '../../src/device-approval.mjs';
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
    const body = req.body || {};
    if (Object.keys(body).some((key) => !['registrationId', 'action'].includes(key))) {
      return res.status(400).json({ error: 'invalid_device_decision' });
    }
    const result = await decideDeviceApproval({
      ...context,
      adminSubjects: parseAdminSubjects(process.env.DEVICE_APPROVAL_ADMIN_SUBJECTS),
      registrationId: body.registrationId,
      action: body.action,
    });
    return res.status(200).json({ status: result.status });
  } catch (error) {
    return sendDeviceError(res, error);
  }
}
