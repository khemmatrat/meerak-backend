'use client';

import Link from 'next/link';
import { AqondButton as Button, AqondCard as Card, AqondChip as StatusChip, AqondInput as Input } from '@aqond/components';
import { useManageBoardJob } from '@/hooks/services/useManageBoardJob';
import { boardJobStatusTone } from '@/lib/services/boardJobApi';
import { boardStatusLabel, formatBoardBudget } from '@/lib/services/boardJobTaxonomy';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function ManageBoardJobView({ jobId }: { jobId: string }) {
  const {
    job,
    applicants,
    loading,
    tab,
    setTab,
    patching,
    err,
    msg,
    isEmployer,
    updateApplicant,
    escrowAmount,
    setEscrowAmount,
    breakdown,
    loadBreakdown,
    escrowSubmitting,
    submitEscrow,
    hireAmount,
    setHireAmount,
    reload,
  } = useManageBoardJob(jobId);

  if (loading) {
    return <AxsServicesLoading label="กำลังโหลดการจัดการงาน..." />;
  }

  if (!job) {
    return (
      <div className="tt-services-board-manage">
        <Link href="/m/services/board" className="tt-services-back-link">
          ‹ Job Board
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          {err || 'ไม่พบงานนี้'}
        </p>
      </div>
    );
  }

  if (!isEmployer) {
    return (
      <div className="tt-services-board-manage">
        <Link href={`/m/services/board/${jobId}`} className="tt-services-back-link">
          ‹ รายละเอียดงาน
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          เฉพาะผู้โพสต์งานเท่านั้นที่จัดการได้
        </p>
      </div>
    );
  }

  const hired = applicants.find((a) => a.status === 'hired');
  const escrowHeld = job.escrow_status === 'held' || job.escrow_status === 'released';

  return (
    <div className="tt-services-board-manage">
      <div className="tt-services-detail-head">
        <Link href={`/m/services/board/${jobId}`} className="tt-services-back-link">
          ‹ รายละเอียด
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <Card className="tt-services-detail-card">
        <h2 className="tt-services-detail-title">{job.title}</h2>
        <div className="tt-services-detail-meta">
          <StatusChip tone={boardJobStatusTone(job.status)}>
            {boardStatusLabel(job.status)}
          </StatusChip>
          <StatusChip tone="default">
            {formatBoardBudget(job.min_budget, job.max_budget)}
          </StatusChip>
          {job.escrow_status && job.escrow_status !== 'none' && (
            <StatusChip tone="pending">Escrow: {job.escrow_status}</StatusChip>
          )}
        </div>
      </Card>

      <div className="tt-services-mine-tabs">
        <button
          type="button"
          className={`tt-services-pill${tab === 'applicants' ? ' active' : ''}`}
          onClick={() => setTab('applicants')}
        >
          ผู้สมัคร ({applicants.length})
        </button>
        <button
          type="button"
          className={`tt-services-pill${tab === 'escrow' ? ' active' : ''}`}
          onClick={() => setTab('escrow')}
        >
          Escrow
        </button>
      </div>

      {msg && <p className="tt-success-inline">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {tab === 'applicants' && (
        <div className="tt-services-board-applicants">
          {applicants.length === 0 ? (
            <p className="tt-hint">ยังไม่มีผู้สมัคร — แชร์ลิงก์งานเพื่อหา Talent</p>
          ) : (
            <ul className="tt-services-job-list">
              {applicants.map((a) => (
                <li key={a.id}>
                  <Card className="tt-services-board-applicant-card">
                    <div className="tt-services-job-card-top">
                      <strong>{a.full_name || 'Talent'}</strong>
                      <StatusChip tone={boardJobStatusTone(a.status)}>
                        {boardStatusLabel(a.status)}
                      </StatusChip>
                    </div>
                    <p className="tt-hint">
                      {a.rating != null && `★ ${a.rating.toFixed(1)} · `}
                      งานเสร็จ {a.completed_jobs_count ?? 0}
                      {a.trust_score != null && ` · Trust ${a.trust_score}`}
                    </p>
                    {a.status !== 'hired' && a.status !== 'rejected' && (
                      <label className="tt-services-field" style={{ marginTop: 8 }}>
                        <span>ยอดตกลง (บาท) เมื่อจ้าง</span>
                        <Input
                          type="number"
                          min={1}
                          value={hireAmount[a.user_id] ?? ''}
                          onChange={(e) =>
                            setHireAmount((prev) => ({
                              ...prev,
                              [a.user_id]: e.target.value,
                            }))
                          }
                          placeholder={String(job.max_budget)}
                        />
                      </label>
                    )}
                    {a.status === 'interested' && (
                      <div className="tt-services-board-applicant-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={patching === a.user_id}
                          onClick={() => void updateApplicant(a.user_id, 'shortlisted')}
                        >
                          คัดเลือก
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          disabled={patching === a.user_id}
                          onClick={() => void updateApplicant(a.user_id, 'hired')}
                        >
                          จ้าง
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={patching === a.user_id}
                          onClick={() => void updateApplicant(a.user_id, 'rejected')}
                        >
                          ปฏิเสธ
                        </Button>
                      </div>
                    )}
                    {a.status === 'shortlisted' && (
                      <div className="tt-services-board-applicant-actions">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={patching === a.user_id}
                          onClick={() => void updateApplicant(a.user_id, 'hired')}
                        >
                          จ้าง
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={patching === a.user_id}
                          onClick={() => void updateApplicant(a.user_id, 'rejected')}
                        >
                          ปฏิเสธ
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'escrow' && (
        <Card className="tt-services-create-card">
          {!hired && !job.hired_user_id ? (
            <p className="tt-hint">เลือก Talent จากแท็บผู้สมัครก่อนโอน Escrow</p>
          ) : escrowHeld ? (
            <p className="tt-success-inline">
              โอน Escrow แล้ว — ยอด ฿{Number(job.escrow_amount || 0).toLocaleString('th-TH')}
            </p>
          ) : (
            <>
              <label className="tt-services-field">
                <span>จำนวนเงินโอน Escrow (บาท)</span>
                <Input
                  type="number"
                  min={1}
                  value={escrowAmount}
                  onChange={(e) => setEscrowAmount(e.target.value)}
                />
              </label>
              <div className="tt-services-board-applicant-actions">
                <Button type="button" variant="secondary" onClick={() => void loadBreakdown()}>
                  คำนวณยอดชำระ
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={escrowSubmitting}
                  onClick={() => void submitEscrow()}
                >
                  {escrowSubmitting ? 'กำลังโอน...' : 'โอนเข้า Escrow'}
                </Button>
              </div>
              {breakdown && (
                <dl className="tt-services-detail-facts" style={{ marginTop: 12 }}>
                  <div>
                    <dt>ค่าจ้าง</dt>
                    <dd>฿{breakdown.jobFee.toLocaleString('th-TH')}</dd>
                  </div>
                  <div>
                    <dt>ค่าธรรมเนียมรวม</dt>
                    <dd>
                      ฿
                      {(
                        breakdown.handlingFeeAmount +
                        breakdown.paymentMarkupAmount +
                        breakdown.commissionFeeAmount
                      ).toLocaleString('th-TH')}
                    </dd>
                  </div>
                  <div>
                    <dt>Talent ได้รับ (โดยประมาณ)</dt>
                    <dd>฿{breakdown.talentReceives.toLocaleString('th-TH')}</dd>
                  </div>
                  <div>
                    <dt>ยอดชำระทั้งหมด</dt>
                    <dd className="tt-services-job-price">
                      ฿{breakdown.totalToPay.toLocaleString('th-TH')}
                    </dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </Card>
      )}

      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        แชท / milestone / review — sprint 28f+
      </p>
    </div>
  );
}
