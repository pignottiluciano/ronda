// Service worker for offline use. Served as /sw.js by src/pages/sw.js.ts, which stamps a build version into the cache name.
const CACHE = 'ronda-__VERSION__';
const PAGES = ['/', '/en/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = new Set(['/favicon.svg', '/manifest.webmanifest', '/icon-192.png']);
      // Each page links every script, style and font it needs, so reading the HTML finds the whole app.
      for (const page of PAGES) {
        const response = await fetch(page, { cache: 'reload' });
        if (!response.ok) throw new Error(`Could not fetch ${page}`);
        await cache.put(page, response.clone());
        for (const [url] of (await response.text()).matchAll(/\/_astro\/[^"'\s)]+/g)) urls.add(url);
      }
      await cache.addAll([...urls]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  if (request.mode === 'navigate') {
    // Network first so a new deploy shows up right away; the cached page is the offline fallback.
    // ponytail: on a very slow connection this waits for the network to time out before falling back.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request, { ignoreSearch: true })) ?? caches.match('/')),
    );
    return;
  }

  // Assets are fingerprinted, so a cached copy is always the right one.
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
