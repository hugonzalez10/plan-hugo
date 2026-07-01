/* Plan Hugo — Service Worker mínimo
 * Estrategia: network-first para los archivos propios (index.html, app.js, tailwind.css —
 * queremos la última versión), cache-first para CDN (React, jspdf/mammoth on-demand) — immutables por URL.
 * NO interceptamos llamadas a api.anthropic.com.
 */

const CACHE_NAME = 'plan-hugo-v83-guard-sueno-imposible';
const CORE_URLS = [
  './index.html',
  './app.js',
  './tailwind.css',
  './manifest.json',
];
const CDN_HOSTS = ['unpkg.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_URLS)).catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // No tocar API de Claude
  if (url.hostname.includes('anthropic.com')) return;

  // CDN: cache-first
  if (CDN_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const resp = await fetch(request);
          if (resp.ok) cache.put(request, resp.clone());
          return resp;
        } catch (e) {
          return cached || new Response('Offline', { status: 503 });
        }
      })
    );
    return;
  }

  // Same-origin (HTML, manifest, sw): network-first con fallback a cache
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then((resp) => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return resp;
      }).catch(() => caches.match(request).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
  }
});

// Notificaciones programadas: cuando la app llama showNotification a través del SW
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'show-notification') {
    self.registration.showNotification(data.title || 'Plan Hugo', {
      body: data.body || '',
      icon: data.icon,
      badge: data.icon,
      tag: data.tag || 'plan-hugo',
      data: { url: data.url || '/' },
    });
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const existing = all.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
