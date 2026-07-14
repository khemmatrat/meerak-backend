/** เสียงแจ้งเตือนแอดมิน — ต้อง unlock หลังคลิกครั้งแรก (browser autoplay policy) */

let unlocked = false;
let audioCtx: AudioContext | null = null;
let lastPlayedAt = 0;
const DEBOUNCE_MS = 2500;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();
    return audioCtx;
  } catch {
    return null;
  }
}

export function unlockAdminNotificationSound(): void {
  if (unlocked) return;
  unlocked = true;
  const ctx = getCtx();
  if (ctx?.state === "suspended") void ctx.resume();
}

export function playAdminNotificationSound(): void {
  if (!unlocked) return;
  const now = Date.now();
  if (now - lastPlayedAt < DEBOUNCE_MS) return;
  lastPlayedAt = now;

  const ctx = getCtx();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    // สองโน้ตสั้น — ได้ยินชัดกว่า beep เดียว
    [880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      osc.start(t0);
      osc.stop(t0 + 0.36);
    });
  } catch {
    /* ignore */
  }
}

export function isAdminSoundUnlocked(): boolean {
  return unlocked;
}
