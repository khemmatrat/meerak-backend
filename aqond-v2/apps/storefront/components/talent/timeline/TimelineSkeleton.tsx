import { Skeleton, SkeletonCard } from '@aqond/ui';

type Props = {
  label?: string;
};

export function TimelineSkeleton({ label = 'กำลังโหลด Timeline' }: Props) {
  return (
    <div className="tt-talent-timeline-skeleton" aria-busy aria-label={label}>
      <div className="tt-talent-timeline-filter-skeleton">
        <Skeleton variant="text" width="72px" />
        <Skeleton variant="text" width="88px" />
        <Skeleton variant="text" width="80px" />
      </div>
      <div className="tt-talent-timeline-list-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
