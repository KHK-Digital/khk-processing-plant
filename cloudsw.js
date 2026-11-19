
const CACHE_NAME = 'khk-processing-plant-cloud-v4';

// Automatically determine the GitHub Pages repository path.
const BASE_PATH = new URL('./', self.location.href).pathname;

const OFFLINE_FILES = [
  'index.html',
  'cloudkiosk.html',
  'static/js/cloudkiosk.js',
  'static/css/cloudkiosk.css',
  'static/css/cloudhardware_status.css',
  'static/images/khk-logo.png',
  'static/cloudmanifest.json',
  'static/js/cloudauth.js',
  'static/js/cloudlogin.js'
].map(path => BASE_PATH + path);

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

// Activate: remove outdated cloud kiosk caches.
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();

      await Promise.all(
        names
          .filter(name =>
            name.startsWith('khk-processing-plant-cloud-') &&
            name !== CACHE_NAME
          )
          .map(name => caches.delete(name))
      );

      await self.clients.claim();
    })()
  );
});

// Fetch: network first, cache fallback when offline.
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Only handle requests belonging to this PWA.
  if (!url.pathname.startsWith(BASE_PATH)) return;

  const relativePath = url.pathname.slice(BASE_PATH.length);

  // Never cache API or authentication requests.
  if (
    relativePath.startsWith('api/') ||
    relativePath.startsWith('oauth2/') ||
    relativePath === 'callback'
  ) {
    return;
  }

  const isNavigation = request.mode === 'navigate';

  const isAppAsset =
    OFFLINE_FILES.includes(url.pathname) ||
    relativePath.startsWith('static/');

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
            await cache.match(BASE_PATH + 'index.html');

          if (fallback) return fallback;
        }

        return Response.error();
      }
    })()
  );
});
