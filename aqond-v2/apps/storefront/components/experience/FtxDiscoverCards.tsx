'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LuxuryHubIcon, type LuxuryHubIconId } from '@/components/mobile/TtLuxuryIcons';

const DISCOVER: Array<{ href: string; label: string; icon: LuxuryHubIconId; nativePath?: string }> = [
  { href: '/m/sell', label: 'เริ่มขาย', icon: 'sell' },
  { href: '/m/food', label: 'สั่งอาหาร', icon: 'food' },
  {
    href: '/m/rider/signup',
    label: 'เป็นคนขับ',
    icon: 'delivery',
    nativePath: '/rider-os',
  },
  { href: '/m/feed', label: 'ดูวิดีโอ', icon: 'video' },
  { href: '/m/merchant/ad-studio', label: 'โฆษณา AI', icon: 'ai_ads' },
  { href: '/m/merchant/shops', label: 'เปิดร้าน', icon: 'open_shop' },
  { href: '/m/services/create', label: 'สร้างเรซูเม่', icon: 'resume' },
  { href: '/m/studio', label: 'สร้างภาพสินค้า', icon: 'product_image' },
];

function DiscoverCard({
  item,
  embed,
}: {
  item: (typeof DISCOVER)[number];
  embed: boolean;
}) {
  const inner = (
    <>
      <span className="ftx-discover-icon tt-mp-lux-tile-icon" aria-hidden>
        <LuxuryHubIcon id={item.icon} size={22} />
      </span>
      <span>{item.label}</span>
    </>
  );

  if (embed && item.nativePath) {
    return (
      <button
        type="button"
        className="ftx-discover-card"
        onClick={() => {
          try {
            window.parent.postMessage(
              { type: 'aqond:navigate', path: item.nativePath },
              '*',
            );
          } catch {
            window.location.href = item.href;
          }
        }}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link href={item.href} className="ftx-discover-card">
      {inner}
    </Link>
  );
}

export function FtxDiscoverCards() {
  const params = useSearchParams();
  const embed = params.get('embed') === '1';

  return (
    <section className="ftx-discover" data-ftx-tour="discover" aria-label="ค้นพบ AQOND">
      <h2 className="ftx-discover-title">ค้นพบ AQOND</h2>
      <div className="ftx-discover-grid">
        {DISCOVER.map((item) => (
          <DiscoverCard key={item.href} item={item} embed={embed} />
        ))}
      </div>
    </section>
  );
}
