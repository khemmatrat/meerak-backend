import type { AuthState } from './bff';
import { fcmWebConfigured, registerFcmForAuth, syncFcmIfPermitted } from './fcmWeb';

const PUSH_PREF_KEY = 'aqond_merchant_push_ok';

export function merchantPollIntervalMs(): number {
  if (typeof window === 'undefined') return 15000;
  if (localStorage.getItem(PUSH_PREF_KEY) === '1') return 60000;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return 45000;
  return 15000;
}

export function markPushEnabled() {
  localStorage.setItem(PUSH_PREF_KEY, '1');
}

export async function requestMerchantPushPermission(auth: AuthState): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;

  if (fcmWebConfigured() && auth?.userId) {
    try {
      await registerFcmForAuth(auth, { platform: 'web' });
      markPushEnabled();
      showSetupNotification();
      return true;
    } catch {
      /* fall through to browser-only */
    }
  }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  markPushEnabled();
  showSetupNotification();

  if (fcmWebConfigured() && auth?.userId) {
    await syncFcmIfPermitted(auth).catch(() => null);
  }
  return true;
}

function showSetupNotification() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification?.('Aqond Merchant', {
          body: 'เปิดแจ้งเตือนออเดอร์แล้ว',
          tag: 'aqond-merchant-push-setup',
        }),
      )
      .catch(() => {
        new Notification('Aqond Merchant', { body: 'เปิดแจ้งเตือนออเดอร์แล้ว' });
      });
  } else {
    new Notification('Aqond Merchant', { body: 'เปิดแจ้งเตือนออเดอร์แล้ว' });
  }
}

export function notifyNewMerchantOrders(shopName: string, count: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const title = count > 1 ? `🔔 ${count} ออเดอร์ใหม่` : '🔔 ออเดอร์ใหม่';
  const body = `${shopName} — แตะเพื่อรับออเดอร์`;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((reg) =>
        reg.showNotification(title, {
          body,
          tag: 'aqond-merchant-order',
          data: { url: '/m/merchant/orders' },
        }),
      )
      .catch(() => new Notification(title, { body }));
  } else {
    new Notification(title, { body });
  }
}

export function notifySlaUrgent(shopName: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  const title = '🚨 SLA เกินเวลา';
  const body = `${shopName} — รับออเดอร์ด่วน`;
  new Notification(title, { body });
}
