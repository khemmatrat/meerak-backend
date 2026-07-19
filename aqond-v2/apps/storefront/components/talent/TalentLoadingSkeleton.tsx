import { Skeleton, SkeletonCard } from '@aqond/ui';

type Props = {
  label?: string;
};

/** TOS-1 loading skeleton — no data fetch */
export function TalentLoadingSkeleton({ label = 'กำลังโหลด Talent OS' }: Props) {
  return (
    <div className="tt-talent-loading" aria-busy aria-label={label}>
      <Skeleton variant="text" width="55%" />
      <Skeleton variant="text" width="80%" />
      <div className="tt-talent-loading-cards">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
