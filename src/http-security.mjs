export function preventPrivateResponseCaching(res) {
  res.setHeader('Cache-Control', 'private, no-store');
}
