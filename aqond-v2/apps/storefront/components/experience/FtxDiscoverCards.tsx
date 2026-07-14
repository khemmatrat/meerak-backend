'use client';

import Link from 'next/link';
import { LuxuryHubIcon, type LuxuryHubIconId } from '@/components/mobile/TtLuxuryIcons';

const DISCOVER: Array<{ href: string; label: string; icon: LuxuryHubIconId }> = [
  { href: '/m/sell', label: 'เริ่มขาย', icon: 'sell' },
  { href: '/m/food', label: 'สั่งอาหาร', icon: 'food' },
  { href: '/m/rider/signup', label: 'เป็นคนขับ', icon: 'delivery' },
  { href: '/m/feed', label: 'ดูวิดีโอ', icon: 'video' },
  { href: '/m/merchant/ad-studio', label: 'โฆษณา AI', icon: 'ai_ads' },
  { href: '/m/merchant/shops', label: 'เปิดร้าน', icon: 'open_shop' },
  { href: '/m/services/create', label: 'สร้างเรซูเม่', icon: 'resume' },
  { href: '/m/studio', label: 'สร้างภาพสินค้า', icon: 'product_image' },
];

export function FtxDiscoverCards() {
  return (
    <section className="ftx-discover" data-ftx-tour="discover" aria-label="ค้นพบ AQOND">
      <h2 className="ftx-discover-title">ค้นพบ AQOND</h2>
      <div className="ftx-discover-grid">
        {DISCOVER.map((item) => (
          <Link key={item.href} href={item.href} className="ftx-discover-card">
            <span className="ftx-discover-icon tt-mp-lux-tile-icon" aria-hidden>
              <LuxuryHubIcon id={item.icon} size={22} />
            </span>
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
