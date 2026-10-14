/* V3 static assets are versioned; no extra app.js download on SW install. */
const CACHE = 'ocr2md-v3-media-module-ag-owned-20261012br';
const SHELL = ['./', './index.html'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys
      .filter(name => name.startsWith('ocr2md-v3-') && name !== CACHE)
      .map(name => caches.delete(name)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (request.method !== 'GET' || url.origin !== scope.origin ||
      !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (url.pathname.startsWith(scope.pathname + 'dist/')) {
      // Exact URL match includes ?rev: no accidental reuse of old JS/CSS.
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }
    // Documents remain network-first; only fall back to shell when offline.
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});
