'use client';

import Link from 'next/link';
import { AqondButton as Button, AqondCard as Card, AqondChip as StatusChip } from '@aqond/components';
import { useMatchJobDetail } from '@/hooks/services/useMatchJobDetail';
import { categoryLabel } from '@/lib/services/jobCategoryHub';
import { formatJobPrimaryAddress } from '@/lib/services/jobLocationDisplay';
import { formatMatchJobPrice, matchJobStatusTone } from '@/lib/services/matchJobApi';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function MatchJobDetailView({ jobId }: { jobId: string }) {
  const { job, loading, err, msg, accepting, canAccept, accept, reload } = useMatchJobDetail(jobId);

  if (loading) {
    return <AxsServicesLoading label="กำลังโหลดรายละเอียดงาน..." />;
  }

  if (!job) {
    return (
      <div className="tt-services-match-detail">
        <Link href="/m/services/match" className="tt-link-accent">
          ← กลับรายการงาน
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          {err || 'ไม่พบงานนี้'}
        </p>
      </div>
    );
  }

  const statusLabel = String(job.status || 'open');

  return (
    <div className="tt-services-match-detail">
      <div className="tt-services-detail-head">
        <Link href="/m/services/match" className="tt-services-back-link">
          ‹ รายการงาน
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <Card className="tt-services-detail-card">
        <div className="tt-services-detail-meta">
          <StatusChip tone={matchJobStatusTone(statusLabel)}>{statusLabel}</StatusChip>
          <StatusChip tone="default">{categoryLabel(job.category)}</StatusChip>
        </div>
        <h2 className="tt-services-detail-title">{job.title}</h2>
        <p className="tt-services-detail-desc">{job.description}</p>

        <dl className="tt-services-detail-facts">
          <div>
            <dt>ค่าจ้าง</dt>
            <dd className="tt-services-job-price">{formatMatchJobPrice(job.price)}</dd>
          </div>
          <div>
            <dt>วันเวลา</dt>
            <dd>
              {job.datetime
                ? new Date(job.datetime).toLocaleString('th-TH')
                : '—'}
            </dd>
          </div>
          <div>
            <dt>สถานที่</dt>
            <dd>{formatJobPrimaryAddress(job) || 'ไม่ระบุสถานที่'}</dd>
          </div>
          {job.created_by_name && (
            <div>
              <dt>ผู้จ้าง</dt>
              <dd>{job.created_by_name}</dd>
            </div>
          )}
          {job.accepted_by_name && (
            <div>
              <dt>ผู้รับงาน</dt>
              <dd>{job.accepted_by_name}</dd>
            </div>
          )}
        </dl>
      </Card>

      {msg && <p className="tt-merchant-ok">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {canAccept && (
        <Button
          type="button"
          variant="primary"
          className="tt-services-accept-btn"
          disabled={accepting}
          onClick={() => void accept()}
          style={{ width: '100%', marginTop: 12 }}
        >
          {accepting ? 'กำลังรับงาน…' : 'รับงานนี้'}
        </Button>
      )}

      {!canAccept && statusLabel === 'open' && (
        <p className="tt-hint" style={{ marginTop: 12, textAlign: 'center' }}>
          <Link href={`/m/login?next=/m/services/match/${jobId}`}>เข้าสู่ระบบ</Link> เพื่อรับงาน
        </p>
      )}

      {(statusLabel === 'waiting_for_payment' ||
        statusLabel === 'waiting_for_approval') && (
        <Link href={`/m/services/match/payment/${jobId}`} style={{ display: 'block', marginTop: 12 }}>
          <Button type="button" variant="primary" style={{ width: '100%' }}>
            ไปหน้าชำระเงิน
          </Button>
        </Link>
      )}

      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        แชท / proof / dispute — sprint ถัดไป
      </p>
    </div>
  );
}
