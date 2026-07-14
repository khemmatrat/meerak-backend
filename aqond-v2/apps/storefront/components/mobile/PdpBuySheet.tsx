'use client';

import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import type { PdpVariant } from '@/lib/pdpMeta';

const SWATCH = ['#1f2937', '#ec4899', '#f8fafc', '#a855f7', '#059669', '#f59e0b'];

type Props = {
  open: boolean;
  mode: 'buy' | 'cart';
  onClose: () => void;
  title: string;
  imageUrl?: string;
  variants: PdpVariant[];
  variantIdx: number;
  onVariantIdx: (idx: number) => void;
  qty: number;
  onQty: (qty: number) => void;
  priceMicro: number;
  listPriceMicro?: number;
  shippingLabel: string;
  shippingFree: boolean;
  onConfirm: () => void;
  busy?: boolean;
  error?: string;
};

function variantStock(id: string) {
  let n = 0;
  for (const c of id) n += c.charCodeAt(0);
  return 48 + (n % 380);
}

function isVariantDisabled(_id: string, _index: number, _total: number) {
  return false;
}

export function PdpBuySheet({
  open,
  mode,
  onClose,
  title,
  imageUrl,
  variants,
  variantIdx,
  onVariantIdx,
  qty,
  onQty,
  priceMicro,
  listPriceMicro,
  shippingLabel,
  shippingFree,
  onConfirm,
  busy,
  error,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  const selected = variants[variantIdx] || variants[0];
  const stock = variantStock(selected?.id || title);
  const variantLabel = selected?.label || 'ตัวเลือก';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const shipEta =
    shippingLabel ||
    tomorrow.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });

  const sheet = (
    <div className="tt-modal-backdrop tt-pdp-buy-backdrop" onClick={onClose} role="presentation">
      <div
        className="tt-modal-sheet tt-modal-sheet-expanded tt-pdp-buy-sheet"
        data-testid="pdp-buy-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="tt-pdp-buy-close" onClick={onClose} aria-label="ปิด">
          ✕
        </button>

        <div className="tt-pdp-buy-head">
          <div className="tt-pdp-buy-thumb">
            {imageUrl ? <img src={imageUrl} alt="" /> : <span>📦</span>}
          </div>
          <div className="tt-pdp-buy-price-block">
            <div className="tt-pdp-buy-price-row">
              <strong className="tt-pdp-buy-price">{formatCatalogPrice(priceMicro)}</strong>
              {listPriceMicro && listPriceMicro > priceMicro ? (
                <span className="tt-pdp-buy-list">{formatCatalogPrice(listPriceMicro)}</span>
              ) : null}
            </div>
            <p className="tt-pdp-buy-stock">คลัง: {stock}</p>
          </div>
        </div>

        <p className="tt-pdp-buy-ship">
          <span>🚚</span> {shipEta}
          {shippingFree ? ' · ส่งฟรี' : ''}
        </p>

        <section className="tt-pdp-buy-section">
          <p className="tt-pdp-buy-section-label">{variantLabel}</p>
          <div className="tt-pdp-buy-variant-grid">
            {variants.map((v, i) => {
              const disabled = isVariantDisabled(v.id, i, variants.length);
              const active = i === variantIdx;
              return (
                <button
                  key={`${v.id}-${i}`}
                  type="button"
                  disabled={disabled}
                  className={`tt-pdp-buy-variant${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                  onClick={() => onVariantIdx(i)}
                >
                  <span className="tt-pdp-buy-variant-thumb">
                    {v.image_url ? (
                      <img src={v.image_url} alt="" />
                    ) : (
                      <span style={{ background: SWATCH[i % SWATCH.length] }} />
                    )}
                  </span>
                  <span className="tt-pdp-buy-variant-text">{v.value}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="tt-pdp-buy-qty-row">
          <span>จำนวน</span>
          <div className="tt-pdp-buy-stepper">
            <button
              type="button"
              aria-label="ลดจำนวน"
              disabled={qty <= 1}
              onClick={() => onQty(Math.max(1, qty - 1))}
            >
              −
            </button>
            <span>{qty}</span>
            <button
              type="button"
              aria-label="เพิ่มจำนวน"
              disabled={qty >= stock}
              onClick={() => onQty(Math.min(stock, qty + 1))}
            >
              +
            </button>
          </div>
        </section>

        {error && <p className="tt-error tt-pdp-buy-error">{error}</p>}

        <button
          type="button"
          className={`tt-pdp-buy-confirm${mode === 'cart' ? ' tt-pdp-buy-confirm--cart' : ''}`}
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? 'กำลังดำเนินการ…' : mode === 'buy' ? 'ซื้อเลย' : 'ใส่รถเข็น'}
        </button>
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
