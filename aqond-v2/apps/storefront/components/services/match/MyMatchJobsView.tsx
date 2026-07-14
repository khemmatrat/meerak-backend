'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import { AqondButton as Button, AqondCard as Card, AqondChip as StatusChip } from '@aqond/components';
import { useMyMatchJobs } from '@/hooks/services/useMyMatchJobs';
import { categoryLabel } from '@/lib/services/jobCategoryHub';
import { formatJobPrimaryAddress } from '@/lib/services/jobLocationDisplay';
import {
  formatMatchJobPrice,
  matchJobStatusTone,
} from '@/lib/services/matchJobApi';
import {
  MY_MATCH_JOBS_TAB_LABELS,
  type MyMatchJobsTab,
} from '@/lib/services/myMatchJobsFilter';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

const TABS: MyMatchJobsTab[] = ['posted', 'hire', 'working', 'recommended', 'history'];

export function MyMatchJobsView() {
  const {
    jobs,
    loading,
    activeTab,
    setTab,
    showExpired,
    setShowExpired,
    msg,
    userId,
    reload,
  } = useMyMatchJobs();

  if (!userId) {
    return (
      <div className="tt-services-mine">
        <EmptyState
          title="เข้าสู่ระบบก่อน"
          description="ดูงานที่โพสต์และงานที่รับทำได้หลังล็อกอิน"
        />
        <div className="tt-services-empty-actions">
          <Link href="/m/login">
            <Button type="button" variant="primary">
              เข้าสู่ระบบ
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tt-services-mine">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">งานของฉัน</h2>
          <p className="tt-hint">Match Job — งานที่โพสต์ / รับทำ / ประวัติ</p>
        </div>
        <div className="tt-services-mine-head-actions">
          <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
            รีเฟรช
          </button>
          <Link href="/m/services/match/create">
            <Button type="button" variant="primary" style={{ fontSize: '0.85rem' }}>
              + โพสต์งาน
            </Button>
          </Link>
        </div>
      </div>

      <div className="tt-services-mine-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tt-services-pill${activeTab === tab ? ' active' : ''}`}
            onClick={() => setTab(tab)}
          >
            {MY_MATCH_JOBS_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab !== 'history' && activeTab !== 'recommended' && (
        <label className="tt-services-mine-expired">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
          />
          แสดงงานหมดอายุ
        </label>
      )}

      {msg && <p className="tt-error-inline">{msg}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลดงานของคุณ..." />
      ) : activeTab === 'recommended' ? (
        <EmptyState
          title="งานแนะนำ"
          description="ฟีเจอร์แนะนำงานแบบ real-time จะมาใน sprint ถัดไป — ใช้รายการงานทั้งหมดก่อน"
        />
      ) : jobs.length === 0 ? (
        <EmptyState
          title="ยังไม่มีงานในแท็บนี้"
          description={
            activeTab === 'posted'
              ? 'โพสต์งานแรกของคุณเพื่อหาผู้ให้บริการ'
              : 'ลองเปลี่ยนแท็บหรือรีเฟรช'
          }
        />
      ) : (
        <ul className="tt-services-job-list">
          {jobs.map((job) => {
            const statusLabel = String(job.status || 'open');
            const payHref =
              statusLabel === 'waiting_for_payment' &&
              String(job.created_by) === String(userId)
                ? `/m/services/match/payment/${job.id}`
                : null;
            return (
              <li key={job.id}>
                <Link href={`/m/services/match/${job.id}`} className="tt-services-job-card">
                  <Card>
                    <div className="tt-services-job-card-top">
                      <StatusChip tone="default">{categoryLabel(job.category)}</StatusChip>
                      <StatusChip tone={matchJobStatusTone(statusLabel)}>{statusLabel}</StatusChip>
                    </div>
                    <h3 className="tt-services-job-card-title">{job.title}</h3>
                    <p className="tt-services-job-card-desc">{job.description}</p>
                    <div className="tt-services-job-card-foot">
                      <div>
                        <div className="tt-hint">
                          {job.datetime
                            ? new Date(job.datetime).toLocaleString('th-TH')
                            : '—'}
                        </div>
                        <div className="tt-hint">{formatJobPrimaryAddress(job) || 'ไม่ระบุสถานที่'}</div>
                      </div>
                      <span className="tt-services-job-price">{formatMatchJobPrice(job.price)}</span>
                    </div>
                  </Card>
                </Link>
                {payHref && (
                  <Link href={payHref} className="tt-services-mine-pay-link">
                    ชำระเงิน →
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
