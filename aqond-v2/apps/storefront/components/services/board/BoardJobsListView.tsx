'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import {
  AqondButton as Button,
  AqondCard as Card,
  AqondChip as StatusChip,
  AqondInput as Input,
} from '@aqond/components';
import { useBoardJobsList } from '@/hooks/services/useBoardJobsList';
import { boardJobStatusTone } from '@/lib/services/boardJobApi';
import {
  ALL_BOARD_CATEGORIES,
  BOARD_EMPLOYMENT_TYPES,
  BOARD_PROVINCES,
  BOARD_SORT_OPTIONS,
  PREMIUM_BUDGET_THRESHOLD,
  boardCategoryLabel,
  boardStatusLabel,
  formatBoardBudget,
} from '@/lib/services/boardJobTaxonomy';
import type { BoardJobsTab } from '@/lib/services/boardJobTypes';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

const TABS: { id: BoardJobsTab; label: string }[] = [
  { id: 'all', label: 'งานทั้งหมด' },
  { id: 'my-jobs', label: 'งานที่โพสต์' },
  { id: 'my-applications', label: 'ที่ฉันสมัคร' },
  { id: 'saved', label: 'บันทึกไว้' },
];

function JobCard({ job, href }: { job: { id: string; title: string; category: string; min_budget: number; max_budget: number; duration_days: number; status: string; applicant_count: number; target_province?: string | null; employer_name?: string; is_platinum_priority?: boolean }; href: string }) {
  const premium = job.max_budget >= PREMIUM_BUDGET_THRESHOLD || job.is_platinum_priority;
  return (
    <li>
      <Link href={href} className="tt-services-job-card">
        <Card className={premium ? 'tt-services-board-card-premium' : undefined}>
          <div className="tt-services-job-card-top">
            <StatusChip tone="default">{boardCategoryLabel(job.category)}</StatusChip>
            <StatusChip tone={boardJobStatusTone(job.status)}>{boardStatusLabel(job.status)}</StatusChip>
          </div>
          {premium && <span className="tt-services-board-premium-badge">Premium</span>}
          <h3 className="tt-services-job-card-title">{job.title}</h3>
          <div className="tt-services-board-meta-row">
            <span>{formatBoardBudget(job.min_budget, job.max_budget)}</span>
            <span>{job.duration_days} วัน</span>
            {job.target_province && <span>{job.target_province}</span>}
          </div>
          <div className="tt-services-job-card-foot">
            <span className="tt-hint">{job.employer_name || 'ผู้จ้าง'}</span>
            <span className="tt-hint">ผู้สมัคร {job.applicant_count}</span>
          </div>
        </Card>
      </Link>
    </li>
  );
}

export function BoardJobsListView() {
  const {
    jobs,
    applications,
    total,
    loading,
    err,
    activeTab,
    setTab,
    filters,
    patchFilters,
    showFilters,
    setShowFilters,
    clearFilters,
    hasActiveFilters,
    reload,
  } = useBoardJobsList();

  return (
    <div className="tt-services-board">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">Job Board</h2>
          <p className="tt-hint">งานโปรเจกต์ — ขอบเขต งบ และระยะเวลาชัดเจน</p>
        </div>
        <div className="tt-services-mine-head-actions">
          <Link href="/m/services/board/create">
            <Button type="button" variant="primary" style={{ fontSize: '0.85rem' }}>
              + โพสต์งาน
            </Button>
          </Link>
          <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
            รีเฟรช
          </button>
        </div>
      </div>

      <div className="tt-services-mine-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tt-services-pill${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'all' && (
        <>
          <div className="tt-services-search-wrap">
            <Input
              value={filters.q}
              onChange={(e) => patchFilters({ q: e.target.value })}
              placeholder="ค้นหางาน หัวข้อ รายละเอียด..."
            />
          </div>
          <div className="tt-services-board-toolbar">
            <button
              type="button"
              className={`tt-services-pill${showFilters ? ' active' : ''}`}
              onClick={() => setShowFilters((v) => !v)}
            >
              ตัวกรอง{hasActiveFilters ? ' •' : ''}
            </button>
            <select
              className="tt-services-select tt-services-board-sort"
              value={filters.sort}
              onChange={(e) =>
                patchFilters({ sort: e.target.value as typeof filters.sort })
              }
            >
              {BOARD_SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          {showFilters && (
            <Card className="tt-services-board-filters">
              <label className="tt-services-field">
                <span>หมวดหมู่</span>
                <select
                  className="tt-services-select"
                  value={filters.category}
                  onChange={(e) => patchFilters({ category: e.target.value })}
                >
                  <option value="">ทั้งหมด</option>
                  {ALL_BOARD_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {boardCategoryLabel(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tt-services-field">
                <span>จังหวัด</span>
                <select
                  className="tt-services-select"
                  value={filters.target_province}
                  onChange={(e) => patchFilters({ target_province: e.target.value })}
                >
                  <option value="">ทุกจังหวัด</option>
                  {BOARD_PROVINCES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tt-services-field">
                <span>ลักษณะการจ้าง</span>
                <select
                  className="tt-services-select"
                  value={filters.employment_type}
                  onChange={(e) => patchFilters({ employment_type: e.target.value })}
                >
                  <option value="">ทั้งหมด</option>
                  {BOARD_EMPLOYMENT_TYPES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveFilters && (
                <Button type="button" variant="ghost" onClick={clearFilters}>
                  ล้างตัวกรอง
                </Button>
              )}
            </Card>
          )}
          {!loading && total > 0 && (
            <p className="tt-hint tt-services-board-count">พบ {total} งาน</p>
          )}
        </>
      )}

      {err && <p className="tt-error-inline">{err}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลด Job Board..." />
      ) : activeTab === 'my-applications' ? (
        applications.length === 0 ? (
          <EmptyState
            title="ยังไม่มีใบสมัคร"
            description="สำรวจงานทั้งหมดแล้วกดสนใจงานที่ชอบ"
          />
        ) : (
          <ul className="tt-services-job-list">
            {applications.map((app) => (
              <JobCard
                key={app.id}
                href={`/m/services/board/${app.job_id}`}
                job={{
                  id: app.job_id,
                  title: app.title,
                  category: app.category,
                  min_budget: app.min_budget,
                  max_budget: app.max_budget,
                  duration_days: app.duration_days,
                  status: app.status,
                  applicant_count: 0,
                  employer_name: app.employer_name,
                }}
              />
            ))}
          </ul>
        )
      ) : jobs.length === 0 ? (
        <EmptyState
          title="ยังไม่มีงานในแท็บนี้"
          description={
            activeTab === 'all'
              ? 'ลองเปลี่ยนตัวกรองหรือกลับมาใหม่ภายหลัง'
              : activeTab === 'my-jobs'
                ? 'โพสต์งานโปรเจกต์ใหม่ได้จากปุ่มด้านบน'
                : 'บันทึกงานจากรายละเอียดงานเพื่อดูภายหลัง'
          }
        />
      ) : (
        <ul className="tt-services-job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} href={`/m/services/board/${job.id}`} job={job} />
          ))}
        </ul>
      )}

      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        quotation / counter-offer — sprint 28f+
      </p>
    </div>
  );
}
