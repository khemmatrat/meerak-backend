'use client';

import Link from 'next/link';
import { EmptyState, StatusChip } from '@aqond/ui';
import { CommerceChartPanel } from '@/components/talent/commerce/CommerceChartPanel';
import { CommerceCompletionPanel } from '@/components/talent/commerce/CommerceCompletionPanel';
import { CommerceEmpty } from '@/components/talent/commerce/CommerceEmpty';
import { CommerceGrowthPanel } from '@/components/talent/commerce/CommerceGrowthPanel';
import { CommerceMetricGrid } from '@/components/talent/commerce/CommerceMetricGrid';
import { CommercePeriodFilter } from '@/components/talent/commerce/CommercePeriodFilter';
import { CommerceSection } from '@/components/talent/commerce/CommerceSection';
import { CommerceSkeleton } from '@/components/talent/commerce/CommerceSkeleton';
import { useTalentCommerce } from '@/hooks/talent/useTalentCommerce';
import { bookingStatusTone } from '@/lib/services/bookingApi';
import { formatThbCompact } from '@/lib/talent/commerce/talentCommerceCompose';
import {
  talentCommerceBoardHref,
  talentCommerceBookingHref,
  talentCommerceMatchHref,
} from '@/lib/talent/commerce/talentCommerceLinks';
import { formatDate } from '@/lib/format';

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

export function CommerceIntelligenceDashboard() {
  const { loading, error, period, setPeriod, composed, loggedIn, reload } = useTalentCommerce();

  const hasData =
    composed &&
    (composed.bookings.total > 0 ||
      composed.match.total > 0 ||
      composed.board.total > 0 ||
      composed.wallet != null ||
      composed.reviews.total > 0);

  return (
    <div className="tt-talent-page tt-talent-commerce-page" data-talent-commerce>
      <header className="tt-talent-page-head">
        <Link href="/m/talent" className="tt-talent-notif-back" aria-label="กลับ Today">
          ←
        </Link>
        <span className="tt-talent-page-icon" aria-hidden>
          💰
        </span>
        <div>
          <p className="tt-talent-page-module">Commerce · TOS-10</p>
          <h2 className="tt-talent-page-title">Commerce Intelligence</h2>
          <StatusChip tone="pending">Compose only · existing data</StatusChip>
        </div>
        <button
          type="button"
          className="tt-talent-today-refresh"
          onClick={() => void reload()}
          aria-label="รีเฟรช"
          disabled={loading}
        >
          ↻
        </button>
      </header>

      <CommercePeriodFilter active={period} onChange={setPeriod} />

      {loading ? (
        <CommerceSkeleton />
      ) : !loggedIn ? (
        <>
          <CommerceEmpty loggedIn={false} />
          <Link href="/m/login?next=/m/talent/money" className="tt-talent-today-login">
            <span>🔑</span>
            <div>
              <strong>เข้าสู่ระบบ</strong>
              <p className="tt-hint">ดู dashboard จาก API เดิม</p>
            </div>
          </Link>
        </>
      ) : !composed || error ? (
        <CommerceEmpty loggedIn error={error} />
      ) : !hasData ? (
        <CommerceEmpty loggedIn />
      ) : (
        <>
          <CommerceMetricGrid metrics={composed.metrics} />

          <CommerceChartPanel charts={composed.charts} period={composed.period} />

          <CommerceGrowthPanel growth={composed.growth} period={composed.period} />

          <CommerceCompletionPanel completion={composed.completion} />

          <CommerceSection
            title="Bookings"
            href={composed.bookings.href}
            count={composed.bookings.total}
            meta={`รอ ${composed.bookings.pending} · ยืนยัน ${composed.bookings.confirmed} · สำเร็จ ${composed.bookings.completed}`}
          >
            {composed.bookings.items.length === 0 ? (
              <EmptyState title="ยังไม่มีการจอง" description="fetchIncomingBookings + fetchMyBookingRequests" />
            ) : (
              <ul className="tt-talent-today-list">
                {composed.bookings.items.map((b) => (
                  <li key={b.id}>
                    <Link href={talentCommerceBookingHref(b)} className="tt-talent-today-card">
                      <strong>{b.talent_name || b.booker_name || 'Booking'}</strong>
                      <p>{formatDateTime(b.start_time)}</p>
                      <StatusChip tone={bookingStatusTone(b.status)}>{b.status}</StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommerceSection>

          <CommerceSection
            title="Income"
            href={composed.bookings.href}
            meta={`รวมประมาณ ${formatThbCompact(composed.income.estimatedTotal)} · ไม่ใช่ ledger จริง`}
          >
            <div className="tt-talent-commerce-income-summary">
              <div>
                <span>Match</span>
                <strong>{formatThbCompact(composed.income.matchCompleted)}</strong>
              </div>
              <div>
                <span>Board</span>
                <strong>{formatThbCompact(composed.income.boardHired)}</strong>
              </div>
              <div>
                <span>Booking</span>
                <strong>{formatThbCompact(composed.income.bookingDeposits)}</strong>
              </div>
              <div>
                <span>Wallet</span>
                <strong>{formatThbCompact(composed.income.walletAvailable)}</strong>
              </div>
            </div>
          </CommerceSection>

          <CommerceSection
            title="Match"
            href={composed.match.href}
            count={composed.match.total}
            meta={`กำลังทำ ${composed.match.working} · pipeline ${formatThbCompact(composed.match.pipelineValue)}`}
          >
            {composed.match.items.length === 0 ? (
              <EmptyState title="ยังไม่มี Match" description="fetchMyMatchJobs (includeExpired)" />
            ) : (
              <ul className="tt-talent-today-list">
                {composed.match.items.map((j) => (
                  <li key={j.id}>
                    <Link href={talentCommerceMatchHref(j)} className="tt-talent-today-card">
                      <strong>{j.title}</strong>
                      <p>
                        {formatThbCompact(Number(j.price || 0))} · {formatDate(j.datetime || j.created_at || '')}
                      </p>
                      <StatusChip tone="pending">{String(j.status)}</StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommerceSection>

          <CommerceSection
            title="Board"
            href={composed.board.href}
            count={composed.board.total}
            meta={`สมัคร ${composed.board.active} · จ้างแล้ว ${composed.board.hired}`}
          >
            {composed.board.items.length === 0 ? (
              <EmptyState title="ยังไม่มี Board" description="fetchMyBoardApplications" />
            ) : (
              <ul className="tt-talent-today-list">
                {composed.board.items.map((a) => (
                  <li key={a.id}>
                    <Link href={talentCommerceBoardHref(a)} className="tt-talent-today-card">
                      <strong>{a.title}</strong>
                      <p>
                        {a.employer_name} · {formatThbCompact(boardMid(a))}
                      </p>
                      <StatusChip tone="pending">{a.status}</StatusChip>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommerceSection>

          <CommerceSection title="Wallet" href="/m/account/wallet">
            {!composed.wallet ? (
              <EmptyState title="ยังโหลด wallet ไม่ได้" description="GET /api/wallet/:userId/summary" />
            ) : (
              <Link href="/m/account/wallet" className="tt-talent-today-wallet">
                <div>
                  <span>ใช้ได้</span>
                  <strong>{formatThbCompact(composed.wallet.available)}</strong>
                </div>
                <div>
                  <span>รอเคลียร์</span>
                  <strong>{formatThbCompact(composed.wallet.pending)}</strong>
                </div>
                <div>
                  <span>รวม</span>
                  <strong>{formatThbCompact(composed.wallet.total)}</strong>
                </div>
                {composed.wallet.wallet_frozen ? <StatusChip tone="danger">Wallet frozen</StatusChip> : null}
              </Link>
            )}
          </CommerceSection>

          <CommerceSection
            title="Reviews"
            href={composed.reviews.href}
            count={composed.reviews.total}
            meta={
              composed.reviews.averageRating != null
                ? `เฉลี่ย ${composed.reviews.averageRating} ★`
                : undefined
            }
          >
            {composed.reviews.items.length === 0 ? (
              <EmptyState title="ยังไม่มีรีวิว" description="GET /api/reviews/worker/:userId" />
            ) : (
              <ul className="tt-talent-today-list">
                {composed.reviews.items.map((r) => (
                  <li key={r.id}>
                    <Link href={composed.reviews.href} className="tt-talent-today-card">
                      <div className="tt-talent-today-stars">
                        {'★'.repeat(Math.round(Number(r.rating_overall) || 0))}
                        {'☆'.repeat(5 - Math.round(Number(r.rating_overall) || 0))}
                      </div>
                      <p>{r.comment || '—'}</p>
                      <span className="tt-hint">
                        {r.reviewer_name || 'ผู้รีวิว'} · {formatDate(r.created_at || '')}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CommerceSection>
        </>
      )}
    </div>
  );
}

function boardMid(a: { min_budget: number; max_budget: number }): number {
  return (Number(a.min_budget) + Number(a.max_budget)) / 2;
}
