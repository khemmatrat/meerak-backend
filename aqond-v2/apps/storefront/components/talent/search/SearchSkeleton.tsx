import { Skeleton, SkeletonCard } from '@aqond/ui';

type Props = {
  label?: string;
};

export function SearchSkeleton({ label = 'กำลังโหลด Universal Search' }: Props) {
  return (
    <div className="tt-talent-search-skeleton" aria-busy aria-label={label}>
      <Skeleton variant="text" width="100%" />
      <div className="tt-talent-search-filter-skeleton">
        <Skeleton variant="text" width="64px" />
        <Skeleton variant="text" width="72px" />
        <Skeleton variant="text" width="80px" />
      </div>
      <Skeleton variant="text" width="35%" />
      <div className="tt-talent-search-list-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
