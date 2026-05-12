/**
 * Firebase Cloud Messaging — ส่ง Web Push ผ่าน Firebase Admin SDK
 * ใช้ Service Account: GOOGLE_APPLICATION_CREDENTIALS หรือ FIREBASE_SERVICE_ACCOUNT หรือ env vars
 */
import {
  AQOND_FCM_CHANNEL_ID,
  AQOND_NOTIFICATION_SOUND_FILE,
  androidRawSoundNameFromPayloadSound,
  fcmDataAsStrings,
} from './fcmPushDefaults.js';

let messagingInstance = null;

async function getFirebaseMessaging() {
  if (messagingInstance) return messagingInstance;
  try {
    const admin = await import('firebase-admin');
    if (!admin.apps || admin.apps.length === 0) {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(sa) });
      } else {
        const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
        if (projectId && clientEmail && privateKey) {
          admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          });
        } else {
          return null;
        }
      }
    }
    messagingInstance = admin.messaging();
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM] Init failed:', e?.message);
    return null;
  }
}

/**
 * ส่ง multicast ไป FCM tokens
 * @param {string[]} tokens - FCM tokens
 * @param {{ title: string, body: string, icon?: string, sound?: string, channelId?: string, data?: Record<string, string> }} payload
 * @returns {{ success: number, failed: number }}
 */
export async function sendFcmMulticast(tokens, payload) {
  if (!tokens || tokens.length === 0) return { success: 0, failed: 0 };
  const messaging = await getFirebaseMessaging();
  if (!messaging) return { success: 0, failed: tokens.length };
  try {
    const sound = payload.sound || AQOND_NOTIFICATION_SOUND_FILE;
    const channelId = payload.channelId || AQOND_FCM_CHANNEL_ID;
    const androidSoundName = androidRawSoundNameFromPayloadSound(sound);
    const dataFlat = fcmDataAsStrings({
      ...(payload.data || {}),
      sound,
      channel_id: channelId,
    });

    const message = {
      notification: {
        title: payload.title || 'AQOND',
        body: payload.body || '',
        icon: payload.icon || '/logo.png',
      },
      data: dataFlat,
      android: {
        notification: {
          channelId,
          sound: androidSoundName,
        },
      },
      apns: {
        payload: {
          aps: {
            sound,
          },
        },
      },
      webpush: {
        fcmOptions: { link: payload.link || '/' },
        notification: { icon: payload.icon || '/logo.png' },
      },
      tokens: [...new Set(tokens)].filter(Boolean),
    };
    const res = await messaging.sendEachForMulticast(message);
    return { success: res.successCount, failed: res.failureCount };
  } catch (e) {
    console.error('[FCM] Send error:', e?.message);
    return { success: 0, failed: tokens.length };
  }
}
