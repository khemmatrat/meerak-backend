import { paymentMethodLabel, type PaymentMethodId } from '@/lib/payment';

type Props = {
  mode: 'food' | 'parcel';
  /** filled address preview */
  recipient?: string;
  address?: string;
  phone?: string;
  postalCode?: string;
  note?: string;
  /** วิธีรับสินค้า/อาหาร */
  handoffLabel?: string;
  /** food */
  deliveryModeLabel?: string;
  etaLabel?: string;
  riderHint?: string;
  shopCount?: number;
  /** parcel */
  carrierName?: string;
  carrierFeeLabel?: string;
  payMethod?: PaymentMethodId;
};

export function TtCheckoutDeliveryCard({
  mode,
  recipient,
  address,
  phone,
  postalCode,
  note,
  handoffLabel,
  deliveryModeLabel,
  etaLabel,
  riderHint,
  shopCount,
  carrierName,
  carrierFeeLabel,
  payMethod,
}: Props) {
  const hasAddr = !!(recipient?.trim() || address?.trim());

  return (
    <div className="tt-delivery-card">
      <div className="tt-delivery-card-head">
        <span className="tt-delivery-card-icon">{mode === 'food' ? '🛵' : '📦'}</span>
        <div>
          <strong>{mode === 'food' ? 'การจัดส่งอาหาร' : 'การจัดส่งพัสดุ'}</strong>
          {deliveryModeLabel && <p className="tt-delivery-card-mode">{deliveryModeLabel}</p>}
          {carrierName && (
            <p className="tt-delivery-card-mode">
              {carrierName}
              {carrierFeeLabel && ` · ${carrierFeeLabel}`}
            </p>
          )}
        </div>
      </div>

      {hasAddr ? (
        <div className="tt-delivery-card-addr">
          <p className="tt-delivery-card-label">ส่งมอบให้</p>
          <p className="tt-delivery-card-name">{recipient || '—'}</p>
          <p className="tt-delivery-card-line">{address}</p>
          <p className="tt-delivery-card-line">
            {phone}
            {postalCode ? ` · รหัส ${postalCode}` : ''}
          </p>
          {handoffLabel && (
            <p className="tt-delivery-card-handoff">
              <span className="tt-delivery-card-label">วิธีรับ</span>
              {handoffLabel}
            </p>
          )}
          {note && !handoffLabel && <p className="tt-delivery-card-note">หมายเหตุ: {note}</p>}
        </div>
      ) : (
        <p className="tt-delivery-card-hint">กรอกที่อยู่ด้านบนเพื่อดูสรุปการส่งมอบ</p>
      )}

      <div className="tt-delivery-card-footer">
        {etaLabel && <span>⏱ ถึงประมาณ {etaLabel}</span>}
        {shopCount != null && shopCount > 1 && <span>· {shopCount} ร้าน</span>}
        {riderHint && <p className="tt-delivery-card-rider">{riderHint}</p>}
        {payMethod && payMethod !== 'cod' && (
          <p className="tt-delivery-card-pay">ชำระ: {paymentMethodLabel(payMethod)}</p>
        )}
      </div>
    </div>
  );
}
