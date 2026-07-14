// P164: minimal app-shell service worker — cache shell assets offline.
const CACHE = 'aqond-shell-v2';
const SHELL = ['/', '/m/home', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => caches.match('/'))),
  );
});

self.addEventListener('push', (e) => {
  let data = { title: 'Aqond', body: 'ออเดอร์ใหม่', url: '/m/merchant/orders' };
  try {
    if (e.data) data = { ...data, ...e.data.json() };
  } catch {
    /* ignore */
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: 'aqond-merchant-push',
      data: { url: data.url },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/m/merchant/orders';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
