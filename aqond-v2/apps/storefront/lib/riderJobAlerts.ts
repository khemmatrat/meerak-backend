/** In-app alert when new dispatch jobs appear */

let lastAlertAt = 0;
const COOLDOWN_MS = 8000;

function playOfferTone(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = urgent ? 1046 : 880;
    gain.gain.value = urgent ? 0.12 : 0.08;
    osc.start();
    osc.stop(ctx.currentTime + (urgent ? 0.25 : 0.15));
    if (urgent) {
      const osc2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      osc2.connect(g2);
      g2.connect(ctx.destination);
      osc2.frequency.value = 1318;
      g2.gain.value = 0.1;
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.4);
    }
    setTimeout(() => void ctx.close(), 500);
  } catch {
    /* ignore */
  }
}

/** Text-to-speech job offer (th-TH) — best-effort, skipped if unavailable */
export function speakJobOffer(message: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(message);
    u.lang = 'th-TH';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function alertNewRiderJobs(count: number, opts?: { urgent?: boolean; speak?: string }) {
  if (typeof window === 'undefined' || count <= 0) return;
  const now = Date.now();
  if (now - lastAlertAt < COOLDOWN_MS) return;
  lastAlertAt = now;

  try {
    if (navigator.vibrate) navigator.vibrate(opts?.urgent ? [180, 80, 180, 80, 180] : [120, 60, 120]);
  } catch {
    /* ignore */
  }

  playOfferTone(!!opts?.urgent);

  if (opts?.speak) speakJobOffer(opts.speak);

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(opts?.urgent ? 'AQOND Rider — งานด่วน' : 'AQOND Rider — งานใหม่', {
        body: opts?.speak || `มี ${count} งานใหม่รอรับ`,
        tag: 'rider-new-job',
      });
    } catch {
      /* ignore */
    }
  }
}

let lastNearbyAt = 0;
const NEARBY_COOLDOWN_MS = 5 * 60 * 1000;

/** แจ้งเตือนงานใกล้ตัวเมื่อออนไลน์ */
export function alertNearbyRiderJob(earningMicro: number, distanceKm?: number) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastNearbyAt < NEARBY_COOLDOWN_MS) return;
  lastNearbyAt = now;

  const thb = (earningMicro / 100).toFixed(0);
  const dist = distanceKm != null ? ` · ${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} ม.` : `${distanceKm.toFixed(1)} กม.`}` : '';
  const message = `มีงานใกล้คุณ ~฿${thb}${dist}`;

  showRiderJobToast(message);

  try {
    if (navigator.vibrate) navigator.vibrate(80);
  } catch {
    /* ignore */
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('AQOND Rider — งานใกล้คุณ', {
        body: message,
        tag: 'rider-nearby-job',
      });
    } catch {
      /* ignore */
    }
  }
}

export function showRiderJobToast(message: string) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'tt-rider-job-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

const DISMISS_KEY = 'rider_dismissed_jobs';

export function loadDismissedJobIds(riderId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(`${DISMISS_KEY}:${riderId}`);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function dismissJobForSession(riderId: string, jobId: string) {
  if (typeof window === 'undefined') return;
  const set = loadDismissedJobIds(riderId);
  set.add(jobId);
  sessionStorage.setItem(`${DISMISS_KEY}:${riderId}`, JSON.stringify([...set]));
}
