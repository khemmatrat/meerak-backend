import { EmptyState } from '@aqond/ui';
import type { TalentNotificationFilterId } from '@/lib/talent/talentNotificationPresentation';
import { TALENT_NOTIFICATION_FILTERS } from '@/lib/talent/talentNotificationPresentation';

type Props = {
  filter: TalentNotificationFilterId;
  loggedIn?: boolean;
  error?: string | null;
};

export function NotificationEmpty({ filter, loggedIn = true, error }: Props) {
  if (!loggedIn) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">🔔</span>}
        title="เข้าสู่ระบบเพื่อดูแจ้งเตือน"
        description="อ่านจาก /api/notifications/latest · ไม่มีการบันทึกสถานะอ่าน"
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">⚠️</span>}
        title="โหลดแจ้งเตือนไม่สำเร็จ"
        description={error}
      />
    );
  }

  const filterLabel = TALENT_NOTIFICATION_FILTERS.find((f) => f.id === filter)?.label ?? filter;

  return (
    <EmptyState
      icon={<span className="tt-talent-empty-icon">🔔</span>}
      title="ไม่มีแจ้งเตือน"
      description={
        filter === 'all'
          ? 'ยังไม่มีรายการจาก /api/notifications/latest'
          : `ไม่มีแจ้งเตือนในหมวด “${filterLabel}”`
      }
    />
  );
}
