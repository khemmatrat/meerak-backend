'use client';

type Props = {
  progress: number;
  etaSec: number | null;
  shot?: number;
  shotTotal?: number;
  label?: string;
  variant?: 'overlay' | 'inline';
  onDismiss?: () => void;
};

export function AdVideoProgressRing({
  progress,
  etaSec,
  shot,
  shotTotal,
  label,
  variant = 'overlay',
  onDismiss,
}: Props) {
  const pct = Math.max(0, Math.min(100, progress));
  const r = variant === 'inline' ? 40 : 54;
  const size = variant === 'inline' ? 96 : 120;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const center = size / 2;

  const etaMin = etaSec != null && etaSec > 0 ? Math.max(1, Math.ceil(etaSec / 60)) : null;

  const rootClass =
    variant === 'overlay' ? 'tt-ad-progress-overlay' : 'tt-ad-progress-inline';

  return (
    <div className={rootClass} role="status" aria-live="polite">
      <div className={`tt-ad-progress-card${variant === 'inline' ? ' is-inline' : ''}`}>
        {variant === 'overlay' && onDismiss && (
          <button type="button" className="tt-ad-progress-dismiss" onClick={onDismiss}>
            ทำงานเบื้องหลัง — ไปรับออเดอร์ได้
          </button>
        )}
        <div className="tt-ad-progress-ring-wrap" style={{ width: size, height: size }}>
          <svg className="tt-ad-progress-ring" viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ width: size, height: size }}>
            <circle className="tt-ad-progress-ring-bg" cx={center} cy={center} r={r} />
            <circle
              className="tt-ad-progress-ring-fg"
              cx={center}
              cy={center}
              r={r}
              strokeDasharray={c}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="tt-ad-progress-ring-center">
            <strong>{Math.round(pct)}%</strong>
          </div>
        </div>
        <p className="tt-ad-progress-title">{label || 'AI กำลังสร้างคลิปโฆษณา'}</p>
        {shot != null && shotTotal != null && shotTotal > 0 && (
          <p className="tt-ad-progress-shot">
            ช็อต {Math.min(shot, shotTotal)}/{shotTotal}
          </p>
        )}
        {etaMin != null ? (
          <p className="tt-ad-progress-eta">ประมาณอีก {etaMin} นาที</p>
        ) : (
          <p className="tt-ad-progress-eta">กำลังประมวลผล…</p>
        )}
        <p className="tt-ad-progress-hint">
          {variant === 'overlay'
            ? 'ปิดหน้านี้ได้ — ระบบทำงานต่อเบื้องหลัง แจ้งเตือนเมื่อเสร็จ'
            : 'ปิดหน้านี้ได้ — ดูความคืบหน้าได้ที่แถบด้านล่าง'}
        </p>
      </div>
    </div>
  );
}
