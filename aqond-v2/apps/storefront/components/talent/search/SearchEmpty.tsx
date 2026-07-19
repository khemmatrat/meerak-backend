import { EmptyState } from '@aqond/ui';

type Props = {
  query: string;
  loggedIn?: boolean;
  hasFilter?: boolean;
};

export function SearchEmpty({ query, loggedIn = true, hasFilter = false }: Props) {
  if (!loggedIn) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">🔍</span>}
        title="เข้าสู่ระบบเพื่อค้นหา"
        description="ค้นจากข้อมูลที่โหลดจาก API เดิม · ไม่มี search backend"
      />
    );
  }

  if (!query.trim() && !hasFilter) {
    return (
      <EmptyState
        icon={<span className="tt-talent-empty-icon">🔍</span>}
        title="พิมพ์คำค้นหา"
        description="หรือเลือกคำแนะนำ / Quick Filter ด้านบน"
      />
    );
  }

  return (
    <EmptyState
      icon={<span className="tt-talent-empty-icon">🔍</span>}
      title="ไม่พบผลลัพธ์"
      description={query.trim() ? `ไม่มีรายการที่ตรงกับ “${query.trim()}”` : 'ไม่มีรายการในหมวดนี้'}
    />
  );
}
