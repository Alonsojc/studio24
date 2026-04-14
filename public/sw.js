const CACHE_NAME = 'studio24-v2';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([
        '/studio24/',
        '/studio24/pedidos',
        '/studio24/ingresos',
        '/studio24/egresos',
        '/studio24/clientes',
        '/studio24/proveedores',
        '/studio24/productos',
        '/studio24/cotizador',
        '/studio24/reportes',
        '/studio24/ajustes',
      ]);
    })
  );
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
  // Skip non-GET requests (Cache API doesn't support POST/PUT/DELETE)
  if (event.request.method !== 'GET') return;

  // Skip Supabase API calls — don't cache dynamic data
  if (event.request.url.includes('supabase.co')) return;

  // Network first, fallback to cache (only for GET of static assets)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
