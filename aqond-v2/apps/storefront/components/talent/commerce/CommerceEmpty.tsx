import { EmptyState } from '@aqond/ui';

type Props = {
  loggedIn: boolean;
  error?: string | null;
};

export function CommerceEmpty({ loggedIn, error }: Props) {
  if (!loggedIn) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">💰</span>}
        title="เข้าสู่ระบบเพื่อดู Commerce Intelligence"
        description="รวม Bookings · Income · Match · Board · Wallet · Reviews จาก API เดิม"
      />
    );
  }

  return (
    <EmptyState
      icon={<span className="tt-talent-empty-icon">📊</span>}
      title="ยังไม่มีข้อมูลเชิงพาณิชย์"
      description={
        error
          ? `โหลดไม่สำเร็จ: ${error} — ลองรีเฟรชหรือตรวจ backend URL`
          : 'เริ่มจาก Match · Board · Booking แล้วข้อมูลจะแสดงที่นี่'
      }
    />
  );
}
