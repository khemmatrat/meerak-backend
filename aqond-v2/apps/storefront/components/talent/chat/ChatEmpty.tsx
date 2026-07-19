import { EmptyState } from '@aqond/ui';

type Props = {
  loggedIn?: boolean;
  error?: string | null;
  hasQuery?: boolean;
};

export function ChatEmpty({ loggedIn = true, error, hasQuery }: Props) {
  if (!loggedIn) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">💬</span>}
        title="เข้าสู่ระบบเพื่อดูแชท"
        description="เปิดแชทผ่าน deep link ไป SSOT เดิม · ไม่รวม chat backend"
      />
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">⚠️</span>}
        title="โหลดแชทไม่สำเร็จ"
        description={error}
      />
    );
  }

  return (
    <EmptyState
      icon={<span className="tt-talent-empty-icon">💬</span>}
      title="ไม่มีบทสนทนา"
      description={
        hasQuery
          ? 'ไม่พบแชทที่ตรงกับคำค้นหา'
          : 'เลือกหมวดด้านบนหรือเปิดจาก Match · Booking · ร้านค้า'
      }
    />
  );
}
