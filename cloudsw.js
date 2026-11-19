
const CACHE_NAME = 'khk-processing-plant-cloud-v3';

const OFFLINE_FILES = [
  '/cloudkiosk.html',
  '/static/js/cloudkiosk.js',
  '/static/css/cloudkiosk.css',
  '/static/css/cloudhardware_status.css',
  '/static/images/khk-logo.png',
  '/static/cloudmanifest.json',
  '/static/js/cloudauth.js',
  '/static/js/cloudlogin.js'
];

// Install: cache the cloud kiosk application files.
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const url of OFFLINE_FILES) {
        const response = await fetch(url, {
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(
            'Cannot cache: ' + url +
            ' (HTTP ' + response.status + ')'
          );
        }

        await cache.put(url, response);
      }

      await self.skipWaiting();
    })()
  );
});

// Activate: remove outdated cloud caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// Fetch: use network first, cache fallback when offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Never cache API or authentication requests.
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/oauth2/') ||
    url.pathname === '/callback'
  ) {
    return;
  }

  const isNavigation = request.mode === 'navigate';

  const isAppAsset =
    OFFLINE_FILES.includes(url.pathname) ||
    url.pathname.startsWith('/static/');

  if (!isNavigation && !isAppAsset) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);

        if (response.ok && isAppAsset) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }

        return response;
      } catch (error) {
        const cache = await caches.open(CACHE_NAME);

        const cached = await cache.match(request, {
          ignoreSearch: true
        });

        if (cached) return cached;

        if (isNavigation) {
          const fallback =
            await cache.match('/cloudkiosk.html');

          if (fallback) return fallback;
        }

        return Response.error();
      }
    })()
  );
});
