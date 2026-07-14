'use client';

type Props = {
  qualified: number;
  target?: number;
  unlocked?: boolean;
  title?: string;
  subtitle?: string;
  socialProof?: string;
  unlockedMessage?: string;
};

export function ReferralMilestoneTracker({
  qualified,
  target = 10,
  unlocked = false,
  title = 'ชวนเพื่อนเปิด Wallet',
  subtitle = 'เพื่อนต้องสมัครและเปิดกระเป๋า AQOND จึงจะนับ',
  socialProof = 'ผู้ใช้ AQOND หลายพันคนผ่านขั้นนี้แล้ว',
  unlockedMessage = 'ปลดล็อกแล้ว!',
}: Props) {
  const pct = Math.min(100, Math.round((qualified / target) * 100));
  const slots = Array.from({ length: target }, (_, i) => i < qualified);

  return (
    <div className="tt-milestone-card">
      <div className="tt-milestone-head">
        <div>
          <h3>{unlocked ? '✓ ' : '🔒 '}{title}</h3>
          <p className="tt-milestone-sub">{subtitle}</p>
          <p className="tt-milestone-proof">{socialProof}</p>
        </div>
        <div className="tt-milestone-count">
          <strong>{qualified}/{target}</strong>
          <span>เพื่อน</span>
        </div>
      </div>
      <div className="tt-milestone-bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="tt-milestone-slots">
        {slots.map((filled, i) => (
          <div key={i} className={`tt-milestone-slot${filled ? ' filled' : ''}`}>
            {filled ? '✓' : '+'}
          </div>
        ))}
      </div>
      {!unlocked && qualified < target ? (
        <p className="tt-milestone-hint">เหลืออีก {target - qualified} คน — แชร์ลิงก์แล้วบอกให้เปิด Wallet</p>
      ) : null}
      {unlocked ? <p className="tt-milestone-unlocked">{unlockedMessage}</p> : null}
    </div>
  );
}
