'use client';

import { Skeleton, SkeletonCard } from '@aqond/ui';

export function AxsAdminLoading({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="axs-admin-loading" aria-busy aria-label={label}>
      <div className="axs-admin-stat-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="block" height={72} />
        ))}
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <p className="tt-hint" style={{ textAlign: 'center', margin: 0 }}>{label}</p>
    </div>
  );
}
