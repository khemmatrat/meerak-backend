'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type AqondTheme = 'aqond-light' | 'aqond-dark';

type ThemeContextValue = {
  theme: AqondTheme;
  setTheme: (theme: AqondTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveInitialTheme(storageKey: string, defaultTheme: AqondTheme): AqondTheme {
  if (typeof window === 'undefined') return defaultTheme;
  try {
    const stored = localStorage.getItem(storageKey) as AqondTheme | null;
    if (stored === 'aqond-light' || stored === 'aqond-dark') return stored;
  } catch {
    /* ignore */
  }
  if (defaultTheme) return defaultTheme;
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'aqond-dark';
  }
  return 'aqond-light';
}

type Props = {
  children: React.ReactNode;
  /** @default aqond-light */
  defaultTheme?: AqondTheme;
  /** @default aqond-theme */
  storageKey?: string;
  /** Apply data-theme on documentElement */
  applyToDocument?: boolean;
};

export function ThemeProvider({
  children,
  defaultTheme = 'aqond-light',
  storageKey = 'aqond-theme',
  applyToDocument = true,
}: Props) {
  const [theme, setThemeState] = useState<AqondTheme>(() =>
    resolveInitialTheme(storageKey, defaultTheme),
  );

  const setTheme = useCallback(
    (next: AqondTheme) => {
      setThemeState(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'aqond-light' ? 'aqond-dark' : 'aqond-light');
  }, [theme, setTheme]);

  useEffect(() => {
    if (!applyToDocument || typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme, applyToDocument]);

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAqondTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAqondTheme must be used within ThemeProvider');
  }
  return ctx;
}
