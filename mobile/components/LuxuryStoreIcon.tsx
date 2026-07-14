import React from 'react';

/** Luxury AQOND boutique mark — matches storefront TtLuxuryIcons */
export function LuxuryStoreIcon({ size = 32 }: { size?: number }) {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-g`} x1="2" y1="2" x2="22" y2="22">
          <stop offset="0%" stopColor="#FFF8E7" />
          <stop offset="50%" stopColor="#C9A227" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
        <linearGradient id={`${uid}-c`} x1="12" y1="2" x2="12" y2="22">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="100%" stopColor="#E8D5A8" />
        </linearGradient>
      </defs>
      <path
        d="M4 10.5 6.2 5.5l2.3 3 3.5-5 3.5 5 2.3-3L20 10.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5z"
        fill={`url(#${uid}-c)`}
        stroke={`url(#${uid}-g)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <text x="12" y="13.8" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#8B6914" fontFamily="Georgia, serif">
        A
      </text>
    </svg>
  );
}
