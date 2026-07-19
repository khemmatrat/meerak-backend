import { Skeleton, SkeletonCard } from '@aqond/ui';

export function ChatSkeleton() {
  return (
    <div className="tt-talent-chat-skeleton" aria-busy aria-label="กำลังโหลดแชท">
      <Skeleton variant="text" width="100%" />
      <div className="tt-talent-chat-hub-skeleton">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <Skeleton variant="text" width="40%" />
      <div className="tt-talent-chat-list-skeleton">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
