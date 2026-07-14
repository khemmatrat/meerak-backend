'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { AqondButton as Button, AqondCard as Card, AqondInput as Input } from '@aqond/components';
import { suggestRoutingByKeywords, WORK_SURFACES } from '@/lib/services/workTaxonomy';
import { surfaceCreateHref, surfaceLabel } from '@/lib/services/workRoutingRoutes';

const CREATE_OPTIONS = [
  {
    surface: 'match_job' as const,
    icon: '⚡',
    title: 'Match Job',
    description: 'งานด่วน / ภาคสนาม — จับคู่ตามพื้นที่',
    href: '/m/services/match/create',
  },
  {
    surface: 'jobboard' as const,
    icon: '💼',
    title: 'Job Board',
    description: 'โปรเจกต์ — ขอบเขต งบ และระยะเวลาชัดเจน',
    href: '/m/services/board/create',
  },
  {
    surface: 'booking' as const,
    icon: '📅',
    title: 'Booking',
    description: 'จองคิวช่าง / ผู้เชี่ยวชาญตามเวลา',
    href: '/m/services/booking/talents',
  },
  {
    surface: 'videofeed' as const,
    icon: '🎬',
    title: 'Video Feed',
    description: 'ดูคลิปผลงานก่อนตัดสินใจจ้าง',
    href: '/m/services/video',
  },
];

export function CreateJobHubView() {
  const [query, setQuery] = useState('');
  const suggestion = useMemo(
    () => suggestRoutingByKeywords(query, { verticalWeightOverrides: null }),
    [query],
  );

  return (
    <div className="tt-services-create-hub">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">สร้างงาน / จ้างงาน</h2>
          <p className="tt-hint">เลือกช่องทางที่เหมาะกับงานของคุณ</p>
        </div>
        <Link href="/m/services" className="tt-services-back-link">
          ‹ Services
        </Link>
      </div>

      <Card className="tt-services-create-card">
        <label className="tt-services-field">
          <span>ค้นหาประเภทงาน (Routing แนะนำ)</span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="เช่น ช่างแอร์ด่วน, ตัดต่อวิดีโอ, SEO, ช่างแต่งหน้า..."
          />
        </label>
        {suggestion && query.trim() && (
          <div className="tt-services-routing-suggestion tt-services-routing-suggestion-inline">
            <p className="tt-services-routing-suggestion-label">แนะนำช่องทาง</p>
            <p className="tt-services-routing-suggestion-text">
              <strong>{surfaceLabel(suggestion.surface)}</strong> — {suggestion.profession} (
              {(suggestion.confidence * 100).toFixed(0)}%)
            </p>
            <Link href={surfaceCreateHref(suggestion.surface)}>
              <Button type="button" variant="primary" style={{ marginTop: 8, width: '100%' }}>
                ไป {surfaceLabel(suggestion.surface)}
              </Button>
            </Link>
          </div>
        )}
        <Link href="/m/services/create/routing" className="tt-link-accent" style={{ display: 'block', marginTop: 12 }}>
          เปิด Work Routing Matrix →
        </Link>
      </Card>

      <div className="tt-services-create-hub-grid">
        {CREATE_OPTIONS.map((opt) => (
          <Link key={opt.href} href={opt.href} className="tt-services-create-hub-card">
            <span className="tt-services-hub-card-icon" aria-hidden>
              {opt.icon}
            </span>
            <h3>{opt.title}</h3>
            <p>{opt.description}</p>
            <span className="tt-services-hub-badge">{WORK_SURFACES.find((s) => s.id === opt.surface)?.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
