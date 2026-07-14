'use client';

const ACTOR_LABEL: Record<string, string> = {
  customer: '👤 ลูกค้า',
  merchant: '🏪 ร้าน',
  admin: '🛡️ Admin',
  system: '⚙️ ระบบ',
};

const ACTION_LABEL: Record<string, string> = {
  filed: 'แจ้งปัญหา',
  escrow_hold: 'พักเงินกับแพลตฟอร์ม',
  respond: 'ร้านตอบกลับ',
  accept_platform: 'ร้านยอมตามเกณฑ์',
  propose_mutual: 'ร้านเสนอยอมความ',
  review_clip: 'ตรวจคลิป/หลักฐาน',
  admin_refund: 'Admin สั่งคืนเงิน',
  admin_charge: 'Admin สั่งเรียกเก็บ',
  admin_release_hold: 'Admin ปลดเงินพัก',
};

type Event = { at: string; actor: string; action: string; note?: string };

export function TtDisputeTimeline({ events }: { events: Event[] }) {
  if (!events?.length) return <p className="tt-hint">ยังไม่มีประวัติ</p>;

  return (
    <ol className="tt-dispute-timeline">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="tt-dispute-timeline-item">
          <span className="tt-dispute-timeline-dot" aria-hidden />
          <div>
            <strong>{ACTOR_LABEL[e.actor] || e.actor} · {ACTION_LABEL[e.action] || e.action}</strong>
            <span className="tt-hint">{new Date(e.at).toLocaleString('th-TH')}</span>
            {e.note && <p className="tt-dispute-timeline-note">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
