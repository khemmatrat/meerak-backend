'use client';

import Link from 'next/link';
import { formatMicro } from '@/lib/format';
import type { MeerakUser } from '@/lib/meerakAuth';
import { TALENT_HUB_TILE } from '@/lib/talent/talentDiscoverability';
import { IconLuxBellRed, IconLuxCreatorStudio, IconLuxPin, LuxuryHubIcon } from '@/components/mobile/TtLuxuryIcons';

type WalletProps = {
  balanceMicro: number;
  coins: number;
  couponCount: number;
  payLaterEnabled?: boolean;
};

export function MpEmailBanner({ user }: { user: MeerakUser | null }) {
  if (user?.email) return null;
  return (
    <Link href="/settings" className="tt-mp-email-banner">
      <span className="tt-mp-email-icon" aria-hidden>
        <LuxuryHubIcon id="mail" size={20} />
      </span>
      <div className="tt-mp-email-copy">
        <strong>ตั้งค่าอีเมลเพื่อความปลอดภัยและรับข่าวสาร</strong>
        <span>ตั้งค่าตอนนี้ ›</span>
      </div>
    </Link>
  );
}

export function MpServiceRows() {
  return (
    <div className="tt-mp-service-rows">
      <Link href={TALENT_HUB_TILE.href} className="tt-mp-service-row">
        <span className="tt-mp-service-icon tt-mp-lux-tile-icon tt-mp-service-icon--talent">
          {TALENT_HUB_TILE.icon}
        </span>
        <div>
          <strong>{TALENT_HUB_TILE.title}</strong>
          <p>{TALENT_HUB_TILE.description}</p>
        </div>
        <span className="tt-mp-service-arrow">›</span>
      </Link>
      <Link href="/m/food" className="tt-mp-service-row">
        <span className="tt-mp-service-icon tt-mp-lux-tile-icon tt-mp-service-icon--food">
          <LuxuryHubIcon id="food" size={22} />
        </span>
        <div>
          <strong>AqondFood</strong>
          <p>สั่งอาหาร · ติดตามไรเดอร์</p>
        </div>
        <span className="tt-mp-service-arrow">›</span>
      </Link>
      <Link href="/m/home?cat=voucher" className="tt-mp-service-row">
        <span className="tt-mp-service-icon tt-mp-lux-tile-icon tt-mp-service-icon--voucher">
          <LuxuryHubIcon id="voucher" size={22} />
        </span>
        <div>
          <strong>E-Service / E-Voucher</strong>
          <p>บัตรกำนัล · บริการดิจิทัล</p>
        </div>
        <span className="tt-mp-service-arrow">›</span>
      </Link>
    </div>
  );
}

const PROMO_TILES = [
  { href: '/m/home?promo=payday', icon: 'payday', label: 'เงินออก ช้อปเลย', tone: 'payday' },
  { href: '/m/home?promo=half', icon: 'half', label: 'โค้ดลด 50%', tone: 'half' },
  { href: '/m/home?promo=brand', icon: 'brand', label: 'แบรนด์ดัง', tone: 'brand' },
  { href: '/m/home?promo=free', icon: 'free', label: 'ส่งฟรี', tone: 'free' },
] as const;

export function MpPromoBanner() {
  return (
    <section className="tt-mp-promo" aria-label="โปรโมชัน">
      <div className="tt-mp-promo-head">
        <strong>6.25 เงินออก ช้อปเลย</strong>
        <Link href="/m/home">ดูทั้งหมด ›</Link>
      </div>
      <div className="tt-mp-promo-grid">
        {PROMO_TILES.map((tile) => (
          <Link key={tile.label} href={tile.href} className="tt-mp-promo-tile">
            <span className={`tt-mp-promo-icon tt-mp-lux-tile-icon tt-mp-promo-icon--${tile.tone}`}>
              <LuxuryHubIcon id={tile.icon} size={22} />
            </span>
            <span className="tt-mp-promo-label">{tile.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const WALLET_TILES = [
  { href: '/m/account/wallet', icon: 'wallet', name: 'AqondPay', valueKey: 'balance' as const, tone: 'wallet' },
  { href: '/m/account/wallet#coins', icon: 'coins', name: 'เหรียญ', valueKey: 'coins' as const, tone: 'coins' },
  { href: '/m/account/wallet#paylater', icon: 'paylater', name: 'PayLater', valueKey: 'paylater' as const, tone: 'paylater' },
  { href: '/m/account/wallet#coupons', icon: 'coupon', name: 'โค้ดส่วนลด', valueKey: 'coupon' as const, tone: 'coupon' },
] as const;

export function MpWalletHub({ balanceMicro, coins, couponCount, payLaterEnabled }: WalletProps) {
  const couponLabel = couponCount > 0 ? `${couponCount}+ โค้ด` : 'ดูโค้ด';
  const values: Record<string, string> = {
    balance: formatMicro(balanceMicro),
    coins: coins > 0 ? String(coins) : 'เช็คอิน',
    paylater: payLaterEnabled ? 'เปิดแล้ว' : 'เปิดใช้งาน',
    coupon: couponLabel,
  };

  return (
    <section className="tt-mp-wallet-hub" aria-labelledby="mp-wallet-title">
      <div className="tt-mp-wallet-head">
        <strong id="mp-wallet-title">กระเป๋าของฉัน</strong>
        <Link href="/m/account/wallet">ดูทั้งหมด ›</Link>
      </div>
      <div className="tt-mp-wallet-grid">
        {WALLET_TILES.map((tile) => (
          <Link key={tile.name} href={tile.href} className="tt-mp-wallet-item">
            <span className={`tt-mp-wallet-icon tt-mp-lux-tile-icon tt-mp-wallet-icon--${tile.tone}`}>
              <LuxuryHubIcon id={tile.icon} size={22} />
            </span>
            <span className="tt-mp-wallet-name">{tile.name}</span>
            <strong className="tt-mp-wallet-value">{values[tile.valueKey]}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function MpFinanceSection() {
  return (
    <section className="tt-mp-finance" aria-labelledby="mp-finance-title">
      <strong id="mp-finance-title" className="tt-mp-section-label">
        บริการทางการเงิน
      </strong>
      <div className="tt-mp-finance-grid">
        <Link href="/m/sell" className="tt-mp-finance-item tt-mp-finance-item--cash">
          <span className="tt-mp-lux-tile-icon tt-mp-lux-tile-icon--cash">
            <LuxuryHubIcon id="cash" size={24} />
          </span>
          <div>
            <strong>EasyCash</strong>
            <p>สินเชื่อรายได้ร้านค้า</p>
          </div>
        </Link>
        <Link href="/m/home?cat=insurance" className="tt-mp-finance-item tt-mp-finance-item--insurance">
          <span className="tt-mp-lux-tile-icon tt-mp-lux-tile-icon--insurance">
            <LuxuryHubIcon id="insurance" size={24} />
          </span>
          <div>
            <strong>ประกันภัย</strong>
            <p>คุ้มครองการซื้อออนไลน์</p>
          </div>
        </Link>
      </div>
    </section>
  );
}

export function MpAccountMenu() {
  const items = [
    { href: TALENT_HUB_TILE.href, icon: 'talent' as const, label: TALENT_HUB_TILE.title, useTalent: true },
    { href: '/m/account/addresses', icon: 'pin' as const, label: 'ที่อยู่จัดส่ง', usePin: true },
    { href: '/m/account/notifications', icon: 'bell' as const, label: 'การแจ้งเตือน', useBell: true },
    { href: '/m/account/reviews', icon: 'reviews', label: 'รีวิวของฉัน' },
    { href: '/m/studio', icon: 'studio', label: 'Creator Studio' },
    { href: '/m/account/settings', icon: 'settings', label: 'ตั้งค่า & ความเป็นส่วนตัว' },
  ] as const;

  return (
    <div className="tt-mp-account-menu">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`tt-mp-account-menu-item${item.icon === 'studio' ? ' tt-mp-menu-item-studio' : ''}`}
        >
          <span className="tt-mp-menu-icon" aria-hidden>
            {'useTalent' in item && item.useTalent ? (
              <span style={{ fontSize: 20 }}>{TALENT_HUB_TILE.icon}</span>
            ) : 'usePin' in item && item.usePin ? (
              <IconLuxPin size={20} />
            ) : 'useBell' in item && item.useBell ? (
              <IconLuxBellRed size={20} />
            ) : item.icon === 'studio' ? (
              <IconLuxCreatorStudio size={24} />
            ) : (
              <LuxuryHubIcon id={item.icon} size={20} />
            )}
          </span>
          <strong>{item.label}</strong>
          {item.icon === 'studio' && <em className="tt-mp-menu-studio-badge">PRO</em>}
          <span>›</span>
        </Link>
      ))}
    </div>
  );
}
