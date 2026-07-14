'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsFoodHomeLoading() {
  return (
    <div className="axs-food-loading" aria-busy aria-label="กำลังโหลดร้านอาหาร">
      <Skeleton variant="block" className="axs-food-loading-banner" />
      <div className="axs-food-loading-cats">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="block" className="axs-food-loading-cat" />
        ))}
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
