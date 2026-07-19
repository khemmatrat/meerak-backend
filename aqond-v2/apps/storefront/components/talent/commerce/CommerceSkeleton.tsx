import { Skeleton, SkeletonCard } from '@aqond/ui';

export function CommerceSkeleton() {
  return (
    <div className="tt-talent-commerce-skeleton" aria-busy aria-label="กำลังโหลด Commerce Intelligence">
      <div className="tt-talent-commerce-filter-skeleton">
        <Skeleton variant="text" width="72px" />
        <Skeleton variant="text" width="72px" />
      </div>
      <div className="tt-talent-commerce-metrics-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonCard />
      <SkeletonCard />
      <div className="tt-talent-commerce-list-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
