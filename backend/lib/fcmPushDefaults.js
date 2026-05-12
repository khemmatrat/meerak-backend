/**
 * ค่าเดียวกับ MainActivity.CHANNEL_INTERCITY_JOBS และ res/raw/aqond_notification.*
 * — ใช้กับแจ้งเตือนระบบงาน (มีคนรับงาน / เงินเข้า ฯลฯ)
 */
export const AQOND_FCM_CHANNEL_ID = 'aqond_intercity_jobs';

/** alias ชัดเจน — ค่าเดียวกับ AQOND_FCM_CHANNEL_ID (งานเข้าระบบ / job alerts) */
export const AQOND_FCM_CHANNEL_JOB_ALERTS = AQOND_FCM_CHANNEL_ID;

/**
 * แจ้งเตือนข่าวจากแอดมิน (Push tab) — ต้องสร้าง NotificationChannel นี้ในแอป Android
 * และกำหนดเสียงต่างจากช่องงานได้ (ดู comment ท้ายไฟล์)
 */
export const AQOND_FCM_CHANNEL_APP_NEWS = 'aqond_app_news';

/** ใส่ใน payload / data — ตรงกับชื่อไฟล์ในแอป (iOS bundle / อ้างอิง) */
export const AQOND_NOTIFICATION_SOUND_FILE = 'aqond_notification.mp3';

/** เสียงข่าวแอดมิน — ตอนนี้ใช้ไฟล์เดียวกับงานได้; เปลี่ยนเป็นไฟล์อื่นเมื่อเพิ่มใน res/raw */
export const AQOND_NOTIFICATION_SOUND_APP_NEWS = AQOND_NOTIFICATION_SOUND_FILE;

/**
 * Android FCM: ชื่อไฟล์ใน res/raw โดยไม่มีนามสกุล (raw/aqond_notification.mp3 → aqond_notification)
 */
export function androidRawSoundNameFromPayloadSound(soundFile) {
  if (!soundFile || typeof soundFile !== 'string') return 'aqond_notification';
  return soundFile.replace(/\.(mp3|wav|ogg)$/i, '').replace(/[^a-z0-9_]/gi, '_') || 'aqond_notification';
}

/** FCM data payload ต้องเป็นค่า string ทั้งหมด */
export function fcmDataAsStrings(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

/*
 * Native Android — สร้าง NotificationChannel แยกเสียง:
 * - aqond_intercity_jobs (หรือชื่อเดียวกับที่มีใน MainActivity อยู่แล้ว) → แจ้งเตือนระบบงาน
 * - aqond_app_news → ข่าวจากแอดมิน (แท็บ Push); ตั้ง importance + sound จาก raw/ ตามต้องการ
 * แอปที่ยังไม่มีช่อง aqond_app_news อาจ fallback เป็น default channel ตามพฤติกรรม OS
 */
