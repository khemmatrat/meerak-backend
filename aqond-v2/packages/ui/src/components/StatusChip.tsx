import React from 'react';

export type StatusChipTone =
  | 'default'
  | 'pending'
  | 'active'
  | 'delivering'
  | 'completed'
  | 'cancelled'
  | 'online'
  | 'offline'
  | 'success'
  | 'danger'
  | 'warning'
  | 'info';

type Props = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusChipTone;
  /** Show pulsing dot for live states */
  live?: boolean;
};

export function StatusChip({ tone = 'default', live, className = '', children, ...props }: Props) {
  const liveClass = live ? ' aq-status-chip--live' : '';
  return (
    <span
      className={`aq-status-chip aq-status-chip--${tone}${liveClass} ${className}`.trim()}
      {...props}
    >
      {live && <span className="aq-status-chip-dot" aria-hidden />}
      {children}
    </span>
  );
}
