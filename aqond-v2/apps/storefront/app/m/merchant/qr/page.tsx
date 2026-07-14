'use client';

import { useMemo } from 'react';
import { shopDeepLink, shopQrImageUrl } from '@/lib/shopLinks';
import { useMerchant } from '@/components/mobile/MerchantShell';

export default function MerchantQrPage() {
  const { merchantId, merchantName, isFoodMerchant } = useMerchant();

  const link = useMemo(
    () => shopDeepLink(merchantId, isFoodMerchant),
    [merchantId, isFoodMerchant],
  );
  const qrUrl = useMemo(() => shopQrImageUrl(link), [link]);

  const copy = () => {
    void navigator.clipboard.writeText(link);
  };

  return (
    <div className="tt-merchant-qr-page">
      <h1 className="tt-merchant-page-title">📱 QR ร้าน</h1>
      <p className="tt-merchant-sub">{merchantName}</p>
      <p className="tt-hint">
        {isFoodMerchant
          ? 'ลูกค้าสแกนแล้วเข้าเมนูร้านตรงๆ — เหมาะ food court / ห้าง'
          : 'ลูกค้าสแกนแล้วเข้าหน้าร้าน marketplace'}
      </p>

      <div className="tt-qr-card">
        <img src={qrUrl} alt={`QR ${merchantName}`} className="tt-qr-image" width={240} height={240} />
        <p className="tt-qr-link">{link}</p>
        <button type="button" className="tt-btn-primary" onClick={copy}>
          📋 คัดลอกลิงก์
        </button>
      </div>
    </div>
  );
}
