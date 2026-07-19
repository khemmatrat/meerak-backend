import { Skeleton, SkeletonCard } from '@aqond/ui';

type Props = {
  label?: string;
};

/** TOS-5 notification list skeleton — no data fetch */
export function NotificationSkeleton({ label = 'กำลังโหลดแจ้งเตือน' }: Props) {
  return (
    <div className="tt-talent-notif-skeleton" aria-busy aria-label={label}>
      <div className="tt-talent-notif-filter-skeleton">
        <Skeleton variant="text" width="72px" />
        <Skeleton variant="text" width="88px" />
        <Skeleton variant="text" width="64px" />
        <Skeleton variant="text" width="72px" />
      </div>
      <Skeleton variant="text" width="40%" />
      <div className="tt-talent-notif-list-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
