'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AqondButton as Button, AqondCard as Card, AqondChip as StatusChip } from '@aqond/components';
import { useBoardJobDetail } from '@/hooks/services/useBoardJobDetail';
import { boardJobStatusTone } from '@/lib/services/boardJobApi';
import {
  boardCategoryLabel,
  boardEmploymentLabel,
  boardStatusLabel,
  formatBoardBudget,
} from '@/lib/services/boardJobTaxonomy';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

function CollapsibleText({ text, maxChars = 320 }: { text: string; maxChars?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return <p className="tt-hint">—</p>;
  const needs = text.length > maxChars;
  const display = expanded || !needs ? text : `${text.slice(0, maxChars).trim()}…`;
  return (
    <div>
      <p className="tt-services-detail-desc" style={{ whiteSpace: 'pre-wrap' }}>
        {display}
      </p>
      {needs && (
        <button type="button" className="tt-link-accent" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'ย่อ' : 'อ่านต่อ'}
        </button>
      )}
    </div>
  );
}

export function BoardJobDetailView({ jobId }: { jobId: string }) {
  const {
    job,
    loading,
    applying,
    saving,
    saved,
    err,
    msg,
    isEmployer,
    canApply,
    apply,
    toggleSave,
    reload,
  } = useBoardJobDetail(jobId);

  if (loading) {
    return <AxsServicesLoading label="กำลังโหลดรายละเอียดงาน..." />;
  }

  if (!job) {
    return (
      <div className="tt-services-board-detail">
        <Link href="/m/services/board" className="tt-services-back-link">
          ‹ Job Board
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          {err || 'ไม่พบงานนี้'}
        </p>
      </div>
    );
  }

  const trust = job.employer_trust_score ?? 0;

  return (
    <div className="tt-services-board-detail">
      <div className="tt-services-detail-head">
        <Link href="/m/services/board" className="tt-services-back-link">
          ‹ Job Board
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <Card className="tt-services-detail-card">
        <div className="tt-services-detail-meta">
          <StatusChip tone={boardJobStatusTone(job.status)}>
            {boardStatusLabel(job.status)}
          </StatusChip>
          <StatusChip tone="default">{boardCategoryLabel(job.category)}</StatusChip>
          {job.is_platinum_priority && (
            <StatusChip tone="pending">Platinum</StatusChip>
          )}
        </div>

        <h2 className="tt-services-detail-title">{job.title}</h2>

        <div className="tt-services-board-snapshot">
          <span>{formatBoardBudget(job.min_budget, job.max_budget)}</span>
          <span>{job.duration_days} วัน</span>
          {job.target_province && <span>{job.target_province}</span>}
          {job.employment_type && (
            <span>{boardEmploymentLabel(job.employment_type)}</span>
          )}
        </div>

        <dl className="tt-services-detail-facts">
          <div>
            <dt>ผู้จ้าง</dt>
            <dd>{job.employer_name || 'ผู้จ้าง'}</dd>
          </div>
          <div>
            <dt>ความน่าเชื่อถือ</dt>
            <dd>{trust}/100</dd>
          </div>
          <div>
            <dt>ผู้สมัคร</dt>
            <dd>{job.applicant_count} คน</dd>
          </div>
          {job.view_count != null && (
            <div>
              <dt>การดู</dt>
              <dd>{job.view_count}</dd>
            </div>
          )}
        </dl>

        <h3 className="tt-services-board-section-title">รายละเอียด</h3>
        <CollapsibleText text={job.description} />

        <h3 className="tt-services-board-section-title">ขอบเขตงาน</h3>
        <CollapsibleText text={job.scope} />
      </Card>

      {msg && <p className="tt-success-inline">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      <div className="tt-services-board-detail-actions">
        {!isEmployer && (
          <Button
            type="button"
            variant="secondary"
            disabled={saving}
            onClick={() => void toggleSave()}
          >
            {saving ? '...' : saved ? 'ยกเลิกบันทึก' : 'บันทึกงาน'}
          </Button>
        )}
        {canApply && (
          <Button
            type="button"
            variant="primary"
            disabled={applying}
            onClick={() => void apply()}
            style={{ flex: 1 }}
          >
            {applying ? 'กำลังส่ง...' : 'สนใจงาน / ส่งข้อเสนอ'}
          </Button>
        )}
        {isEmployer && (
          <Link href={`/m/services/board/${jobId}/manage`} style={{ display: 'block', marginTop: 12 }}>
            <Button type="button" variant="primary" style={{ width: '100%' }}>
              จัดการงาน / ผู้สมัคร
            </Button>
          </Link>
        )}
        {!canApply && !isEmployer && job.status !== 'open' && (
          <p className="tt-hint" style={{ width: '100%', textAlign: 'center' }}>
            งานนี้ปิดรับข้อเสนอแล้ว
          </p>
        )}
      </div>
    </div>
  );
}
