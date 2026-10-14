const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function createRestorePathHandler(restoreHandler) {
  return async function restorePathHandler(req, res) {
    let url;
    try { url = new URL(req.url, 'https://restore.invalid'); } catch {}

    const match = /^\/api\/restore\/([^/]+)\/?$/u.exec(url?.pathname || '');
    const pathId = match ? match[1] : '';
    const body = req.body == null ? {} : req.body;
    const bodyIsObject = typeof body === 'object' && !Array.isArray(body);
    const queryIds = url
      ? [...url.searchParams.getAll('id'), ...url.searchParams.getAll('noteId')]
      : [];
    const invalidTarget = !UUID.test(pathId)
      || !bodyIsObject
      || Object.keys(body).some(key => key !== 'id')
      || (body.id !== undefined && (typeof body.id !== 'string'
        || body.id.toLowerCase() !== pathId.toLowerCase()))
      || queryIds.some(id => id.toLowerCase() !== pathId.toLowerCase());
    const pathRequest = Object.create(req, {
      body: {
        value: invalidTarget
          ? { id: pathId, invalid_path_restore_target: true }
          : { id: pathId.toLowerCase() },
        enumerable: true,
      },
    });
    return restoreHandler(pathRequest, res);
  };
}
