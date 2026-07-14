'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsFoodCartLoading() {
  return (
    <div className="axs-food-loading" aria-busy aria-label="กำลังโหลดรถเข็น">
      <SkeletonCard />
      <SkeletonCard />
      <Skeleton variant="block" height={120} />
    </div>
  );
}
