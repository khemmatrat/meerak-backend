'use client';

export const RIDER_ISSUE_FLOWS = [
  {
    id: 'customer_no_answer',
    label: 'ลูกค้าไม่รับสาย',
    hint: 'รอ 5 นาที → ถ่ายรูปหน้าบ้าน → แจ้งปัญหา (ไม่มีค่าปรับถ้าทำตามขั้นตอน)',
    steps: ['โทรซ้ำ 2 ครั้ง', 'รอ 5 นาที', 'ถ่ายรูปหลักฐาน', 'กดยืนยันในแอป'],
  },
  {
    id: 'merchant_closed',
    label: 'ร้านปิด / ของหมด',
    hint: 'แจ้งระบบเพื่อยกเลิกงานและหาไรเดอร์ใหม่ให้ลูกค้า',
    steps: ['ถ่ายรูปหน้าร้าน', 'แจ้งปัญหา', 'รอทีมยืนยัน'],
  },
  {
    id: 'wrong_pin',
    label: 'พิกัดผิด',
    hint: 'ลูกค้าปักหมุดผิด — แจ้งพิกัดจริงให้ทีมอัปเดต',
    steps: ['โทรยืนยันกับลูกค้า', 'บันทึกตำแหน่งจริง', 'แจ้งปัญหา'],
  },
  {
    id: 'vehicle_breakdown',
    label: 'รถเสีย / อุบัติเหตุ',
    hint: 'ใช้ปุ่ม SOS ถ้าฉุกเฉิน — หรือแจ้งปัญหานี้เพื่อยกเลิกงาน',
    steps: ['กด SOS ถ้าอันตราย', 'แจ้งปัญหา', 'รอทีมติดต่อ'],
  },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (issueId: string) => void;
  phase?: string;
};

export function RiderIssueSheet({ open, onClose, onSelect, phase }: Props) {
  if (!open) return null;

  return (
    <div className="tt-rider-issue-backdrop" role="dialog" aria-modal="true">
      <div className="tt-rider-issue-sheet">
        <header className="tt-rider-issue-head">
          <h3>ขอความช่วยเหลือ</h3>
          <button type="button" className="tt-rider-issue-close" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </header>
        {phase && (
          <p className="tt-hint" style={{ margin: '0 0 12px' }}>
            สถานะงาน: {phase}
          </p>
        )}
        <ul className="tt-rider-issue-list">
          {RIDER_ISSUE_FLOWS.map((flow) => (
            <li key={flow.id}>
              <button
                type="button"
                className="tt-rider-issue-item"
                onClick={() => onSelect(flow.id)}
              >
                <strong>{flow.label}</strong>
                <span>{flow.hint}</span>
                <ol className="tt-rider-issue-steps">
                  {flow.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </button>
            </li>
          ))}
        </ul>
        <p className="tt-hint">
          การโทร/แชทยังไม่มี number masking — ใช้เบอร์ในใบงานชั่วคราว
        </p>
      </div>
    </div>
  );
}
