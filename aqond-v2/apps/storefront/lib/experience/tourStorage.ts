const STORAGE_KEY = 'aqond_ftx_tour_v1';

type TourState = {
  completedAt?: string;
  skipped?: boolean;
};

function read(): TourState {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as TourState;
  } catch {
    return {};
  }
}

export function isTourCompletedLocally(): boolean {
  return Boolean(read().completedAt);
}

export function markTourCompletedLocally(skipped = false) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ completedAt: new Date().toISOString(), skipped }),
  );
}
