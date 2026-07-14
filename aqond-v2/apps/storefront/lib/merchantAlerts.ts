export type AlertSoundId =
  | 'bell'
  | 'chime'
  | 'urgent'
  | 'soft'
  | 'drum'
  | 'whistle'
  | 'melody'
  | 'digital';

export type ShopAlertSettings = {
  enabled: boolean;
  soundId: AlertSoundId;
};

export const ALERT_SOUNDS: { id: AlertSoundId; label: string; icon: string }[] = [
  { id: 'bell', label: 'กระดิ่ง', icon: '🔔' },
  { id: 'chime', label: 'ทินล์ไล่โน้ต', icon: '🎵' },
  { id: 'urgent', label: 'ด่วน 3 ครั้ง', icon: '🚨' },
  { id: 'soft', label: 'เบาๆ', icon: '🌙' },
  { id: 'drum', label: 'กลอง', icon: '🥁' },
  { id: 'whistle', label: 'นกหวีด', icon: '📣' },
  { id: 'melody', label: 'เมโลดี้', icon: '🎶' },
  { id: 'digital', label: 'ดิจิทัล', icon: '📱' },
];

const seenKey = (shopId: string) => `aqond_merchant_seen_${shopId}`;
const alertLegacyKey = (shopId: string) => `aqond_merchant_alert_${shopId}`;
const alertSettingsKey = (shopId: string) => `aqond_merchant_alert_v2_${shopId}`;

const DEFAULT_SOUND: AlertSoundId = 'bell';

function parseSettings(raw: string | null): ShopAlertSettings | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as ShopAlertSettings;
    if (typeof p.enabled === 'boolean' && ALERT_SOUNDS.some((s) => s.id === p.soundId)) {
      return p;
    }
  } catch {
    /* legacy */
  }
  return null;
}

export function getShopAlertSettings(shopId: string): ShopAlertSettings {
  if (typeof window === 'undefined') {
    return { enabled: true, soundId: DEFAULT_SOUND };
  }
  const v2 = parseSettings(localStorage.getItem(alertSettingsKey(shopId)));
  if (v2) return v2;

  const legacy = localStorage.getItem(alertLegacyKey(shopId));
  const enabled = legacy !== 'off';
  const settings = { enabled, soundId: DEFAULT_SOUND };
  localStorage.setItem(alertSettingsKey(shopId), JSON.stringify(settings));
  return settings;
}

export function setShopAlertSettings(shopId: string, patch: Partial<ShopAlertSettings>) {
  const cur = getShopAlertSettings(shopId);
  const next: ShopAlertSettings = {
    enabled: patch.enabled ?? cur.enabled,
    soundId: patch.soundId ?? cur.soundId,
  };
  localStorage.setItem(alertSettingsKey(shopId), JSON.stringify(next));
  localStorage.setItem(alertLegacyKey(shopId), next.enabled ? 'on' : 'off');
}

export function isAlertEnabled(shopId: string): boolean {
  return getShopAlertSettings(shopId).enabled;
}

export function setAlertEnabled(shopId: string, enabled: boolean) {
  setShopAlertSettings(shopId, { enabled });
}

export function getAlertSoundId(shopId: string): AlertSoundId {
  return getShopAlertSettings(shopId).soundId;
}

export function setAlertSoundId(shopId: string, soundId: AlertSoundId) {
  setShopAlertSettings(shopId, { soundId });
}

export function loadSeenOrderIds(shopId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(seenKey(shopId));
    return new Set(JSON.parse(raw || '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function markOrdersSeen(shopId: string, orderIds: string[]) {
  const seen = loadSeenOrderIds(shopId);
  for (const id of orderIds) seen.add(id);
  const trimmed = [...seen].slice(-300);
  localStorage.setItem(seenKey(shopId), JSON.stringify(trimmed));
}

export function countUnseenOrders(shopId: string, orderIds: string[]): number {
  const seen = loadSeenOrderIds(shopId);
  return orderIds.filter((id) => id && !seen.has(id)).length;
}

type Tone = { freq: number; start: number; dur: number; type?: OscillatorType; gain?: number };

const SOUND_PATTERNS: Record<AlertSoundId, Tone[]> = {
  bell: [
    { freq: 880, start: 0, dur: 0.18, type: 'sine', gain: 0.14 },
    { freq: 1175, start: 0.22, dur: 0.25, type: 'sine', gain: 0.12 },
  ],
  chime: [
    { freq: 523, start: 0, dur: 0.12, type: 'triangle', gain: 0.1 },
    { freq: 659, start: 0.14, dur: 0.12, type: 'triangle', gain: 0.1 },
    { freq: 784, start: 0.28, dur: 0.18, type: 'triangle', gain: 0.11 },
  ],
  urgent: [
    { freq: 990, start: 0, dur: 0.08, type: 'square', gain: 0.07 },
    { freq: 990, start: 0.12, dur: 0.08, type: 'square', gain: 0.07 },
    { freq: 990, start: 0.24, dur: 0.08, type: 'square', gain: 0.07 },
    { freq: 1200, start: 0.36, dur: 0.15, type: 'square', gain: 0.08 },
  ],
  soft: [
    { freq: 440, start: 0, dur: 0.35, type: 'sine', gain: 0.08 },
    { freq: 554, start: 0.4, dur: 0.4, type: 'sine', gain: 0.07 },
  ],
  drum: [
    { freq: 120, start: 0, dur: 0.12, type: 'sine', gain: 0.2 },
    { freq: 90, start: 0.18, dur: 0.1, type: 'sine', gain: 0.18 },
    { freq: 150, start: 0.32, dur: 0.14, type: 'sine', gain: 0.16 },
  ],
  whistle: [
    { freq: 1400, start: 0, dur: 0.1, type: 'sine', gain: 0.1 },
    { freq: 1800, start: 0.12, dur: 0.15, type: 'sine', gain: 0.11 },
    { freq: 1600, start: 0.3, dur: 0.2, type: 'sine', gain: 0.1 },
  ],
  melody: [
    { freq: 392, start: 0, dur: 0.1, type: 'triangle', gain: 0.09 },
    { freq: 494, start: 0.12, dur: 0.1, type: 'triangle', gain: 0.09 },
    { freq: 587, start: 0.24, dur: 0.1, type: 'triangle', gain: 0.09 },
    { freq: 784, start: 0.36, dur: 0.22, type: 'triangle', gain: 0.1 },
  ],
  digital: [
    { freq: 660, start: 0, dur: 0.05, type: 'square', gain: 0.06 },
    { freq: 880, start: 0.07, dur: 0.05, type: 'square', gain: 0.06 },
    { freq: 1100, start: 0.14, dur: 0.05, type: 'square', gain: 0.06 },
    { freq: 880, start: 0.21, dur: 0.05, type: 'square', gain: 0.06 },
    { freq: 1320, start: 0.28, dur: 0.12, type: 'square', gain: 0.07 },
  ],
};

let audioQueue: Promise<void> = Promise.resolve();

function playPattern(soundId: AlertSoundId): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const tones = SOUND_PATTERNS[soundId] || SOUND_PATTERNS.bell;
  const totalMs = Math.ceil((Math.max(...tones.map((t) => t.start + t.dur)) + 0.15) * 1000);

  return new Promise((resolve) => {
    try {
      const ctx = new AudioContext();
      for (const t of tones) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = t.type || 'sine';
        o.frequency.value = t.freq;
        g.gain.value = t.gain ?? 0.12;
        o.connect(g);
        g.connect(ctx.destination);
        o.start(ctx.currentTime + t.start);
        o.stop(ctx.currentTime + t.start + t.dur);
      }
      setTimeout(() => {
        void ctx.close();
        resolve();
      }, totalMs);
    } catch {
      resolve();
    }
  });
}

/** เล่นเสียง SLA ด่วน — ดังกว่าแจ้งเตือนปกติ */
export function playSlaUrgentAlert() {
  if (typeof window === 'undefined') return;
  audioQueue = audioQueue.then(async () => {
    await playPattern('urgent');
    await playPattern('urgent');
  });
}

/** เล่นเสียงตามที่ตั้งไว้ของร้าน */
export function playShopAlert(shopId: string) {
  const { enabled, soundId } = getShopAlertSettings(shopId);
  if (!enabled) return;
  audioQueue = audioQueue.then(() => playPattern(soundId));
}

/** ทดสอบเสียงที่เลือก (ไม่ต้องเปิดแจ้งเตือน) */
export function previewAlertSound(soundId: AlertSoundId) {
  audioQueue = audioQueue.then(() => playPattern(soundId));
}

/** @deprecated ใช้ playShopAlert(shopId) แทน */
export function playNewOrderAlert(shopId?: string) {
  if (shopId) {
    playShopAlert(shopId);
    return;
  }
  previewAlertSound(DEFAULT_SOUND);
}

export function suggestDefaultSound(shopIndex: number): AlertSoundId {
  const ids = ALERT_SOUNDS.map((s) => s.id);
  return ids[shopIndex % ids.length];
}
