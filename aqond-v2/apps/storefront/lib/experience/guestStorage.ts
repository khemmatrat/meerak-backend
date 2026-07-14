/** Guest FTX state — localStorage merge target (Sprint 30b) */

const STORAGE_KEY = 'aqond_ftx_guest_v1';

export type FtxGuestState = {
  guestId: string;
  welcomeDismissedAt?: string;
  language?: 'th' | 'en';
};

function readRaw(): FtxGuestState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FtxGuestState;
    if (parsed?.guestId) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function write(state: FtxGuestState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getOrCreateGuestId(): string {
  const existing = readRaw();
  if (existing?.guestId) return existing.guestId;
  const guestId =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? `guest_${crypto.randomUUID()}`
      : `guest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  write({ guestId });
  return guestId;
}

export function isWelcomeDismissed(): boolean {
  return Boolean(readRaw()?.welcomeDismissedAt);
}

export function markWelcomeDismissed() {
  const guestId = getOrCreateGuestId();
  const prev = readRaw();
  write({
    guestId,
    language: prev?.language,
    welcomeDismissedAt: new Date().toISOString(),
  });
}

export function getGuestLanguage(): 'th' | 'en' {
  return readRaw()?.language === 'en' ? 'en' : 'th';
}

export function setGuestLanguage(lang: 'th' | 'en') {
  const guestId = getOrCreateGuestId();
  const prev = readRaw();
  write({
    guestId,
    language: lang,
    welcomeDismissedAt: prev?.welcomeDismissedAt,
  });
}
