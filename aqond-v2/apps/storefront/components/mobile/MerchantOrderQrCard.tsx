'use client';

type Props = {
  orderId: string;
  qrImageUrl: string;
  encoded?: string;
  compact?: boolean;
};

/** Order-specific pickup QR for rider scan at merchant counter. */
export function MerchantOrderQrCard({ orderId, qrImageUrl, encoded, compact }: Props) {
  const copy = () => {
    if (encoded) void navigator.clipboard.writeText(encoded);
  };

  return (
    <div className={`tt-merchant-order-qr${compact ? ' compact' : ''}`}>
      <p className="tt-merchant-order-qr-label">📱 QR รับออเดอร์ #{String(orderId).slice(-8)}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrImageUrl} alt={`QR pickup ${orderId}`} width={compact ? 160 : 200} height={compact ? 160 : 200} />
      {encoded && (
        <button type="button" className="tt-btn-ghost tt-merchant-btn" onClick={copy}>
          📋 คัดลอกโค้ด
        </button>
      )}
    </div>
  );
}
