const CACHE_NAME = 'studio24-v4';
const APP_BASE = '/studio24';

function isSupabaseRequest(url) {
  return url.hostname.includes('supabase.co');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');
}

function isCacheableStaticAsset(url) {
  return (
    url.pathname.startsWith(`${APP_BASE}/_next/static/`) ||
    url.pathname === `${APP_BASE}/manifest.json` ||
    url.pathname === `${APP_BASE}/favicon.svg`
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll([`${APP_BASE}/manifest.json`])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (isSupabaseRequest(url)) return;

  // Never cache HTML/app shell. GitHub Pages deploys static HTML, and a stale
  // cached shell is worse than an offline miss for a data-heavy admin app.
  if (isNavigationRequest(event.request)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }

  if (!isCacheableStaticAsset(url)) return;

  // Static build assets are content-hashed. Serve cache-first after first fetch.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    }),
  );
});
