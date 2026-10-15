const CACHE_NAME = 'byte-back-public-shell-v4';
const PUBLIC_SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];
const PUBLIC_PATHS = new Set(PUBLIC_SHELL);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((names) => Promise.all(
    names.filter((name) => name.startsWith('byte-back-public-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name))
  )));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin
      || url.search || !PUBLIC_PATHS.has(url.pathname)) return;

  event.respondWith(caches.match(event.request).then((cached) => (
    cached || fetch(event.request)
  )));
});
