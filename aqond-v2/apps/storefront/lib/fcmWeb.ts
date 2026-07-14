'use client';

import type { AuthState } from './bff';
import { registerPush } from './notifyClient';
import { fcmVapidKey, fcmWebConfigured } from './firebasePublicConfig';

export { fcmWebConfigured };

const FCM_SW_PATH = '/firebase-messaging-sw.js';

export async function ensureFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.register(FCM_SW_PATH);
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function requestFcmToken(): Promise<string> {
  if (!fcmWebConfigured()) {
    throw new Error('fcm_not_configured');
  }
  const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
  if (!(await isSupported())) {
    throw new Error('fcm_not_supported');
  }
  if (!('Notification' in window)) {
    throw new Error('notifications_unavailable');
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('notification_permission_denied');
  }
  const swReg = await ensureFcmServiceWorker();
  if (!swReg) {
    throw new Error('service_worker_unavailable');
  }
  const { default: app } = await import('./firebaseConfig');
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: fcmVapidKey(),
    serviceWorkerRegistration: swReg,
  });
  if (!token) {
    throw new Error('fcm_token_empty');
  }
  return token;
}

export async function registerFcmForAuth(
  auth: AuthState,
  opts?: { platform?: string },
): Promise<string> {
  const token = await requestFcmToken();
  await registerPush(auth, token, opts?.platform || 'web');
  return token;
}

export async function syncFcmIfPermitted(auth: AuthState): Promise<string | null> {
  if (!fcmWebConfigured()) return null;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
  try {
    const { isSupported, getMessaging, getToken } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    const swReg = await ensureFcmServiceWorker();
    if (!swReg) return null;
    const { default: app } = await import('./firebaseConfig');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: fcmVapidKey(),
      serviceWorkerRegistration: swReg,
    });
    if (!token) return null;
    await registerPush(auth, token, 'web');
    return token;
  } catch {
    return null;
  }
}

type ForegroundHandler = (payload: { title: string; body: string; url?: string }) => void;

export async function listenFcmForeground(onMessage: ForegroundHandler): Promise<(() => void) | null> {
  if (!fcmWebConfigured()) return null;
  try {
    const { isSupported, getMessaging, onMessage: onFcmMessage } = await import('firebase/messaging');
    if (!(await isSupported())) return null;
    const { default: app } = await import('./firebaseConfig');
    const messaging = getMessaging(app);
    return onFcmMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || 'AQOND';
      const body = payload.notification?.body || payload.data?.body || '';
      const url = payload.data?.url || payload.fcmOptions?.link;
      onMessage({ title, body, url });
    });
  } catch {
    return null;
  }
}

export async function registerRiderFcm(auth: AuthState, _riderId?: string): Promise<string | null> {
  try {
    return await registerFcmForAuth(auth, { platform: 'web' });
  } catch {
    return await syncFcmIfPermitted(auth);
  }
}
