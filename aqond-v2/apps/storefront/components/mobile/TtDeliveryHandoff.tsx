'use client';

import {
  DEFAULT_HANDOFF,
  HANDOFF_OPTIONS,
  type DeliveryHandoff,
  type HandoffType,
} from '@/lib/deliveryHandoff';

type Props = {
  value: DeliveryHandoff;
  onChange: (h: DeliveryHandoff) => void;
};

export function TtDeliveryHandoff({ value, onChange }: Props) {
  const pick = (type: HandoffType) => {
    onChange({ ...value, type });
  };

  const set = (patch: Partial<DeliveryHandoff>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div className="tt-handoff-block">
      <h3 className="tt-handoff-title">วิธีรับอาหาร</h3>
      <p className="tt-handoff-sub">บอกไรเดอร์ว่าจะส่งมอบอย่างไร</p>

      <div className="tt-handoff-options">
        {HANDOFF_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={`tt-handoff-option${value.type === opt.id ? ' tt-handoff-active' : ''}`}
            onClick={() => pick(opt.id)}
          >
            <span className="tt-handoff-option-icon">{opt.icon}</span>
            <div>
              <strong>{opt.label}</strong>
              <p>{opt.hint}</p>
            </div>
          </button>
        ))}
      </div>

      {value.type === 'leave_at' && (
        <div className="tt-handoff-fields">
          <label className="tt-label" htmlFor="handoff-spot">วางไว้ที่ไหน</label>
          <input
            id="handoff-spot"
            className="tt-input"
            placeholder="เช่น โต๊ะหน้าประตู · รปภ. · ชั้นล็อบบี้"
            value={value.leaveAtSpot || ''}
            onChange={(e) => set({ leaveAtSpot: e.target.value })}
          />
        </div>
      )}

      {value.type === 'delegate' && (
        <div className="tt-handoff-fields">
          <label className="tt-label" htmlFor="handoff-delegate-name">ชื่อผู้รับต่อ</label>
          <input
            id="handoff-delegate-name"
            className="tt-input"
            placeholder="ชื่อคนที่จะรับแทน"
            value={value.delegateName || ''}
            onChange={(e) => set({ delegateName: e.target.value })}
          />
          <label className="tt-label" htmlFor="handoff-building">ตึก / ชั้น / ห้อง</label>
          <input
            id="handoff-building"
            className="tt-input"
            placeholder="เช่น ตึก A ชั้น 12 ห้อง 1205"
            value={value.delegateBuilding || ''}
            onChange={(e) => set({ delegateBuilding: e.target.value })}
          />
          <label className="tt-label" htmlFor="handoff-delegate-phone">เบอร์ผู้รับต่อ (ไม่บังคับ)</label>
          <input
            id="handoff-delegate-phone"
            className="tt-input"
            placeholder="0812345678"
            inputMode="tel"
            value={value.delegatePhone || ''}
            onChange={(e) => set({ delegatePhone: e.target.value })}
          />
        </div>
      )}

      <label className="tt-label" htmlFor="handoff-extra">หมายเหตุเพิ่มถึงไรเดอร์ (ไม่บังคับ)</label>
      <input
        id="handoff-extra"
        className="tt-input"
        placeholder="เช่น โทรก่อนถึง · ไม่ใส่ถุงพลาสติก"
        value={value.extraNote || ''}
        onChange={(e) => set({ extraNote: e.target.value })}
      />
    </div>
  );
}

export { DEFAULT_HANDOFF };
