'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import {
  AqondButton as Button,
  AqondCard as Card,
  AqondChip as StatusChip,
  AqondInput as Input,
} from '@aqond/components';
import { useBookingTalentsList } from '@/hooks/services/useBookingTalentsList';
import { bookingStatusTone } from '@/lib/services/bookingApi';
import {
  EXPERT_CATEGORY_FILTERS,
  expertCategoryLabel,
} from '@/lib/services/bookingTaxonomy';
import type { ExpertCategory } from '@/lib/services/bookingTypes';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function BookingTalentsListView() {
  const {
    providers,
    loading,
    category,
    setCategory,
    search,
    setSearch,
    err,
    reload,
  } = useBookingTalentsList();

  return (
    <div className="tt-services-booking">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">Talents</h2>
          <p className="tt-hint">เลือกผู้เชี่ยวชาญและจองคิว</p>
        </div>
        <div className="tt-services-mine-head-actions">
          <Link href="/m/services/booking/mine">
            <Button type="button" variant="secondary" style={{ fontSize: '0.85rem' }}>
              การจองของฉัน
            </Button>
          </Link>
          <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="tt-services-search-wrap">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อ บริการ..."
        />
      </div>

      <div className="tt-services-mine-tabs">
        {EXPERT_CATEGORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`tt-services-pill${category === f.id ? ' active' : ''}`}
            onClick={() => setCategory(f.id as ExpertCategory)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {err && <p className="tt-error-inline">{err}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลด Talent..." />
      ) : providers.length === 0 ? (
        <EmptyState title="ยังไม่มี Talent ในหมวดนี้" description="ลองเปลี่ยนหมวดหรือค้นหาใหม่" />
      ) : (
        <ul className="tt-services-job-list">
          {providers.map((p) => (
            <li key={p.id}>
              <Link href={`/m/services/booking/talents/${p.id}`} className="tt-services-job-card">
                <Card className="tt-services-talent-card">
                  <div className="tt-services-talent-card-inner">
                    <div className="tt-services-talent-avatar">
                      {p.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar_url} alt="" />
                      ) : (
                        <span>{(p.name || '?').charAt(0)}</span>
                      )}
                    </div>
                    <div className="tt-services-talent-body">
                      <div className="tt-services-job-card-top">
                        <h3 className="tt-services-job-card-title">{p.name}</h3>
                        {p.verified_badge && (
                          <StatusChip tone="active">{p.verified_badge}</StatusChip>
                        )}
                      </div>
                      <p className="tt-services-job-card-desc">
                        {p.signature_service || expertCategoryLabel(p.expert_category)}
                      </p>
                      <div className="tt-services-job-card-foot">
                        <span className="tt-hint">
                          ★ {Number(p.rating || 0).toFixed(1)} · งาน{' '}
                          {p.completedJobs ?? p.completed_jobs_count ?? 0}
                        </span>
                        <StatusChip tone={bookingStatusTone(p.status || 'available')}>
                          {p.status === 'available' ? 'ว่าง' : p.status || '—'}
                        </StatusChip>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
