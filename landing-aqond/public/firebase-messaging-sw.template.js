/* eslint-disable no-restricted-globals */
/**
 * Firebase Cloud Messaging — Service Worker (Background Messages)
 * Config is injected at build time by scripts/inject-firebase-sw.js
 * Do NOT commit firebase-messaging-sw.js (generated) — it contains secrets.
 */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = __FIREBASE_CONFIG__;
const vapidKey = __VAPID_KEY__;

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || 'AQOND';
      const options = {
        body: payload.notification?.body || payload.data?.body || '',
        icon: payload.notification?.icon || payload.data?.icon || '/logo.png',
        badge: '/logo.png',
        tag: payload.data?.tag || 'aqond',
        data: payload.data || {},
      };
      self.registration.showNotification(title, options);
    });
  } catch (e) {
    console.error('[FCM SW] Init error:', e);
  }
}
