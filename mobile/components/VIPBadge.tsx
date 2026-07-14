import React from 'react';
import { Crown, Sparkles } from 'lucide-react';

export type VIPTier = 'none' | 'silver' | 'gold' | 'platinum';

const GOLD = '#D4AF37';

const TIER_CONFIG: Record<VIPTier, { label: string; short: string; className: string; Icon?: React.ComponentType<{ size?: number; className?: string; color?: string }> }> = {
  none: { label: 'Standard', short: '', className: '' },
  silver: {
    label: 'Silver',
    short: 'S',
    className: 'bg-gradient-to-r from-slate-300 to-slate-400 text-white border border-slate-200 shadow-md',
    Icon: Crown,
  },
  gold: {
    label: 'Gold',
    short: 'G',
    className: 'badge-platinum-gold',
    Icon: Crown,
  },
  platinum: {
    label: 'Platinum',
    short: 'P',
    className: 'badge-platinum-glow',
    Icon: Sparkles,
  },
};

interface VIPBadgeProps {
  tier: VIPTier | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const VIPBadge: React.FC<VIPBadgeProps> = ({
  tier,
  size = 'sm',
  showLabel = false,
  className = '',
}) => {
  const normalized = (tier && tier !== 'none' ? String(tier).toLowerCase() : 'none') as VIPTier;
  const config = TIER_CONFIG[normalized] || TIER_CONFIG.none;
  if (normalized === 'none') return null;

  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : size === 'md' ? 'text-xs px-2 py-1' : 'text-sm px-2.5 py-1';
  const iconSize = size === 'sm' ? 10 : size === 'md' ? 12 : 14;
  const Icon = config.Icon;

  const isPremium = normalized === 'platinum' || normalized === 'gold';

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-[50px] font-bold uppercase tracking-wide ${config.className} ${sizeClass} ${className}`}
      title={`AKONDA VIP ${config.label}`}
    >
      {Icon && <Icon size={iconSize} className="flex-shrink-0" color={isPremium ? GOLD : undefined} />}
      {showLabel ? config.label : config.short}
    </span>
  );
};
