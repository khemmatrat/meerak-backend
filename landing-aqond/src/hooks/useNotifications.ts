/**
 * Web Push Notifications — FCM permission + token
 * ใช้กับ Firebase Cloud Messaging บน Landing (AQOND)
 */
import { useState, useEffect, useCallback } from 'react';
import { getMessagingInstance } from '../services/firebaseService';
import { getToken } from 'firebase/messaging';
import { getBackendBaseUrl } from '../services/landingLeadApi';

// Placeholder — ส่ง token ไป backend สำหรับเก็บ subscription
export async function sendTokenToBackend(token: string): Promise<void> {
  const base = getBackendBaseUrl();
  try {
    await fetch(`${base}/api/notifications/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, source: 'landing' }),
    });
  } catch {
    // Backend อาจยังไม่มี endpoint — ไม่ error
  }
}

export type NotificationPermission = 'default' | 'granted' | 'denied';

export interface UseNotificationsState {
  permission: NotificationPermission;
  token: string | null;
  loading: boolean;
  error: string | null;
  supported: boolean;
}

export function useNotifications(): UseNotificationsState & {
  requestPermission: () => Promise<boolean>;
} {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'Notification' in window &&
    'PushManager' in window;

  const fetchToken = useCallback(async () => {
    const vapidKey = (import.meta as any).env?.VITE_VAPID_KEY;
    if (!vapidKey) return null;
    const messaging = getMessagingInstance();
    if (!messaging) return null;
    const baseUrl = (import.meta as any).env?.BASE_URL || '/';
    const swPath = `${baseUrl.replace(/\/$/, '')}/firebase-messaging-sw.js`;
    const reg = await navigator.serviceWorker.register(swPath, { scope: baseUrl });
    const t = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg });
    if (t) {
      console.log('[AQOND Push] FCM Token (copy for testing):', t);
      sendTokenToBackend(t);
    }
    return t;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermission);
      if (result === 'granted') {
        const t = await fetchToken();
        if (t) setToken(t);
      }
      return result === 'granted';
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, fetchToken]);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    setPermission((Notification.permission as NotificationPermission) || 'default');
    if (Notification.permission === 'granted') {
      setLoading(true);
      setError(null);
      fetchToken()
        .then((t) => t && setToken(t))
        .catch((e) => setError((e as Error).message))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [supported, fetchToken]);

  return {
    permission,
    token,
    loading,
    error,
    supported,
    requestPermission,
  };
}
