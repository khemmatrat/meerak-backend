'use client';

import { useState } from 'react';
import { formatCatalogPrice } from '@/lib/format';
import { submitRiderReport, submitRiderReview } from '@/lib/foodTracking';
import type { RiderTrackingView } from '@/lib/server/riderTracking';

const TIP_OPTIONS = [
  { label: 'ไม่ทิป', micro: 0 },
  { label: '฿10', micro: 1000 },
  { label: '฿20', micro: 2000 },
  { label: '฿50', micro: 5000 },
];

const REPORT_TYPES = [
  { id: 'wrong_order', label: 'ได้อาหารผิดออเดอร์' },
  { id: 'missing_items', label: 'รายการไม่ครบ' },
  { id: 'quality', label: 'คุณภาพอาหารไม่ตรง' },
  { id: 'other', label: 'อื่นๆ' },
] as const;

type Props = {
  orderId: string;
  tracking: RiderTrackingView;
  onSubmitted: (t: RiderTrackingView) => void;
};

export function TtDeliveryReviewPanel({ orderId, tracking, onSubmitted }: Props) {
  const [stars, setStars] = useState(5);
  const [tipMicro, setTipMicro] = useState(0);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportType, setReportType] = useState<string>('wrong_order');
  const [reportNote, setReportNote] = useState('');
  const [reportSent, setReportSent] = useState(!!tracking.report);

  const submitReview = async () => {
    setLoading(true);
    try {
      onSubmitted(await submitRiderReview(orderId, { stars, comment, tip_micro: tipMicro }));
    } finally {
      setLoading(false);
    }
  };

  const submitReport = async () => {
    setLoading(true);
    try {
      onSubmitted(await submitRiderReport(orderId, { type: reportType, note: reportNote }));
      setReportSent(true);
      setShowReport(false);
    } finally {
      setLoading(false);
    }
  };

  if (!tracking.can_review) return null;

  return (
    <div className="tt-delivery-review">
      <h3>ให้คะแนนไรเดอร์ & ร้าน</h3>
      <div className="tt-review-stars">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`tt-star-btn${stars >= n ? ' on' : ''}`}
            onClick={() => setStars(n)}
            aria-label={`${n} ดาว`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="tt-input tt-textarea"
        placeholder="ความคิดเห็น (ไม่บังคับ)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <p className="tt-review-tip-label">ทิปไรเดอร์</p>
      <div className="tt-tip-chips">
        {TIP_OPTIONS.map((t) => (
          <button
            key={t.micro}
            type="button"
            className={`jarvis-chip${tipMicro === t.micro ? ' active' : ''}`}
            onClick={() => setTipMicro(t.micro)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tipMicro > 0 && (
        <p className="tt-tip-summary">ทิป {formatCatalogPrice(tipMicro)} ให้ {tracking.rider.name}</p>
      )}
      <button type="button" className="tt-btn-primary" disabled={loading} onClick={() => void submitReview()}>
        {loading ? 'กำลังส่ง…' : 'ส่งรีวิว'}
      </button>
      <button type="button" className="tt-btn-ghost tt-report-toggle" onClick={() => setShowReport(!showReport)}>
        {reportSent ? '✓ แจ้งปัญหาแล้ว' : 'แจ้งปัญหาออเดอร์'}
      </button>
      {showReport && !reportSent && (
        <div className="tt-report-box">
          <p className="tt-report-hint">กรณีได้อาหารผิดออเดอร์หรือคนละรายการ</p>
          {REPORT_TYPES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`tt-handoff-option${reportType === r.id ? ' tt-handoff-active' : ''}`}
              onClick={() => setReportType(r.id)}
            >
              <strong>{r.label}</strong>
            </button>
          ))}
          <textarea
            className="tt-input tt-textarea"
            placeholder="รายละเอียดเพิ่มเติม"
            value={reportNote}
            onChange={(e) => setReportNote(e.target.value)}
            rows={2}
          />
          <button type="button" className="tt-btn-primary" disabled={loading} onClick={() => void submitReport()}>
            ส่งแจ้งปัญหา
          </button>
        </div>
      )}
    </div>
  );
}
