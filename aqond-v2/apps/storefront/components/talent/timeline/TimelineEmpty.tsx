import { EmptyState } from '@aqond/ui';
import { TALENT_TIMELINE_PERIODS } from '@/lib/talent/talentTimelineTypes';
import type { TalentTimelinePeriodId } from '@/lib/talent/talentTimelineTypes';

type Props = {
  period: TalentTimelinePeriodId;
  loggedIn?: boolean;
  error?: string | null;
};

export function TimelineEmpty({ period, loggedIn = true, error }: Props) {
  if (!loggedIn) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">🕘</span>}
        title="เข้าสู่ระบบเพื่อดู Timeline"
        description="รวมกิจกรรมจาก Booking · Match · Board · Wallet · แจ้งเตือน · ไม่มี event store"
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">⚠️</span>}
        title="โหลด Timeline ไม่สำเร็จ"
        description={error}
      />
    );
  }

  const periodLabel = TALENT_TIMELINE_PERIODS.find((p) => p.id === period)?.label ?? period;

  return (
    <EmptyState
      icon={<span className="tt-talent-empty-icon">🕘</span>}
      title="ไม่มีกิจกรรม"
      description={`ไม่มีรายการในช่วง “${periodLabel}” จากข้อมูล API เดิม`}
    />
  );
}
