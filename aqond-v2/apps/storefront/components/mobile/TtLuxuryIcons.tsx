'use client';

import { useId, type ReactNode } from 'react';
import type { OrderTab } from '@/lib/ordersHub';

export type LuxuryIconProps = {
  className?: string;
  size?: number;
};

function LuxSvg({
  size = 24,
  className,
  children,
}: LuxuryIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={`tt-lux-icon${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      {children}
    </svg>
  );
}

function LuxRedGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-red`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fecaca" />
        <stop offset="35%" stopColor="#ef4444" />
        <stop offset="72%" stopColor="#dc2626" />
        <stop offset="100%" stopColor="#991b1b" />
      </linearGradient>
      <linearGradient id={`${uid}-redLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fff1f2" />
        <stop offset="55%" stopColor="#fca5a5" />
        <stop offset="100%" stopColor="#f87171" />
      </linearGradient>
    </defs>
  );
}

function LuxBlueGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-blue`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#bae6fd" />
        <stop offset="35%" stopColor="#38bdf8" />
        <stop offset="72%" stopColor="#0284c7" />
        <stop offset="100%" stopColor="#1d4ed8" />
      </linearGradient>
      <linearGradient id={`${uid}-blueLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f0f9ff" />
        <stop offset="55%" stopColor="#7dd3fc" />
        <stop offset="100%" stopColor="#0ea5e9" />
      </linearGradient>
    </defs>
  );
}

function LuxTealGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-teal`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#99f6e4" />
        <stop offset="35%" stopColor="#2dd4bf" />
        <stop offset="72%" stopColor="#0d9488" />
        <stop offset="100%" stopColor="#115e59" />
      </linearGradient>
      <linearGradient id={`${uid}-tealLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f0fdfa" />
        <stop offset="55%" stopColor="#5eead4" />
        <stop offset="100%" stopColor="#14b8a6" />
      </linearGradient>
    </defs>
  );
}

function LuxGreenGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-green`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#bbf7d0" />
        <stop offset="35%" stopColor="#22c55e" />
        <stop offset="72%" stopColor="#16a34a" />
        <stop offset="100%" stopColor="#14532d" />
      </linearGradient>
      <linearGradient id={`${uid}-greenLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#f0fdf4" />
        <stop offset="55%" stopColor="#86efac" />
        <stop offset="100%" stopColor="#4ade80" />
      </linearGradient>
    </defs>
  );
}

function LuxOrangeGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-orange`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fed7aa" />
        <stop offset="35%" stopColor="#fb923c" />
        <stop offset="72%" stopColor="#ea580c" />
        <stop offset="100%" stopColor="#9a3412" />
      </linearGradient>
      <linearGradient id={`${uid}-orangeLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fff7ed" />
        <stop offset="55%" stopColor="#fdba74" />
        <stop offset="100%" stopColor="#f97316" />
      </linearGradient>
    </defs>
  );
}

function LuxPurpleGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-purple`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#e9d5ff" />
        <stop offset="35%" stopColor="#a855f7" />
        <stop offset="72%" stopColor="#7c3aed" />
        <stop offset="100%" stopColor="#581c87" />
      </linearGradient>
      <linearGradient id={`${uid}-purpleLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#faf5ff" />
        <stop offset="55%" stopColor="#c4b5fd" />
        <stop offset="100%" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  );
}

function LuxAmberGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-amber`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fde68a" />
        <stop offset="35%" stopColor="#fbbf24" />
        <stop offset="72%" stopColor="#d97706" />
        <stop offset="100%" stopColor="#92400e" />
      </linearGradient>
      <linearGradient id={`${uid}-amberLight`} x1="12" y1="4" x2="12" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#fffbeb" />
        <stop offset="55%" stopColor="#fcd34d" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
  );
}

function LuxGradients({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`${uid}-gold`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFF8E7" />
        <stop offset="28%" stopColor="#E8C872" />
        <stop offset="55%" stopColor="#C9A227" />
        <stop offset="82%" stopColor="#8B6914" />
        <stop offset="100%" stopColor="#F4E4BC" />
      </linearGradient>
      <linearGradient id={`${uid}-champagne`} x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFFDF8" />
        <stop offset="50%" stopColor="#E8D5A8" />
        <stop offset="100%" stopColor="#B8956A" />
      </linearGradient>
      <linearGradient id={`${uid}-obsidian`} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#4A4A4A" />
        <stop offset="100%" stopColor="#1A1A1A" />
      </linearGradient>
    </defs>
  );
}

export function IconLuxToShip({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="4.5" y="7" width="15" height="12" rx="2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.2" />
      <path d="M4.5 11h15" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M12 7v12" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M12 7 8.5 4.5h7L12 7z" fill={`url(#${uid}-gold)`} />
    </LuxSvg>
  );
}

export function IconLuxToReceive({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M3 14h13v4H3v-4zm13-3.5 3.5 3.5V18h-3.5V10.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="1.8" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <circle cx="17" cy="18" r="1.8" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <path d="M6 14V9.5a1.5 1.5 0 0 1 1.5-1.5H14" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <rect x="7" y="10" width="4" height="2.5" rx="0.5" fill={`url(#${uid}-gold)`} opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxCompleted({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="12" cy="12" r="8" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.3" />
      <path d="M8.5 12.2 10.8 14.5 15.8 9.5" stroke={`url(#${uid}-gold)`} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </LuxSvg>
  );
}

export function IconLuxReturn({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M12 3.5c4.2 0 7.5 3 7.5 6.8 0 2.4-1.3 4.5-3.3 5.7V19H7.8v-3c-2-1.2-3.3-3.3-3.3-5.7 0-3.8 3.3-6.8 7.5-6.8z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M9.2 10.2 12 7.4l2.8 2.8" stroke={`url(#${uid}-gold)`} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.4v5.2" stroke={`url(#${uid}-gold)`} strokeWidth="1.3" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxRate({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M12 2.8 14.4 9l6.8.6-5.1 4.4 1.6 6.6L12 17.8 6.3 20.6 7.9 13.9 2.8 9.6 9.6 9 12 2.8z"
        fill={`url(#${uid}-gold)`}
        stroke="#8B6914"
        strokeWidth="0.6"
      />
      <circle cx="12" cy="11.5" r="1.5" fill="#FFF8E7" opacity="0.85" />
    </LuxSvg>
  );
}

export function IconLuxCart({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path d="M8 8.5V7a4 4 0 0 1 8 0v1.5" stroke={`url(#${uid}-gold)`} strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.5 8.5h11l-1.2 11.5H7.7L6.5 8.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M9.5 12h5" stroke={`url(#${uid}-gold)`} strokeWidth="0.9" opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxTruck({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M2.5 14.5V8.8a1.2 1.2 0 0 1 1.2-1.2h9.3v6.9M12.5 7.6h4.2l3.3 3.4v3.5h-7.5"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="16.5" r="1.7" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <circle cx="17" cy="16.5" r="1.7" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <rect x="14" y="9.5" width="2.8" height="2" rx="0.4" fill={`url(#${uid}-gold)`} opacity="0.5" />
    </LuxSvg>
  );
}

/** Luxury truck driving on a road — for tracking banners */
export function IconLuxTruckRoad({ className, size = 54 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  const h = Math.round(size * 0.72);
  return (
    <svg
      width={size}
      height={h}
      viewBox="0 0 48 34"
      fill="none"
      className={`tt-lux-icon tt-lux-truck-road${className ? ` ${className}` : ''}`}
      aria-hidden
    >
      <LuxGradients uid={uid} />
      <path
        d="M2 27.5h44"
        stroke={`url(#${uid}-gold)`}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M2 27.5h44"
        stroke="#1A1A1A"
        strokeWidth="4.5"
        strokeLinecap="round"
        opacity="0.12"
      />
      <path d="M10 27.5h5M22 27.5h5M34 27.5h5" stroke="#FFF8E7" strokeWidth="1.4" strokeLinecap="round" opacity="0.85" />
      <path
        d="M8 22.5h18.5v5H8v-5zm18.5-2.2h7.2l4.8 4.5v2.7h-12V20.3z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M26.5 18.1h5.8l4.2 4.2" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" />
      <rect x="11" y="21.5" width="4.5" height="2.8" rx="0.5" fill={`url(#${uid}-gold)`} opacity="0.45" />
      <rect x="30.5" y="21.2" width="3.2" height="2.4" rx="0.4" fill={`url(#${uid}-gold)`} opacity="0.55" />
      <circle cx="14" cy="27.5" r="2.4" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="33.5" cy="27.5" r="2.4" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="14" cy="27.5" r="0.9" fill="#C9A227" opacity="0.7" />
      <circle cx="33.5" cy="27.5" r="0.9" fill="#C9A227" opacity="0.7" />
      <path d="M4 16.5c2-1.8 5.2-3 8.8-3.2M36 15c2.2.3 4.2 1.2 5.8 2.5" stroke={`url(#${uid}-gold)`} strokeWidth="0.8" opacity="0.35" strokeLinecap="round" />
    </svg>
  );
}

export function IconLuxLabel({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M6 5.5h12l4.5 6-4.5 6H6V5.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="11.5" r="1.4" fill={`url(#${uid}-gold)`} />
      <path d="M12.5 10.5h5M12.5 12.5h3.5" stroke={`url(#${uid}-gold)`} strokeWidth="0.9" strokeLinecap="round" opacity="0.7" />
    </LuxSvg>
  );
}

export function IconLuxReceipt({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M8 4.5h8l4 4v13.5a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M16 4.5V8.5h4" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M9.5 12h7M9.5 15h7M9.5 18h4.5" stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinecap="round" opacity="0.75" />
    </LuxSvg>
  );
}

export function IconLuxChat({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v6.5a1.5 1.5 0 0 1-1.5 1.5H11l-3.5 3v-3H5a1.5 1.5 0 0 1-1.5-1.5V8a1.5 1.5 0 0 1 1.5-1.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M8.5 10.5h7M8.5 13h4.5" stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinecap="round" opacity="0.7" />
    </LuxSvg>
  );
}

export function IconLuxSearch({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="10.5" cy="10.5" r="5.8" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.3" />
      <path d="M15 15l4.5 4.5" stroke={`url(#${uid}-gold)`} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10.5" cy="10.5" r="2.2" fill={`url(#${uid}-gold)`} opacity="0.22" />
    </LuxSvg>
  );
}

export function IconLuxCamera({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M5 8.5h3.2l1.4-2.2h4.8l1.4 2.2H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-8a1.5 1.5 0 0 1 1.5-1.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="12" cy="13" r="1.3" fill={`url(#${uid}-gold)`} opacity="0.55" />
      <circle cx="17.2" cy="9.8" r="0.9" fill={`url(#${uid}-gold)`} />
    </LuxSvg>
  );
}

export function IconLuxBell({ className, size = 24, variant = 'gold' }: LuxuryIconProps & { variant?: 'gold' | 'red' }) {
  const uid = useId().replace(/:/g, '');
  const isRed = variant === 'red';
  return (
    <LuxSvg size={size} className={className}>
      {isRed ? <LuxRedGradients uid={uid} /> : <LuxGradients uid={uid} />}
      <path
        d="M12 4.2c2.6 0 4.7 2 4.7 4.5v3.8l1.4 2.2H6l1.4-2.2V8.7c0-2.5 2.1-4.5 4.6-4.5z"
        fill={isRed ? `url(#${uid}-redLight)` : `url(#${uid}-champagne)`}
        stroke={isRed ? `url(#${uid}-red)` : `url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M9.8 17.2a2.2 2.2 0 0 0 4.4 0"
        stroke={isRed ? `url(#${uid}-red)` : `url(#${uid}-gold)`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M12 3.2v1.2"
        stroke={isRed ? `url(#${uid}-red)` : `url(#${uid}-gold)`}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {!isRed && <circle cx="16.2" cy="6.8" r="1.1" fill="#ef4444" stroke="#fff" strokeWidth="0.5" />}
      {isRed && <circle cx="16.4" cy="6.6" r="1.35" fill="#fff" stroke={`url(#${uid}-red)`} strokeWidth="0.6" />}
    </LuxSvg>
  );
}

export function IconLuxBellRed(props: LuxuryIconProps) {
  return <IconLuxBell {...props} variant="red" />;
}

export function IconLuxPin({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M12 3.5c-3 0-5.5 2.2-5.5 5 0 3.8 5.5 10.5 5.5 10.5s5.5-6.7 5.5-10.5c0-2.8-2.5-5-5.5-5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="8.5" r="2" fill={`url(#${uid}-gold)`} opacity="0.45" />
      <circle cx="12" cy="8.5" r="0.9" fill="#FFF8E7" />
    </LuxSvg>
  );
}

export function IconLuxAqondStore({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M4 10.5 6.2 5.5l2.3 3 3.5-5 3.5 5 2.3-3L20 10.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M9.5 14h5v5h-5v-5z" fill={`url(#${uid}-gold)`} opacity="0.35" />
      <text x="12" y="13.8" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#8B6914" fontFamily="Georgia, serif">
        A
      </text>
    </LuxSvg>
  );
}

export function IconLuxGear({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="12" cy="12" r="3.2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path
        d="M12 4.2v2.1M12 17.7v2.1M4.2 12h2.1M17.7 12h2.1M6.1 6.1l1.5 1.5M16.4 16.4l1.5 1.5M6.1 17.9l1.5-1.5M16.4 7.6l1.5-1.5"
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </LuxSvg>
  );
}

export function IconLuxShield({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M12 3.5 5.5 6v5.8c0 3.6 2.8 6.9 6.5 8.2 3.7-1.3 6.5-4.6 6.5-8.2V6L12 3.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M9.5 12.2 11.2 14l3.8-4" stroke={`url(#${uid}-gold)`} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </LuxSvg>
  );
}

export function IconLuxFood({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <ellipse cx="12" cy="13.5" rx="9.2" ry="6.8" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <ellipse cx="12" cy="12.8" rx="4.2" ry="2.8" fill="#FFFDF8" stroke={`url(#${uid}-gold)`} strokeWidth="0.9" />
      <path d="M10.5 11.8c.8-.6 1.6-.9 2.5-.9s1.7.3 2.5.9" stroke={`url(#${uid}-gold)`} strokeWidth="0.6" opacity="0.45" />
      <circle cx="7.2" cy="11.5" r="2.1" fill="#fde68a" stroke={`url(#${uid}-gold)`} strokeWidth="0.8" />
      <circle cx="7.2" cy="11.5" r="0.9" fill="#f59e0b" opacity="0.55" />
      <circle cx="16.8" cy="11.5" r="2.1" fill="#bbf7d0" stroke={`url(#${uid}-gold)`} strokeWidth="0.8" />
      <circle cx="16.8" cy="11.5" r="0.9" fill="#22c55e" opacity="0.5" />
      <ellipse cx="12" cy="15.8" rx="6.5" ry="1.2" fill={`url(#${uid}-gold)`} opacity="0.12" />
    </LuxSvg>
  );
}

export function IconLuxVoucher({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M6 6.5h12v11H6V6.5zm0 3.2h12M9 6.5v11"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="12" r="1.2" fill={`url(#${uid}-gold)`} />
    </LuxSvg>
  );
}

export function IconLuxEVoucher({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxRedGradients uid={uid} />
      <path
        d="M6 6.5h12v11H6V6.5zm0 3.2h12M9 6.5v11"
        fill={`url(#${uid}-redLight)`}
        stroke={`url(#${uid}-red)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="12" r="1.2" fill={`url(#${uid}-red)`} />
      <path d="M14.5 10.5h2.5M14.5 13.5h2.5" stroke={`url(#${uid}-red)`} strokeWidth="0.9" strokeLinecap="round" opacity="0.75" />
    </LuxSvg>
  );
}

export function IconLuxPaydayPromo({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGreenGradients uid={uid} />
      <path
        d="M9 6.5h6l1 2.5h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H8l1-2.5z"
        fill={`url(#${uid}-greenLight)`}
        stroke={`url(#${uid}-green)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M12 11v3.5M10.5 12.8h3" stroke={`url(#${uid}-green)`} strokeWidth="1" strokeLinecap="round" />
      <circle cx="16.5" cy="8.2" r="1.5" fill={`url(#${uid}-green)`} opacity="0.85" />
    </LuxSvg>
  );
}

export function IconLuxPromoHalf({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxOrangeGradients uid={uid} />
      <path
        d="M5 12.5 12 5.5l6.5 6.5-6.5 6.5-6.5-6z"
        fill={`url(#${uid}-orangeLight)`}
        stroke={`url(#${uid}-orange)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <text x="12" y="13.2" textAnchor="middle" fontSize="5.5" fontWeight="800" fill={`url(#${uid}-orange)`} fontFamily="system-ui, sans-serif">
        50
      </text>
    </LuxSvg>
  );
}

export function IconLuxPromoBrand({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxPurpleGradients uid={uid} />
      <path
        d="M7 9.5V8a2.5 2.5 0 0 1 5 0v1.5M6 9.5h6l1 10H5L6 9.5z"
        fill={`url(#${uid}-purpleLight)`}
        stroke={`url(#${uid}-purple)`}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M14 10V8.5a2 2 0 0 1 4 0V10l.8 8.5h-5.8L14 10z"
        fill={`url(#${uid}-purpleLight)`}
        stroke={`url(#${uid}-purple)`}
        strokeWidth="1"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </LuxSvg>
  );
}

export function IconLuxPromoFree({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxTealGradients uid={uid} />
      <path
        d="M3 14h13v4H3v-4zm13-3.5 3.5 3.5V18h-3.5V10.5z"
        fill={`url(#${uid}-tealLight)`}
        stroke={`url(#${uid}-teal)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <circle cx="7" cy="18" r="1.8" fill="#115e59" stroke={`url(#${uid}-teal)`} strokeWidth="1" />
      <circle cx="17" cy="18" r="1.8" fill="#115e59" stroke={`url(#${uid}-teal)`} strokeWidth="1" />
      <path d="M6 14V9.5a1.5 1.5 0 0 1 1.5-1.5H14" stroke={`url(#${uid}-teal)`} strokeWidth="1.1" />
      <rect x="7" y="10" width="4" height="2.5" rx="0.5" fill={`url(#${uid}-teal)`} opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxWalletPay({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGreenGradients uid={uid} />
      <rect x="4" y="7" width="16" height="11" rx="2" fill={`url(#${uid}-greenLight)`} stroke={`url(#${uid}-green)`} strokeWidth="1.1" />
      <path d="M4 10.5h16" stroke={`url(#${uid}-green)`} strokeWidth="1" />
      <rect x="14" y="12.5" width="4" height="3" rx="0.8" fill={`url(#${uid}-green)`} opacity="0.65" />
    </LuxSvg>
  );
}

export function IconLuxCoinAmber({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxAmberGradients uid={uid} />
      <circle cx="12" cy="12" r="7" fill={`url(#${uid}-amberLight)`} stroke={`url(#${uid}-amber)`} strokeWidth="1.2" />
      <path d="M12 7.8v8.4M9.2 9.8h5.2a1.8 1.8 0 0 1 0 3.6H9.2" stroke={`url(#${uid}-amber)`} strokeWidth="1.1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxPayLater({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxPurpleGradients uid={uid} />
      <circle cx="12" cy="13" r="7" fill={`url(#${uid}-purpleLight)`} stroke={`url(#${uid}-purple)`} strokeWidth="1.1" />
      <path d="M12 9.5v4l2.5 1.5M10 4.5h4" stroke={`url(#${uid}-purple)`} strokeWidth="1.1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxWallet({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="4" y="7" width="16" height="11" rx="2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M4 10.5h16" stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <rect x="14" y="12.5" width="4" height="3" rx="0.8" fill={`url(#${uid}-gold)`} opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxCoin({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="12" cy="12" r="7" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.2" />
      <path d="M12 7.8v8.4M9.2 9.8h5.2a1.8 1.8 0 0 1 0 3.6H9.2" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxTimer({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="12" cy="13" r="7" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M12 9.5v4l2.5 1.5M10 4.5h4" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxMoneyBag({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path
        d="M9 6.5h6l1 2.5h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H8l1-2.5z"
        fill={`url(#${uid}-champagne)`}
        stroke={`url(#${uid}-gold)`}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M12 11v3.5M10.5 12.8h3" stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxTag({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path d="M5 12.5 12 5.5l6.5 6.5-6.5 6.5-6.5-6z" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="9" cy="9" r="1.2" fill={`url(#${uid}-gold)`} />
    </LuxSvg>
  );
}

export function IconLuxBags({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path d="M7 9.5V8a2.5 2.5 0 0 1 5 0v1.5M6 9.5h6l1 10H5L6 9.5z" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinejoin="round" />
      <path d="M14 10V8.5a2 2 0 0 1 4 0V10l.8 8.5h-5.8L14 10z" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinejoin="round" opacity="0.85" />
    </LuxSvg>
  );
}

export function IconLuxCash({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="5" y="7" width="14" height="9" rx="1.2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="12" cy="11.5" r="2.2" stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <path d="M7 9.5h10M7 13.5h10" stroke={`url(#${uid}-gold)`} strokeWidth="0.7" opacity="0.45" />
    </LuxSvg>
  );
}

export function IconLuxEasyCash({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxRedGradients uid={uid} />
      <rect x="4.5" y="7.5" width="15" height="9.5" rx="1.4" fill={`url(#${uid}-redLight)`} stroke={`url(#${uid}-red)`} strokeWidth="1.15" />
      <circle cx="12" cy="12.2" r="2.4" fill="none" stroke={`url(#${uid}-red)`} strokeWidth="1.1" />
      <path d="M12 10.4v3.6M10.6 12.2h2.8" stroke={`url(#${uid}-red)`} strokeWidth="0.9" strokeLinecap="round" />
      <path d="M7 9.2h10M7 14.8h10" stroke={`url(#${uid}-red)`} strokeWidth="0.65" opacity="0.35" />
    </LuxSvg>
  );
}

export function IconLuxInsurance({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxBlueGradients uid={uid} />
      <path
        d="M12 3.5 5.5 6v5.8c0 3.6 2.8 6.9 6.5 8.2 3.7-1.3 6.5-4.6 6.5-8.2V6L12 3.5z"
        fill={`url(#${uid}-blueLight)`}
        stroke={`url(#${uid}-blue)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M9.5 12.2 11.2 14l3.8-4" stroke={`url(#${uid}-blue)`} strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </LuxSvg>
  );
}

export function IconLuxRider({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <circle cx="7.5" cy="16.5" r="1.8" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <circle cx="16" cy="16.5" r="1.8" fill={`url(#${uid}-obsidian)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <path d="M5 16.5h3l2-5h4l2 3.5h3" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M10 11.5 11.5 7h3l1.5 4.5" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinejoin="round" />
    </LuxSvg>
  );
}

export function IconLuxSparkle({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path d="M12 4l1.2 4.2L17.5 9.5 13.2 11 12 15.2 10.8 11 6.5 9.5l4.3-1.3L12 4z" fill={`url(#${uid}-gold)`} />
      <path d="M18 14l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3z" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="0.6" />
    </LuxSvg>
  );
}

export function IconLuxPhone({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="8" y="4.5" width="8" height="15" rx="2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="12" cy="17" r="0.9" fill={`url(#${uid}-gold)`} />
      <rect x="10" y="6.5" width="4" height="7" rx="0.5" fill={`url(#${uid}-gold)`} opacity="0.25" />
    </LuxSvg>
  );
}

export function IconLuxFilm({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="5" y="7" width="14" height="10" rx="1.5" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M5 9.5h2.5v5H5M16.5 9.5H19v5h-2.5" stroke={`url(#${uid}-gold)`} strokeWidth="1" />
      <path d="M10.5 10.5 13.5 12 10.5 13.5V10.5z" fill={`url(#${uid}-gold)`} opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxCreatorStudio({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={`tt-lux-creator-studio${className ? ` ${className}` : ''}`}>
      <defs>
        <linearGradient id={`${uid}-studio`} x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5d0fe" />
          <stop offset="28%" stopColor="#c084fc" />
          <stop offset="55%" stopColor="#7c3aed" />
          <stop offset="82%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#fde68a" />
        </linearGradient>
        <linearGradient id={`${uid}-studioFill`} x1="12" y1="5" x2="12" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#faf5ff" />
          <stop offset="50%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#c4b5fd" />
        </linearGradient>
        <linearGradient id={`${uid}-gold`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8E7" />
          <stop offset="55%" stopColor="#E8C872" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <rect x="4" y="6.5" width="16" height="11.5" rx="2.2" fill={`url(#${uid}-studioFill)`} stroke={`url(#${uid}-studio)`} strokeWidth="1.2" />
      <path d="M4 9h2.2v6.5H4M17.8 9H20v6.5h-2.2" stroke={`url(#${uid}-studio)`} strokeWidth="1" />
      <circle cx="12" cy="12.2" r="2.8" fill={`url(#${uid}-studio)`} opacity="0.22" />
      <path d="M11 10.4 14.2 12.2 11 14V10.4z" fill={`url(#${uid}-gold)`} />
      <path d="M16.2 7.2 17.4 8.8 19.2 9.1 17.8 10.4 18.1 12.2 16.2 11.4 14.3 12.2 14.6 10.4 13.2 9.1 15 8.8z" fill={`url(#${uid}-gold)`} opacity="0.85" />
      <path d="M6.5 15.8h11" stroke={`url(#${uid}-studio)`} strokeWidth="0.8" strokeLinecap="round" opacity="0.45" />
    </LuxSvg>
  );
}

export function IconLuxHubShop({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxPurpleGradients uid={uid} />
      <defs>
        <linearGradient id={`${uid}-gold`} x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF8E7" />
          <stop offset="55%" stopColor="#E8C872" />
          <stop offset="100%" stopColor="#C9A227" />
        </linearGradient>
      </defs>
      <path
        d="M4 10.5 6.2 5.5l2.3 3 3.5-5 3.5 5 2.3-3L20 10.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5z"
        fill={`url(#${uid}-purpleLight)`}
        stroke={`url(#${uid}-purple)`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path d="M9.5 14h5v5h-5v-5z" fill={`url(#${uid}-purple)`} opacity="0.35" />
      <text x="12" y="13.8" textAnchor="middle" fontSize="5.5" fontWeight="700" fill={`url(#${uid}-gold)`} fontFamily="Georgia, serif">
        A
      </text>
    </LuxSvg>
  );
}

export function IconLuxHubDelivery({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxTealGradients uid={uid} />
      <circle cx="7.5" cy="16.5" r="1.8" fill="#115e59" stroke={`url(#${uid}-teal)`} strokeWidth="1" />
      <circle cx="16" cy="16.5" r="1.8" fill="#115e59" stroke={`url(#${uid}-teal)`} strokeWidth="1" />
      <path d="M5 16.5h3l2-5h4l2 3.5h3" stroke={`url(#${uid}-teal)`} strokeWidth="1.15" strokeLinejoin="round" />
      <path
        d="M10 11.5 11.5 7h3l1.5 4.5"
        fill={`url(#${uid}-tealLight)`}
        stroke={`url(#${uid}-teal)`}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="18.2" cy="7.8" r="1.4" fill={`url(#${uid}-teal)`} opacity="0.85" />
    </LuxSvg>
  );
}

export function IconLuxHubSell({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxOrangeGradients uid={uid} />
      <path
        d="M12 4l1.4 4.5L17.5 9.5 13.2 11 12 15.5 10.8 11 6.5 9.5l4.1-1.2L12 4z"
        fill={`url(#${uid}-orange)`}
      />
      <path
        d="M18.2 13.8l.8 2.5 2.5.8-2.5.8-.8 2.5-.8-2.5-2.5-.8 2.5-.8.8-2.5z"
        fill={`url(#${uid}-orangeLight)`}
        stroke={`url(#${uid}-orange)`}
        strokeWidth="0.55"
      />
      <path
        d="M5.5 14.2l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z"
        fill={`url(#${uid}-orangeLight)`}
        stroke={`url(#${uid}-orange)`}
        strokeWidth="0.45"
        opacity="0.9"
      />
    </LuxSvg>
  );
}

export function IconLuxHubMessenger({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxBlueGradients uid={uid} />
      <rect x="8" y="4.5" width="8" height="15" rx="2" fill={`url(#${uid}-blueLight)`} stroke={`url(#${uid}-blue)`} strokeWidth="1.1" />
      <circle cx="12" cy="17" r="0.9" fill={`url(#${uid}-blue)`} />
      <rect x="9.5" y="7" width="5" height="7" rx="0.8" fill={`url(#${uid}-blue)`} opacity="0.18" />
      <circle cx="10.5" cy="9" r="0.7" fill={`url(#${uid}-blue)`} />
      <circle cx="13.5" cy="9" r="0.7" fill={`url(#${uid}-blue)`} />
      <circle cx="10.5" cy="11.5" r="0.7" fill={`url(#${uid}-blue)`} />
      <circle cx="13.5" cy="11.5" r="0.7" fill={`url(#${uid}-blue)`} />
    </LuxSvg>
  );
}

export type HubCapabilityId = 'shop' | 'delivery' | 'sell' | 'messenger';

const HUB_CAPABILITY_ICON_MAP: Record<HubCapabilityId, (p: LuxuryIconProps) => JSX.Element> = {
  shop: IconLuxHubShop,
  delivery: IconLuxHubDelivery,
  sell: IconLuxHubSell,
  messenger: IconLuxHubMessenger,
};

export function HubCapabilityIcon({
  id,
  size = 28,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = HUB_CAPABILITY_ICON_MAP[id as HubCapabilityId] || IconLuxSparkle;
  return <Icon size={size} className={className} />;
}

export function IconLuxRobot({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="7" y="9" width="10" height="9" rx="2" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <circle cx="10" cy="13" r="1" fill={`url(#${uid}-gold)`} />
      <circle cx="14" cy="13" r="1" fill={`url(#${uid}-gold)`} />
      <path d="M10 16h4" stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinecap="round" />
      <path d="M12 5.5v2.5" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinecap="round" />
    </LuxSvg>
  );
}

export function IconLuxDoc({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <path d="M8 5h7l4 4v12H8V5z" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M15 5v4h4M10 12h7M10 15h5" stroke={`url(#${uid}-gold)`} strokeWidth="0.9" strokeLinecap="round" opacity="0.75" />
    </LuxSvg>
  );
}

export function IconLuxImageFrame({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="5" y="6" width="14" height="12" rx="1.5" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M5 15l3.5-3 2.5 2 3-4L19 15" stroke={`url(#${uid}-gold)`} strokeWidth="1" strokeLinejoin="round" opacity="0.7" />
      <circle cx="9" cy="10" r="1.2" fill={`url(#${uid}-gold)`} opacity="0.55" />
    </LuxSvg>
  );
}

export function IconLuxMail({ className, size = 24 }: LuxuryIconProps) {
  const uid = useId().replace(/:/g, '');
  return (
    <LuxSvg size={size} className={className}>
      <LuxGradients uid={uid} />
      <rect x="4.5" y="7" width="15" height="11" rx="1.5" fill={`url(#${uid}-champagne)`} stroke={`url(#${uid}-gold)`} strokeWidth="1.1" />
      <path d="M4.5 8.5 12 13.5 19.5 8.5" stroke={`url(#${uid}-gold)`} strokeWidth="1.1" strokeLinejoin="round" />
    </LuxSvg>
  );
}

export type LuxuryHubIconId =
  | 'shop'
  | 'delivery'
  | 'sell'
  | 'messenger'
  | 'food'
  | 'voucher'
  | 'payday'
  | 'half'
  | 'brand'
  | 'free'
  | 'wallet'
  | 'coins'
  | 'paylater'
  | 'coupon'
  | 'cash'
  | 'insurance'
  | 'mail'
  | 'video'
  | 'ai_ads'
  | 'open_shop'
  | 'resume'
  | 'product_image'
  | 'settings'
  | 'reviews'
  | 'studio';

const HUB_ICON_MAP: Record<string, (p: LuxuryIconProps) => JSX.Element> = {
  shop: IconLuxAqondStore,
  open_shop: IconLuxAqondStore,
  delivery: IconLuxRider,
  sell: IconLuxSparkle,
  messenger: IconLuxPhone,
  food: IconLuxFood,
  voucher: IconLuxEVoucher,
  coupon: IconLuxEVoucher,
  payday: IconLuxPaydayPromo,
  half: IconLuxPromoHalf,
  brand: IconLuxPromoBrand,
  free: IconLuxPromoFree,
  wallet: IconLuxWalletPay,
  coins: IconLuxCoinAmber,
  paylater: IconLuxPayLater,
  cash: IconLuxEasyCash,
  insurance: IconLuxInsurance,
  mail: IconLuxMail,
  video: IconLuxFilm,
  ai_ads: IconLuxRobot,
  resume: IconLuxDoc,
  product_image: IconLuxImageFrame,
  settings: IconLuxGear,
  reviews: IconLuxRate,
  studio: IconLuxCreatorStudio,
};

export function LuxuryHubIcon({
  id,
  size = 24,
  className,
}: {
  id: string;
  size?: number;
  className?: string;
}) {
  const Icon = HUB_ICON_MAP[id] || IconLuxSparkle;
  return <Icon size={size} className={className} />;
}

const ORDER_ICON_MAP: Record<OrderTab, (p: LuxuryIconProps) => JSX.Element> = {
  all: IconLuxAqondStore,
  topay: IconLuxCart,
  toship: IconLuxToShip,
  toreceive: IconLuxToReceive,
  completed: IconLuxCompleted,
  returnrefund: IconLuxReturn,
  torate: IconLuxRate,
};

export function LuxuryOrderIcon({ tab, size = 28, className }: { tab: OrderTab; size?: number; className?: string }) {
  const Icon = ORDER_ICON_MAP[tab] || IconLuxAqondStore;
  return <Icon size={size} className={className} />;
}
