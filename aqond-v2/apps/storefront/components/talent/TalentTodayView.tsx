'use client';

import Link from 'next/link';
import { EmptyState, StatusChip } from '@aqond/ui';
import { TalentDiscoverGuide } from '@/components/talent/TalentDiscoverGuide';
import { TalentLoadingSkeleton } from '@/components/talent/TalentLoadingSkeleton';
import { TalentRoleBadge } from '@/components/talent/TalentRoleBadge';
import { TalentSatelliteShortcuts } from '@/components/talent/TalentSatelliteShortcuts';
import { useTalentToday } from '@/hooks/talent/useTalentToday';
import { useTalentRole } from '@/lib/talent/TalentRoleContext';
import { formatDate } from '@/lib/format';
import { bookingStatusTone } from '@/lib/services/bookingApi';
import type { TalentTodayComposed } from '@/lib/talent/talentTodayCompose';
import { isTalentSummaryChipVisible, isTalentTodaySectionVisible } from '@/lib/talent/talentRolePermissions';
import type { TalentRoleId } from '@/lib/talent/talentRoleTypes';
import { TALENT_WORKSPACE_LOGIN } from '@/lib/talent/talentDiscoverability';
import { TALENT_TODAY_LINKS, talentBoardJobHref, talentMatchJobHref, talentNotificationHref } from '@/lib/talent/talentTodayLinks';

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatThb(amount: number): string {
  try {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(amount);
  } catch {
    return `฿${amount.toFixed(0)}`;
  }
}

function SectionHead({
  title,
  href,
  count,
}: {
  title: string;
  href: string;
  count?: number;
}) {
  return (
    <div className="tt-talent-today-section-head">
      <h2>{title}</h2>
      <Link href={href} className="tt-talent-today-see-all">
        ดูทั้งหมด{count != null && count > 0 ? ` (${count})` : ''}
      </Link>
    </div>
  );
}

function SummaryStrip({ summary, role }: { summary: TalentTodayComposed['summary']; role: TalentRoleId }) {
  const chips: { key: keyof TalentTodayComposed['summary']; label: string; icon: string; format?: (v: number) => string }[] = [
    { key: 'pendingIncoming', label: 'จองรอตอบ', icon: '📅' },
    { key: 'activeMatch', label: 'Match กำลังทำ', icon: '⚡' },
    { key: 'boardApplications', label: 'Board สมัคร', icon: '💼' },
    { key: 'unreadNotifications', label: 'แจ้งเตือน', icon: '🔔' },
    { key: 'walletTotal', label: 'กระเป๋า', icon: '💰', format: formatThb },
  ];

  return (
    <div className="tt-talent-today-summary" aria-label="สรุปวันนี้">
      {chips.map(({ key, label, icon, format }) => {
        if (!isTalentSummaryChipVisible(role, key)) return null;
        const raw = summary[key];
        if (key === 'walletTotal' && raw == null) return null;
        const value = key === 'walletTotal' && typeof raw === 'number' ? format!(raw) : String(raw ?? 0);
        return (
          <div key={key} className="tt-talent-today-chip">
            <span>
              {icon} {label}
            </span>
            <strong>{value}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function TalentTodayView() {
  const { loading, composed, loggedIn, reload } = useTalentToday();
  const { activeRole } = useTalentRole();

  if (loading) return <TalentLoadingSkeleton label="กำลังโหลด Today" />;

  if (!loggedIn) {
    return (
      <div className="tt-talent-page">
        <header className="tt-talent-page-head">
          <span className="tt-talent-page-icon" aria-hidden>
            ☀️
          </span>
          <div>
            <p className="tt-talent-page-module">Today</p>
            <h2 className="tt-talent-page-title">สรุปวันนี้</h2>
          </div>
        </header>
        <Link href={TALENT_WORKSPACE_LOGIN} className="tt-talent-today-login">
          <span>🔔</span>
          <div>
            <strong>เข้าสู่ระบบเพื่อดู Today</strong>
            <p className="tt-hint">รวม Match · Board · Booking · Wallet · แจ้งเตือน</p>
          </div>
        </Link>
        <TalentDiscoverGuide />
      </div>
    );
  }

  if (!composed) return null;

  return (
    <div className="tt-talent-page tt-talent-today">
      <header className="tt-talent-page-head">
        <span className="tt-talent-page-icon" aria-hidden>
          ☀️
        </span>
        <div>
          <p className="tt-talent-page-module">Today · TOS-2 · TOS-3</p>
          <h2 className="tt-talent-page-title">สรุปวันนี้</h2>
          <TalentRoleBadge compact />
        </div>
        <button type="button" className="tt-talent-today-refresh" onClick={() => void reload()} aria-label="รีเฟรช">
          ↻
        </button>
      </header>

      <SummaryStrip summary={composed.summary} role={activeRole} />

      <TalentSatelliteShortcuts />

      {isTalentTodaySectionVisible(activeRole, 'notifications') && (
      <section className="tt-talent-today-section">
        <SectionHead title="แจ้งเตือน" href={TALENT_TODAY_LINKS.notifications} count={composed.notifications.total} />
        {composed.notifications.items.length === 0 ? (
          <EmptyState title="ไม่มีแจ้งเตือนใหม่" description="อ่านผ่าน /api/talent/read/notifications/latest" />
        ) : (
          <ul className="tt-talent-today-list">
            {composed.notifications.items.map((n, i) => {
              const href = talentNotificationHref(n);
              const key = n.id || `n-${i}`;
              const body = (
                <>
                  <strong>{n.title || 'แจ้งเตือน'}</strong>
                  {n.message ? <p>{n.message}</p> : null}
                  <time>{formatDateTime(n.sentAt || n.created_at)}</time>
                </>
              );
              return (
                <li key={key}>
                  {href ? (
                    <Link href={href} className="tt-talent-today-card">
                      {body}
                    </Link>
                  ) : (
                    <div className="tt-talent-today-card">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      )}

      {isTalentTodaySectionVisible(activeRole, 'bookings') && (
      <section className="tt-talent-today-section">
        <SectionHead title="การจองที่กำลังจะถึง" href={TALENT_TODAY_LINKS.bookingIncoming} count={composed.upcomingBookings.total} />
        {composed.upcomingBookings.items.length === 0 ? (
          <EmptyState title="ไม่มีคิววันนี้" description="รวม incoming + my-requests จาก booking API เดิม" />
        ) : (
          <ul className="tt-talent-today-list">
            {composed.upcomingBookings.items.map((b) => (
              <li key={b.id}>
                <Link href={TALENT_TODAY_LINKS.bookingMine} className="tt-talent-today-card">
                  <div className="tt-talent-today-card-row">
                    <strong>{b.talent_name || b.booker_name || 'Booking'}</strong>
                    <StatusChip tone={bookingStatusTone(b.status)}>{b.status}</StatusChip>
                  </div>
                  <p>{formatDateTime(b.start_time)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {isTalentTodaySectionVisible(activeRole, 'match') && (
      <section className="tt-talent-today-section">
        <SectionHead title="Match ที่กำลังทำ" href={TALENT_TODAY_LINKS.matchMine} count={composed.recentMatch.total} />
        {composed.recentMatch.items.length === 0 ? (
          <EmptyState title="ไม่มีงาน Match ค้าง" description="filter จาก myMatchJobsFilter · tab working" />
        ) : (
          <ul className="tt-talent-today-list">
            {composed.recentMatch.items.map((j) => (
              <li key={j.id}>
                <Link href={talentMatchJobHref(j.id)} className="tt-talent-today-card">
                  <strong>{j.title}</strong>
                  <p>{j.category} · {formatDateTime(j.datetime || j.created_at)}</p>
                  <StatusChip tone="active">{String(j.status)}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {isTalentTodaySectionVisible(activeRole, 'board') && (
      <section className="tt-talent-today-section">
        <SectionHead title="Board ที่สมัคร" href={TALENT_TODAY_LINKS.boardList} count={composed.recentBoard.total} />
        {composed.recentBoard.items.length === 0 ? (
          <EmptyState title="ยังไม่มีใบสมัคร Board" description="จาก fetchMyBoardApplications" />
        ) : (
          <ul className="tt-talent-today-list">
            {composed.recentBoard.items.map((a) => (
              <li key={a.id}>
                <Link href={talentBoardJobHref(a.job_id)} className="tt-talent-today-card">
                  <strong>{a.title}</strong>
                  <p>{a.employer_name} · {formatDate(a.created_at)}</p>
                  <StatusChip tone="pending">{a.status}</StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}

      {isTalentTodaySectionVisible(activeRole, 'wallet') && (
      <section className="tt-talent-today-section">
        <SectionHead title="กระเป๋าเงิน" href={TALENT_TODAY_LINKS.wallet} />
        {!composed.wallet ? (
          <EmptyState title="ยังโหลด wallet ไม่ได้" description="BFF GET /v1/wallet — ตรวจการเชื่อมต่อ Account wallet" />
        ) : (
          <Link href={TALENT_TODAY_LINKS.wallet} className="tt-talent-today-wallet">
            <div>
              <span>ใช้ได้ (AqondPay)</span>
              <strong>{formatThb(composed.wallet.available)}</strong>
            </div>
            <div>
              <span>รอเคลียร์</span>
              <strong>{formatThb(composed.wallet.pending)}</strong>
            </div>
            <div>
              <span>รวม</span>
              <strong>{formatThb(composed.wallet.total)}</strong>
            </div>
            {composed.wallet.wallet_frozen ? <StatusChip tone="danger">Wallet frozen</StatusChip> : null}
          </Link>
        )}
      </section>
      )}

      {isTalentTodaySectionVisible(activeRole, 'reviews') && (
      <section className="tt-talent-today-section">
        <SectionHead title="รีวิวล่าสุด" href={TALENT_TODAY_LINKS.trust} count={composed.recentReviews.total} />
        {composed.recentReviews.items.length === 0 ? (
          <EmptyState title="ยังไม่มีรีวิว" description="GET /api/talent/read/reviews/worker/:userId" />
        ) : (
          <ul className="tt-talent-today-list">
            {composed.recentReviews.items.map((r) => (
              <li key={r.id}>
                <div className="tt-talent-today-card">
                  <div className="tt-talent-today-stars">
                    {'★'.repeat(Math.round(Number(r.rating_overall) || 0))}
                    {'☆'.repeat(5 - Math.round(Number(r.rating_overall) || 0))}
                  </div>
                  <p>{r.comment || '—'}</p>
                  <span className="tt-hint">{r.reviewer_name || 'ผู้รีวิว'} · {formatDate(r.created_at || '')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}
