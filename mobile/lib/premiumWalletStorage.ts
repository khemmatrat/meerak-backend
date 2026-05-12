/**
 * Session-scoped "Premium Wallet" demo state — ties Quick Match success to revenue UI.
 * Persists in sessionStorage for the browser tab session.
 */

export const PREMIUM_WALLET_UPDATED = "premium-wallet:updated";

const BALANCE_KEY = "premium_wallet_balance_thb";
const ACTIVITY_KEY = "premium_wallet_activity_json";
const DAILY_KEY = "premium_wallet_daily_thb_json";
const MATCHES_KEY = "premium_wallet_match_count";

export type WalletActivity = {
  id: string;
  type: "quick_match" | "withdraw_demo";
  label: string;
  amountThb: number;
  ts: number;
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getPremiumBalanceThb(): number {
  const v = sessionStorage.getItem(BALANCE_KEY);
  if (v != null && v !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

function setPremiumBalanceThb(n: number) {
  sessionStorage.setItem(BALANCE_KEY, String(Math.max(0, n)));
}

export function getActivities(): WalletActivity[] {
  return safeParse<WalletActivity[]>(sessionStorage.getItem(ACTIVITY_KEY), []).slice(0, 50);
}

function setActivities(a: WalletActivity[]) {
  sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify(a.slice(0, 50)));
}

function getDailyMap(): Record<string, number> {
  return safeParse<Record<string, number>>(sessionStorage.getItem(DAILY_KEY), {});
}

function setDailyMap(m: Record<string, number>) {
  sessionStorage.setItem(DAILY_KEY, JSON.stringify(m));
}

function bumpDaily(amountThb: number) {
  const k = todayKey();
  const m = getDailyMap();
  m[k] = (m[k] || 0) + amountThb;
  setDailyMap(m);
}

function dispatchUpdated() {
  try {
    window.dispatchEvent(new CustomEvent(PREMIUM_WALLET_UPDATED));
  } catch {
    /* ignore */
  }
}

/**
 * Called when Quick Match completes successfully (theoretical platform revenue credit).
 */
export function recordQuickMatchSuccess(_vibeId: string, vibeLabel: string, amountThb: number) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const balance = getPremiumBalanceThb() + amountThb;
  setPremiumBalanceThb(balance);
  bumpDaily(amountThb);

  const prev = getActivities();
  const entry: WalletActivity = {
    id,
    type: "quick_match",
    label: `Quick Match: ${vibeLabel}`,
    amountThb,
    ts: Date.now(),
  };
  setActivities([entry, ...prev]);

  const mc = Number(sessionStorage.getItem(MATCHES_KEY) || "0") || 0;
  sessionStorage.setItem(MATCHES_KEY, String(mc + 1));

  dispatchUpdated();
}

export function getSuccessfulMatchCount(): number {
  const n = Number(sessionStorage.getItem(MATCHES_KEY) || "0");
  return Number.isFinite(n) ? n : 0;
}

export function getTodayEarningsThb(): number {
  const m = getDailyMap();
  return m[todayKey()] || 0;
}

/** Last 7 days including today — amounts from daily map (0 if none yet) */
export function getDailyRevenueSeries(): { label: string; amount: number; iso: string }[] {
  const m = getDailyMap();
  const out: { label: string; amount: number; iso: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const amount = m[iso] ?? 0;
    out.push({
      iso,
      amount,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    });
  }
  return out;
}

export function subscribePremiumWallet(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(PREMIUM_WALLET_UPDATED, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(PREMIUM_WALLET_UPDATED, handler);
    window.removeEventListener("storage", handler);
  };
}
