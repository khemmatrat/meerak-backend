type IconProps = { className?: string; size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconShop({ className, size = 18 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M4 10h16M6 10V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M7 10v9h10v-9" />
    </svg>
  );
}

export function IconHome({ className, size = 18 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-5v-5H10v5H5a1 1 0 0 1-1-1v-7.5z" />
    </svg>
  );
}

export function IconRider({ className, size = 18 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <circle cx="6.5" cy="17" r="2" />
      <circle cx="17.5" cy="17" r="2" />
      <path d="M4 17h2.2l2.3-6.5h5l2.2 4.5H20M9.5 10.5 11 7h4l1.5 3.5" />
    </svg>
  );
}

export function IconReceipt({ className, size = 18 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M7 4h10v16l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V4z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconCheck({ className, size = 14 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M5 12.5 9.5 17 19 7" />
    </svg>
  );
}

export function IconSearch({ className, size = 18 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </svg>
  );
}

export function IconStar({ className, size = 14 }: IconProps) {
  const p = { ...base(size), fill: 'currentColor', stroke: 'none' };
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M12 3.5 14.2 9l5.8.5-4.4 3.8 1.4 5.7L12 16.8 7 19l1.4-5.7L4 9.5l5.8-.5L12 3.5z" />
    </svg>
  );
}

/** Bottom tab bar — stroke icons (no emoji) */
export function IconTabFeed({ className, size = 22 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTabCart({ className, size = 22 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <path d="M7 9V7a5 5 0 0 1 10 0v2" />
      <path d="M5 9h14l-1.2 10H6.2L5 9z" />
    </svg>
  );
}

export function IconTabUser({ className, size = 22 }: IconProps) {
  const p = base(size);
  return (
    <svg {...p} className={className} aria-hidden>
      <circle cx="12" cy="8.5" r="3.25" />
      <path d="M5 19.5c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" />
    </svg>
  );
}
