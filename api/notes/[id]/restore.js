import restoreHandler from '../restore.js';

export function createPathRestoreHandler(baseHandler = restoreHandler) {
  return async function pathRestoreHandler(req, res) {
    const rawId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    const pathId = typeof rawId === 'string' ? rawId : '';
    const body = req.body == null ? {} : req.body;
    const bodyIsObject = typeof body === 'object' && !Array.isArray(body);
    const bodyKeys = bodyIsObject ? Object.keys(body) : [];
    const invalidBody = !bodyIsObject
      || bodyKeys.some(key => key !== 'id')
      || (body.id !== undefined && body.id !== pathId);
    const pathBody = invalidBody
      ? { id: pathId, invalid_path_restore_body: true }
      : { id: pathId };
    const pathRequest = Object.create(req, {
      body: { value: pathBody, enumerable: true },
    });
    return baseHandler(pathRequest, res);
  };
}

export default createPathRestoreHandler();
