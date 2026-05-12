const STORAGE_KEY = "aqond_academy_hub_v2";

export type AcademyPersisted = {
  activeIndex: number;
  isTalentMode: boolean;
  briefingMode: "summary" | "detailed";
};

const defaultState: AcademyPersisted = {
  activeIndex: 0,
  isTalentMode: false,
  briefingMode: "summary",
};

export function loadAcademyState(): AcademyPersisted {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<AcademyPersisted>;
    return {
      activeIndex:
        typeof parsed.activeIndex === "number" &&
        parsed.activeIndex >= 0 &&
        Number.isFinite(parsed.activeIndex)
          ? parsed.activeIndex
          : 0,
      isTalentMode: Boolean(parsed.isTalentMode),
      briefingMode: parsed.briefingMode === "detailed" ? "detailed" : "summary",
    };
  } catch {
    return defaultState;
  }
}

export function saveAcademyState(state: AcademyPersisted): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
}
