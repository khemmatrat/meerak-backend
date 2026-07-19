'use client';

import Link from 'next/link';
import { AqondButton } from '@aqond/components';

type FtxWelcomeOverlayProps = {
  open: boolean;
  onDismiss: () => void;
  onExplore: () => void;
  onStartWizard?: () => void;
};

const DISCOVER_LINKS = [
  { href: '/m/food', label: 'สั่งอาหาร', emoji: '🍜' },
  { href: '/m/services', label: 'จ้างงาน / บริการ', emoji: '💼' },
  { href: '/m/talent', label: 'Talent OS', emoji: '✨' },
  { href: '/m/merchant', label: 'เปิดร้านค้า', emoji: '🏪' },
  { href: '/m/feed', label: 'ดูวิดีโอ', emoji: '🎬' },
];

export function FtxWelcomeOverlay({ open, onDismiss, onExplore, onStartWizard }: FtxWelcomeOverlayProps) {
  if (!open) return null;

  return (
    <div className="ftx-welcome-backdrop" role="presentation" onClick={onDismiss}>
      <div
        className="ftx-welcome-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ftx-welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="ftx-welcome-close" onClick={onDismiss} aria-label="ปิด">
          ✕
        </button>

        <p className="ftx-welcome-kicker">ยินดีต้อนรับสู่ AQOND</p>
        <h2 id="ftx-welcome-title" className="ftx-welcome-title">
          ค้นพบตลาด อาหาร งาน และ AI ในที่เดียว
        </h2>
        <p className="ftx-welcome-sub">
          เลือกดูได้ทันทีโดยไม่ต้องสมัคร — สมัครเมื่อพร้อมใช้งานเต็มรูปแบบ
        </p>

        <div className="ftx-welcome-grid">
          {DISCOVER_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="ftx-welcome-card" onClick={onExplore}>
              <span aria-hidden>{item.emoji}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </div>

        <div className="ftx-welcome-actions">
          {onStartWizard && (
            <AqondButton type="button" className="ftx-welcome-primary" onClick={onStartWizard}>
              ปรับแต่งประสบการณ์
            </AqondButton>
          )}
          <AqondButton type="button" className="ftx-welcome-secondary" onClick={onExplore}>
            เริ่มสำรวจ
          </AqondButton>
          <button type="button" className="ftx-welcome-skip" onClick={onDismiss}>
            ข้ามไปก่อน
          </button>
        </div>
      </div>
    </div>
  );
}
