const CACHE_NAME = 'studio24-v6';
const APP_BASE = '/studio24';

function connectionUnavailable() {
  return new Response(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Studio 24 - Conexion interrumpida</title>
<style>body{margin:0;background:#fafafa;color:#171717;font:16px system-ui,sans-serif}main{max-width:440px;margin:18vh auto;padding:24px}h1{font-size:24px}p{line-height:1.6;color:#525252}nav{display:flex;gap:16px;align-items:center;flex-wrap:wrap}a{color:#171717;padding:12px 16px}a:first-child{background:#c72a09;color:white;border-radius:6px;text-decoration:none}a:focus-visible{outline:3px solid #171717;outline-offset:4px}</style>
</head><body><main><strong>studio 24</strong><h1>Conexion interrumpida</h1>
<p>No pudimos cargar esta pagina. Vuelve a intentarlo cuando tengas conexion.</p>
<nav><a href="">Reintentar</a><a href="${APP_BASE}/">Inicio</a></nav>
</main></body></html>`, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

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
      Promise.all(keys.filter((k) => k.startsWith('studio24-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (isSupabaseRequest(url)) return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== APP_BASE && !url.pathname.startsWith(`${APP_BASE}/`)) return;

  // Never cache HTML/app shell. GitHub Pages deploys static HTML, and a stale
  // cached shell is worse than an offline miss for a data-heavy admin app.
  if (isNavigationRequest(event.request)) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => connectionUnavailable()));
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
