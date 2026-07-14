import { FIREBASE_WEB_CONFIG } from '@/lib/firebasePublicConfig';

export const runtime = 'nodejs';

const SW_TEMPLATE = `
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');
firebase.initializeApp(__FIREBASE_CONFIG__);
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'AQOND';
  const body = payload.notification?.body || payload.data?.body || '';
  const url = payload.data?.url || '/m/account';
  self.registration.showNotification(title, { body, tag: 'aqond-fcm', data: { url } });
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/m/account';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
`;

export async function GET() {
  const cfg = JSON.stringify(FIREBASE_WEB_CONFIG);
  const body = SW_TEMPLATE.replace('__FIREBASE_CONFIG__', cfg);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    },
  });
}
