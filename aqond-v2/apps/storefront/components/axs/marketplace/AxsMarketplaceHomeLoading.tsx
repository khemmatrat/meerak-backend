'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsMarketplaceHomeLoading() {
  return (
    <div className="axs-marketplace-loading" aria-busy="true" aria-label="กำลังโหลดสินค้า" data-testid="home-skeleton">
      <div style={{ display: 'flex', gap: 8, padding: '0 16px', overflow: 'hidden' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="block" height={32} style={{ width: 72, borderRadius: 999 }} />
        ))}
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
