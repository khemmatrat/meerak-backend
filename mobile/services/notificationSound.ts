/**
 * Notification sound — เล่นเสียงเมื่อมี notification ใหม่เข้ามา
 *
 * ถ้ามีไฟล์ /aqond_notification.mp3 ใน public/ จะใช้ไฟล์นั้น
 * ถ้าไม่มี (หรือโหลดไม่สำเร็จ) จะ fallback เป็น Web Audio API beep
 *
 * Browser autoplay policy: ต้องมี user interaction (click/touch) อย่างน้อย 1 ครั้ง
 * ก่อนเล่นเสียงได้ — เรียก unlockNotificationSound() ตอน user tap ครั้งแรก
 */

let _unlocked = false;
let _audioCtx: AudioContext | null = null;
let _cachedAudio: HTMLAudioElement | null = null;
let _mp3Available: boolean | null = null;
let _lastPlayedAt = 0;

const DEBOUNCE_MS = 2000;
const MUTE_KEY = "notif_sound_muted";

function _loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}
let _muted = _loadMuted();
const MP3_PATH = "./aqond_notification.mp3";

function getAudioContext(): AudioContext | null {
  if (_audioCtx) return _audioCtx;
  try {
    _audioCtx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    return _audioCtx;
  } catch {
    return null;
  }
}

async function probeMp3(): Promise<boolean> {
  if (_mp3Available !== null) return _mp3Available;
  try {
    const res = await fetch(MP3_PATH, { method: "HEAD" });
    _mp3Available = res.ok;
  } catch {
    _mp3Available = false;
  }
  return _mp3Available;
}

function playBeepFallback() {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {
    /* silent fail */
  }
}

async function playMp3() {
  try {
    if (!_cachedAudio) {
      _cachedAudio = new Audio(MP3_PATH);
      _cachedAudio.volume = 0.6;
    }
    _cachedAudio.currentTime = 0;
    await _cachedAudio.play();
  } catch {
    playBeepFallback();
  }
}

/**
 * เรียกครั้งเดียวตอน user interact (click/touch) เพื่อปลดล็อค autoplay
 */
export function unlockNotificationSound(): void {
  if (_unlocked) return;
  _unlocked = true;
  const ctx = getAudioContext();
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

export function isNotificationSoundMuted(): boolean {
  return _muted;
}

export function setNotificationSoundMuted(muted: boolean): void {
  _muted = muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {}
}

export function toggleNotificationSound(): boolean {
  setNotificationSoundMuted(!_muted);
  return _muted;
}

/**
 * เล่นเสียง notification — จะไม่ทำงานจนกว่าจะ unlock + debounce 2 วินาที
 */
export async function playNotificationSound(): Promise<void> {
  if (!_unlocked || _muted) return;
  const now = Date.now();
  if (now - _lastPlayedAt < DEBOUNCE_MS) return;
  _lastPlayedAt = now;

  const hasMp3 = await probeMp3();
  if (hasMp3) {
    await playMp3();
  } else {
    playBeepFallback();
  }
}
