'use client';

export { AqondLoading as AxsServicesLoading } from '@aqond/components';

import { Skeleton, SkeletonCard } from '@aqond/ui';

/** Hub skeleton — Sprint 29 uses registry loading primitives */
export function AxsServicesHubLoading() {
  return (
    <div className="aqond-loading aqond-loading--page" aria-busy aria-label="กำลังโหลดศูนย์บริการ">
      <Skeleton variant="text" width="70%" />
      <Skeleton variant="text" width="90%" />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
