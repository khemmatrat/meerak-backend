/**
 * Clean Slate Theme Engine — data-theme on document root
 * Theme Isolation: NO global overrides leaking into standard.
 * Values: standard | vip-silver | vip-gold | vip-platinum
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";

const THEME_STORAGE_KEY = "aqond_data_theme";
const BADGE_STORAGE_KEY = "aqond_badge_display";

export type ThemeId = "standard" | "vip-silver" | "vip-gold" | "vip-platinum";
export type BadgeDisplay = "none" | "member" | "vip" | "coach";

interface ThemeContextType {
  theme: ThemeId;
  badgeDisplay: BadgeDisplay;
  isCoach: boolean;
  setTheme: (t: ThemeId) => void;
  setBadgeDisplay: (b: BadgeDisplay) => void;
  restoreDefault: () => void;
  /** VIP themes available to user (based on vip_tier) */
  availableVipThemes: ThemeId[];
}

const defaultContext: ThemeContextType = {
  theme: "standard",
  badgeDisplay: "vip",
  isCoach: false,
  setTheme: () => {},
  setBadgeDisplay: () => {},
  restoreDefault: () => {},
  availableVipThemes: [],
};

const ThemeContext = createContext<ThemeContextType>(defaultContext);

function applyThemeToDocument(theme: ThemeId) {
  const html = document.documentElement;
  if (theme === "standard") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", theme);
  }
}

function loadStoredTheme(): ThemeId {
  try {
    const s = localStorage.getItem(THEME_STORAGE_KEY);
    if (s === "vip-silver" || s === "vip-gold" || s === "vip-platinum" || s === "standard") {
      return s;
    }
    // Migrate from legacy vip_theme_override
    const legacy = localStorage.getItem("vip_theme_override");
    if (legacy === "standard") return "standard";
    if (legacy === "silver") return "vip-silver";
    if (legacy === "gold") return "vip-gold";
    if (legacy === "platinum") return "vip-platinum";
  } catch (_) {}
  return "standard";
}

function loadStoredBadge(): BadgeDisplay {
  try {
    const s = localStorage.getItem(BADGE_STORAGE_KEY);
    if (s === "none" || s === "member" || s === "vip" || s === "coach") return s;
  } catch (_) {}
  return "vip";
}

interface ThemeProviderProps {
  children: ReactNode;
  /** User's VIP tier — determines which VIP themes are unlocked */
  vipTier?: string | null;
  /** User is coach — unlocks Coach badge */
  isCoach?: boolean;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  vipTier = null,
  isCoach = false,
}) => {
  const [theme, setThemeState] = useState<ThemeId>(loadStoredTheme);
  const [badgeDisplay, setBadgeDisplayState] = useState<BadgeDisplay>(loadStoredBadge);

  const t = (vipTier || "").toLowerCase();
  const availableVipThemes: ThemeId[] =
    t === "platinum"
      ? ["vip-silver", "vip-gold", "vip-platinum"]
      : t === "gold"
        ? ["vip-silver", "vip-gold"]
        : t === "silver"
          ? ["vip-silver"]
          : [];

  const setTheme = useCallback((t: ThemeId) => {
    if (t !== "standard" && !availableVipThemes.includes(t)) return;
    setThemeState(t);
    try {
      if (t === "standard") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch (_) {}
    applyThemeToDocument(t);
  }, [availableVipThemes]);

  const setBadgeDisplay = useCallback((b: BadgeDisplay) => {
    setBadgeDisplayState(b);
    try {
      localStorage.setItem(BADGE_STORAGE_KEY, b);
    } catch (_) {}
  }, []);

  const restoreDefault = useCallback(() => {
    setThemeState("standard");
    setBadgeDisplayState("vip");
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.setItem(BADGE_STORAGE_KEY, "vip");
    } catch (_) {}
    applyThemeToDocument("standard");
  }, []);

  // Apply theme on mount and when theme changes
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // If stored theme is VIP but user no longer has access, reset to standard
  useEffect(() => {
    if (theme !== "standard" && !availableVipThemes.includes(theme)) {
      setThemeState("standard");
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } catch (_) {}
      applyThemeToDocument("standard");
    }
  }, [theme, availableVipThemes]);

  const value: ThemeContextType = {
    theme,
    badgeDisplay,
    isCoach: !!isCoach,
    setTheme,
    setBadgeDisplay,
    restoreDefault,
    availableVipThemes,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
};
