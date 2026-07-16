'use client';

import { useState } from 'react';
import { RIDER_REJECT_REASONS } from '@/lib/rider';

type Props = {
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (reasonId: string) => void;
};

export function RiderRejectJobSheet({ open, busy, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div className="tt-rider-reject-overlay" onClick={onClose} role="presentation">
      <div className="tt-rider-reject-sheet" onClick={(e) => e.stopPropagation()}>
        <h3>ปฏิเสธงานนี้</h3>
        <p className="tt-hint">เลือกเหตุผลสั้นๆ — งานจะหายจากรายการของคุณชั่วคราว</p>
        <div className="tt-rider-reject-reasons">
          {RIDER_REJECT_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`tt-rider-reject-reason${reason === r.id ? ' selected' : ''}`}
              disabled={busy}
              onClick={() => setReason(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="tt-rider-reject-actions">
          <button type="button" className="tt-rider-reject-cancel" disabled={busy} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="tt-rider-reject-confirm"
            disabled={!reason || busy}
            onClick={() => onConfirm(reason)}
          >
            {busy ? '…' : 'ยืนยันปฏิเสธ'}
          </button>
        </div>
      </div>
    </div>
  );
}
