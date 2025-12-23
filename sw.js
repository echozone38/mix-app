// Verzi měň při každé úpravě, aby se vynutila aktualizace cache
const CACHE_NAME = 'mix-app-v3';

const ASSETS = [
  '/',               // root
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalace: přednačtení základních souborů
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(ASSETS.map(
          (url) => new Request(url, { cache: 'reload' })
        ));
      } catch (err) {
        // Nepovinné: zalogovat chybu
        console.error('Cache addAll failed:', err);
      }
    })
  );
  self.skipWaiting();
});

// Aktivace: smazat staré cache a převzít kontrolu
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: cache-first pro statická aktiva; navigace -> offline fallback na index.html
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Navigace (HTML stránky)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;

          // Síť, pokud dostupná
          const networkResp = await fetch(request);
          return networkResp;
        } catch {
          // Offline fallback
          const cache = await caches.open(CACHE_NAME);
          const cachedIndex = await cache.match('/index.html');
          return cachedIndex || Response.error();
        }
      })()
    );
    return;
  }

  // Ostatní požadavky – cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((networkResp) => {
          // Volitelné: uložit nové odpovědi do cache (runtime caching)
          if (
            networkResp &&
            networkResp.status === 200 &&
            request.method === 'GET' &&
            request.url.startsWith(self.location.origin)
          ) {
            const respClone = networkResp.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, respClone);
            });
          }
          return networkResp;
        }).catch(() => cached) // pokud síť selže, vrať cache (pokud existuje)
      );
    })
  );
});