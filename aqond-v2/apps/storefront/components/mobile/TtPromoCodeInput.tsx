'use client';

import { useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import type { PromoResult } from '@/lib/promo';
import { validatePromoCode, validatePromoStack } from '@/lib/promo';
import type { PaymentMethodId } from '@/lib/payment';

type Props = {
  subtotalMicro: number;
  deliveryMicro: number;
  context: 'food' | 'marketplace';
  paymentMethod?: PaymentMethodId;
  applied: PromoResult | null;
  onApplied: (promo: PromoResult | null) => void;
  hints?: Array<{ code: string; label: string }>;
  stackable?: boolean;
};

export function TtPromoCodeInput({
  subtotalMicro,
  deliveryMicro,
  context,
  paymentMethod,
  applied,
  onApplied,
  hints = [],
  stackable = true,
}: Props) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const appliedCodes = applied?.codes?.length ? applied.codes : applied?.code ? [applied.code] : [];

  const applyOne = async (raw: string) => {
    const c = raw.trim().toUpperCase();
    if (!c) return;
    setLoading(true);
    setError('');
    try {
      if (stackable && appliedCodes.length > 0 && !appliedCodes.includes(c)) {
        const result = await validatePromoStack({
          codes: [...appliedCodes, c],
          subtotalMicro,
          deliveryMicro,
        });
        if (!result.ok) {
          setError(result.error || 'ใช้โค้ดร่วมกันไม่ได้');
          return;
        }
        setCode('');
        onApplied(result);
        return;
      }
      const result = await validatePromoCode({
        code: c,
        subtotalMicro,
        deliveryMicro,
        context,
        paymentMethod,
      });
      if (!result.ok) {
        setError(result.error || 'ใช้โค้ดไม่ได้');
        onApplied(null);
        return;
      }
      setCode('');
      onApplied({ ...result, codes: [result.code || c] });
    } catch {
      setError('ตรวจโค้ดไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const removeCode = async (drop: string) => {
    const next = appliedCodes.filter((x) => x !== drop);
    if (!next.length) {
      setError('');
      onApplied(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = next.length === 1
        ? await validatePromoCode({ code: next[0], subtotalMicro, deliveryMicro, context, paymentMethod })
        : await validatePromoStack({ codes: next, subtotalMicro, deliveryMicro });
      if (!result.ok) {
        onApplied(null);
        return;
      }
      onApplied({ ...result, codes: next });
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setCode('');
    setError('');
    onApplied(null);
  };

  return (
    <div className="tt-promo-block">
      <h2 className="tt-checkout-h">โค้ดส่วนลด{stackable ? ' (ซ้อนได้)' : ''}</h2>
      {appliedCodes.length > 0 && (
        <div className="tt-promo-hints" style={{ marginBottom: 8 }}>
          {appliedCodes.map((c) => (
            <button key={c} type="button" className="jarvis-chip active" onClick={() => void removeCode(c)}>
              {c} ✕
            </button>
          ))}
        </div>
      )}
      <div className="tt-promo-row">
        <input
          className="tt-input"
          placeholder={stackable && appliedCodes.length ? 'เพิ่มโค้ดอีกใบ' : 'ใส่โค้ด เช่น AQOND50'}
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button
          type="button"
          className="tt-btn-primary tt-promo-apply"
          disabled={loading || !code.trim()}
          onClick={() => void applyOne(code)}
        >
          {loading ? '…' : appliedCodes.length ? 'เพิ่ม' : 'ใช้'}
        </button>
        {appliedCodes.length > 0 && (
          <button type="button" className="tt-btn-ghost" onClick={clear}>
            ลบทั้งหมด
          </button>
        )}
      </div>
      {applied?.ok && (
        <p className="tt-promo-applied">
          ✓ {applied.label || appliedCodes.join(' + ')} — ลด {formatCatalogPrice(applied.discount_micro)}
        </p>
      )}
      {error && <p className="tt-error">{error}</p>}
      {hints.length > 0 && !applied?.ok && (
        <div className="tt-promo-hints">
          {hints.map((h) => (
            <button key={h.code} type="button" className="jarvis-chip" onClick={() => void applyOne(h.code)}>
              {h.code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
