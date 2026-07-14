'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsRiderLoading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="axs-rider-loading" aria-busy aria-label={label}>
      <SkeletonCard />
      <SkeletonCard />
      <Skeleton variant="block" height={100} />
      <p className="tt-hint" style={{ textAlign: 'center', margin: 0 }}>{label}</p>
    </div>
  );
}

export function AxsRiderHomeLoading() {
  return (
    <div className="axs-rider-loading" aria-busy aria-label="กำลังโหลดแดชบอร์ด">
      <Skeleton variant="block" height={88} />
      <div className="axs-rider-loading-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" className="axs-rider-loading-stat" />
        ))}
      </div>
      <div className="axs-rider-loading-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" height={80} />
        ))}
      </div>
    </div>
  );
}
