/**
 * @aqond/components — Sprint 29 Component Registry
 * Aliases over @aqond/ui for Services, Brain, Pay, and future AQOND products.
 */

export { Button as AqondButton } from '@aqond/ui';
export { Card as AqondCard, CardHeader as AqondCardHeader, CardFooter as AqondCardFooter } from '@aqond/ui';
export { Input as AqondInput } from '@aqond/ui';
export { BottomSheet as AqondSheet } from '@aqond/ui';
export { Dialog as AqondDialog } from '@aqond/ui';
export { StatusChip as AqondChip, StatusChip as AqondStatus } from '@aqond/ui';
export { Badge as AqondBadge } from '@aqond/ui';
export { Timeline as AqondTimeline } from '@aqond/ui';
export { Skeleton as AqondSkeleton, SkeletonCard as AqondSkeletonCard } from '@aqond/ui';
export { BottomNav as AqondNavbar } from '@aqond/ui';

export { AqondHeader } from './AqondHeader';
export { AqondSearch } from './AqondSearch';
export { AqondLoading } from './AqondLoading';
export { AqondToast } from './AqondToast';

export type { AqondHeaderProps } from './AqondHeader';
export type { AqondSearchProps } from './AqondSearch';
export type { AqondLoadingProps } from './AqondLoading';
export type { AqondToastProps, AqondToastTone } from './AqondToast';

export type { StatusChipTone as AqondChipTone } from '@aqond/ui';
export type { TimelineItem as AqondTimelineItem } from '@aqond/ui';
export type { BottomNavItem as AqondNavbarItem } from '@aqond/ui';
