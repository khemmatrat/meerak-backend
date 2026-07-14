'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsMerchantLoading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="axs-merchant-loading" aria-busy aria-label={label}>
      <SkeletonCard />
      <SkeletonCard />
      <p className="tt-hint" style={{ textAlign: 'center', margin: 0 }}>{label}</p>
    </div>
  );
}

export function AxsMerchantWalletLoading() {
  return (
    <div className="axs-merchant-loading" aria-busy aria-label="กำลังโหลดกระเป๋า">
      <Skeleton variant="block" height={120} />
      <div className="axs-merchant-loading-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" className="axs-merchant-loading-stat" />
        ))}
      </div>
    </div>
  );
}

export function AxsMerchantSalesLoading() {
  return (
    <div className="axs-merchant-loading" aria-busy aria-label="กำลังคำนวณยอดขาย">
      <div className="axs-merchant-loading-grid">
        <Skeleton variant="block" className="axs-merchant-loading-stat" />
        <Skeleton variant="block" className="axs-merchant-loading-stat" />
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
