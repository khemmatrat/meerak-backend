'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ShopOption = {
  id: string;
  name: string;
  food: boolean;
  badge?: number;
};

type Props = {
  shops: ShopOption[];
  value: string;
  onChange: (id: string) => void;
};

export function MerchantShopPicker({ shops, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = shops.find((s) => s.id === value) || shops[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onDoc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onDoc);
      document.body.style.overflow = '';
    };
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div className="tt-merchant-picker-wrap" ref={ref}>
      <label className="tt-merchant-select-label">
        ร้าน
        <button
          type="button"
          className="tt-merchant-picker-btn"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="tt-merchant-picker-btn-icon" aria-hidden>
            {current?.food ? '🍽️' : '🏪'}
          </span>
          <span className="tt-merchant-picker-btn-name">{current?.name || 'เลือกร้าน'}</span>
          {current?.badge ? (
            <span className="tt-merchant-badge" aria-label={`${current.badge} ออเดอร์ใหม่`}>
              {current.badge > 99 ? '99+' : current.badge}
            </span>
          ) : null}
          <span className="tt-merchant-picker-caret" aria-hidden>▾</span>
        </button>
      </label>

      <Link href="/m/merchant/shops" className="tt-merchant-shops-link">
        ⚙️ จัดการร้าน
      </Link>

      {open && typeof document !== 'undefined' && createPortal(
        <div className="tt-merchant-picker-portal" role="presentation">
          <button
            type="button"
            className="tt-merchant-picker-backdrop"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
          />
          <div className="tt-merchant-picker-sheet" role="dialog" aria-labelledby="merchant-shop-picker-title">
            <div className="tt-merchant-picker-sheet-head">
              <h2 id="merchant-shop-picker-title">เลือกร้านค้า</h2>
              <button type="button" className="tt-merchant-picker-close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <ul className="tt-merchant-picker-list" role="listbox">
              {shops.map((s) => {
                const selected = s.id === value;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`tt-merchant-picker-row${selected ? ' active' : ''}`}
                      onClick={() => pick(s.id)}
                    >
                      <span className="tt-merchant-picker-row-icon" aria-hidden>
                        {s.food ? '🍽️' : '🏪'}
                      </span>
                      <span className="tt-merchant-picker-row-body">
                        <span className="tt-merchant-picker-row-name">{s.name}</span>
                        <span className="tt-merchant-picker-row-type">
                          {s.food ? 'ร้านอาหาร' : 'มาร์เก็ตเพลส'}
                        </span>
                      </span>
                      {s.badge ? (
                        <span className="tt-merchant-badge tt-merchant-picker-row-badge">
                          {s.badge > 99 ? '99+' : s.badge}
                        </span>
                      ) : null}
                      {selected && <span className="tt-merchant-picker-check" aria-hidden>✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/m/merchant/shops"
              className="tt-merchant-picker-manage"
              onClick={() => setOpen(false)}
            >
              ⚙️ จัดการร้าน / เสียงแจ้งเตือน
            </Link>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
