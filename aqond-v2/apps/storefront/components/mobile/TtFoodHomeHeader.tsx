'use client';

import Link from 'next/link';
import { Input } from '@aqond/ui';
import { IconLuxCart, IconLuxSearch } from '@/components/mobile/TtLuxuryIcons';
type Props = {
  locationLabel: string;
  cartCount?: number;
  mode: 'delivery' | 'pickup';
  onModeChange: (mode: 'delivery' | 'pickup') => void;
};

export function TtFoodHomeHeader({ locationLabel, cartCount, mode, onModeChange }: Props) {
  return (
    <header className="tt-food-home-header">
      <div className="tt-food-home-top">
        <Link href="/m/home" className="tt-back" aria-label="กลับ">‹</Link>
        <button type="button" className="tt-food-home-loc-btn">
          <span className="tt-food-home-loc-icon" aria-hidden>🛵</span>
          <span className="tt-food-home-loc-text">
            <small>จัดส่งที่</small>
            <strong>{locationLabel}</strong>
          </span>
          <span className="tt-food-home-chevron" aria-hidden>▾</span>
        </button>
        <div className="tt-food-home-actions">
          <Link href="/m/search?tab=food" className="tt-icon-btn" aria-label="ค้นหา">
            <IconLuxSearch size={20} />
          </Link>
          <Link href="/m/food/cart" className="tt-icon-btn" aria-label="รถเข็น">
            <IconLuxCart size={20} />
            {cartCount ? <em>{cartCount}</em> : null}
          </Link>
        </div>
      </div>

      <div className="tt-food-service-toggle">
        <button
          type="button"
          className={mode === 'delivery' ? 'is-on' : ''}
          onClick={() => onModeChange('delivery')}
        >
          🛵 จัดส่ง
        </button>
        <button
          type="button"
          className={mode === 'pickup' ? 'is-on' : ''}
          onClick={() => onModeChange('pickup')}
        >
          🏪 รับที่ร้าน
        </button>
      </div>

      <form
        className="tt-food-home-search"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const query = String(fd.get('q') || '').trim();
          window.location.href = `/m/search?tab=food&q=${encodeURIComponent(query)}`;
        }}
      >
        <span className="tt-search-bar-icon" aria-hidden>
          <IconLuxSearch size={18} />
        </span>
        <Input
          name="q"
          placeholder="ค้นหาร้านหรือเมนูอาหาร"
          aria-label="ค้นหาร้านหรือเมนูอาหาร"
          style={{ border: 'none', background: 'transparent', padding: 0, boxShadow: 'none' }}
        />
      </form>
    </header>
  );
}
