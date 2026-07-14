import React, { createContext, useContext, ReactNode } from 'react';
import type { VIPTier } from '../components/VIPBadge';

type ThemeId = 'standard' | 'silver' | 'gold' | 'platinum';

interface VIPThemeContextType {
  tier: VIPTier;
  themeId: ThemeId;
  themeClass: string;
  themeStyles: React.CSSProperties;
}

const defaultContext: VIPThemeContextType = {
  tier: 'none',
  themeId: 'standard',
  themeClass: '',
  themeStyles: {},
};

const VIPThemeContext = createContext<VIPThemeContextType>(defaultContext);

function tierToThemeId(tier: VIPTier | string | null | undefined): ThemeId {
  const t = (tier || 'none').toString().toLowerCase();
  if (t === 'silver' || t === 'gold' || t === 'platinum') return t as ThemeId;
  return 'standard';
}

// Dynamic Theme by Tier:
// Silver: Metallic Slate & Chrome (reflective dimension)
// Gold: Luxury Gold - black & gold (unchanged)
// Platinum: Royal Deep Purple & Electric Violet
function getTheme(tier: VIPTier): { themeClass: string; themeStyles: React.CSSProperties } {
  switch (tier) {
    case 'silver':
      return {
        themeClass: 'vip-theme-silver',
        themeStyles: {
          ['--vip-bg' as string]: '#0f172a',
          ['--vip-surface' as string]: 'rgba(30,41,59,0.92)',
          ['--vip-border' as string]: 'linear-gradient(135deg, #94a3b8 0%, #cbd5e1 50%, #64748b 100%)',
          ['--vip-accent' as string]: '#94a3b8',
          ['--vip-text' as string]: '#e2e8f0',
          ['--vip-glass' as string]: 'rgba(30,41,59,0.88)',
          ['--vip-chrome' as string]: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, transparent 50%, rgba(255,255,255,0.08) 100%)',
        },
      };
    case 'gold':
      return {
        themeClass: 'vip-theme-gold',
        themeStyles: {
          ['--vip-bg' as string]: '#0c0a09',
          ['--vip-surface' as string]: 'rgba(30,27,24,0.9)',
          ['--vip-border' as string]: '#f59e0b',
          ['--vip-accent' as string]: '#fbbf24',
          ['--vip-text' as string]: '#fef3c7',
          ['--vip-glow' as string]: '0 0 20px rgba(251,191,36,0.3)',
          ['--vip-glass' as string]: 'rgba(20,20,20,0.85)',
        },
      };
    case 'platinum':
      return {
        themeClass: 'vip-theme-platinum',
        themeStyles: {
          ['--vip-bg' as string]: '#0F0720',
          ['--vip-surface' as string]: 'rgba(15,7,32,0.45)',
          ['--vip-border' as string]: 'rgba(255,255,255,0.1)',
          ['--vip-accent' as string]: '#8B5CF6',
          ['--vip-text' as string]: '#E2E8F0',
          ['--vip-glass' as string]: 'rgba(15,7,32,0.5)',
          ['--vip-gradient' as string]: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
          ['--vip-glow-purple' as string]: '0 0 24px rgba(139,92,246,0.4)',
          ['--vip-glow-gold' as string]: 'inset -1px -1px 0 rgba(212,175,55,0.15)',
        },
      };
    default:
      return {
        themeClass: 'vip-theme-standard',
        themeStyles: {
          ['--vip-bg' as string]: '#f8fafc',
          ['--vip-surface' as string]: '#ffffff',
          ['--vip-border' as string]: 'rgba(203, 213, 225, 0.8)',
          ['--vip-accent' as string]: '#059669',
          ['--vip-text' as string]: '#0f172a',
        },
      };
  }
}

interface VIPThemeProviderProps {
  tier: VIPTier | string | null | undefined;
  children: ReactNode;
}

export const VIPThemeProvider: React.FC<VIPThemeProviderProps> = ({ tier, children }) => {
  const normalized = (tier && tier !== 'none' ? String(tier).toLowerCase() : 'none') as VIPTier;
  const themeId = tierToThemeId(normalized);
  const { themeClass, themeStyles } = getTheme(normalized);

  const value: VIPThemeContextType = {
    tier: normalized,
    themeId,
    themeClass,
    themeStyles,
  };

  return (
    <VIPThemeContext.Provider value={value}>
      <div className={`${themeClass} min-h-full`} style={themeStyles}>
        {children}
      </div>
    </VIPThemeContext.Provider>
  );
};

export const useVIPTheme = () => useContext(VIPThemeContext);
