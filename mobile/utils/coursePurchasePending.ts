const STORAGE_KEY = "course_pending_purchase";
const TOPUP_HINT_KEY = "course_topup_amount";

export type PendingCoursePurchase = {
  courseId: string;
  title: string;
  requiredAmount: number;
  shortfall?: number;
  savedAt: string;
};

export function savePendingCoursePurchase(payload: Omit<PendingCoursePurchase, "savedAt">) {
  const record: PendingCoursePurchase = {
    ...payload,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  if (payload.shortfall != null && payload.shortfall > 0) {
    sessionStorage.setItem(TOPUP_HINT_KEY, String(Math.ceil(payload.shortfall)));
  }
}

export function getPendingCoursePurchase(): PendingCoursePurchase | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingCoursePurchase;
  } catch {
    return null;
  }
}

export function clearPendingCoursePurchase() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(TOPUP_HINT_KEY);
}

export function consumeTopUpHintAmount(): string {
  const hint = sessionStorage.getItem(TOPUP_HINT_KEY) || "";
  sessionStorage.removeItem(TOPUP_HINT_KEY);
  return hint;
}
