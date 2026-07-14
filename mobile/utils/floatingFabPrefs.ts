export interface FloatingFabPrefs {
  showSos: boolean;
  showVip: boolean;
}

const STORAGE_KEY = "aqond_floating_fab_prefs_v1";
export const FLOATING_FAB_PREFS_EVENT = "aqond-floating-fab-prefs-changed";

const DEFAULT: FloatingFabPrefs = {
  showSos: true,
  showVip: true,
};

export function loadFloatingFabPrefs(): FloatingFabPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<FloatingFabPrefs>;
    return {
      showSos: parsed.showSos !== false,
      showVip: parsed.showVip !== false,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveFloatingFabPrefs(prefs: FloatingFabPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  window.dispatchEvent(new CustomEvent(FLOATING_FAB_PREFS_EVENT));
}

export function hideFloatingSos(): void {
  saveFloatingFabPrefs({ ...loadFloatingFabPrefs(), showSos: false });
}

export function hideFloatingVip(): void {
  saveFloatingFabPrefs({ ...loadFloatingFabPrefs(), showVip: false });
}
