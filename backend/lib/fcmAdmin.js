/**
 * Firebase Admin SDK — FCM (ส่ง Web Push)
 * ใช้ GOOGLE_APPLICATION_CREDENTIALS, FIREBASE_SERVICE_ACCOUNT หรือ FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 */
import {
  AQOND_FCM_CHANNEL_ID,
  AQOND_NOTIFICATION_SOUND_FILE,
  androidRawSoundNameFromPayloadSound,
  fcmDataAsStrings,
} from './fcmPushDefaults.js';

let messagingInstance = null;

async function initFirebaseAdmin() {
  if (messagingInstance !== undefined) return messagingInstance;
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
            credential: admin.credential.cert({
              projectId,
              clientEmail,
              privateKey,
            }),
          });
        } else {
          messagingInstance = null;
          return null;
        }
      }
    }
    messagingInstance = admin.messaging();
    return messagingInstance;
  } catch (e) {
    console.warn('[FCM Admin] init failed:', e?.message);
    messagingInstance = null;
    return null;
  }
}

/**
 * ส่ง FCM ไป tokens
 * @param {string[]} tokens — FCM registration tokens
 * @param {{ title: string, body: string, icon?: string, sound?: string, channelId?: string }} payload
 * @returns {{ success: number, failed: number }}
 */
export async function sendFcmToTokens(tokens, { title, body, icon = '/logo.png', sound, channelId }) {
  const messaging = await initFirebaseAdmin();
  if (!messaging || !tokens.length) return { success: 0, failed: tokens.length };
  try {
    const soundFile = sound || AQOND_NOTIFICATION_SOUND_FILE;
    const chId = channelId || AQOND_FCM_CHANNEL_ID;
    const androidSoundName = androidRawSoundNameFromPayloadSound(soundFile);
    const message = {
      notification: { title, body, icon },
      data: fcmDataAsStrings({ title, body, sound: soundFile, channel_id: chId }),
      android: {
        notification: {
          channelId: chId,
          sound: androidSoundName,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: soundFile,
          },
        },
      },
      webpush: {
        notification: { title, body, icon },
        fcmOptions: { link: process.env.VITE_APP_URL || 'https://aqond.com' },
      },
      tokens,
    };
    const res = await messaging.sendEachForMulticast(message);
    return { success: res.successCount, failed: res.failureCount };
  } catch (e) {
    console.error('[FCM Admin] send error:', e?.message);
    return { success: 0, failed: tokens.length };
  }
}
