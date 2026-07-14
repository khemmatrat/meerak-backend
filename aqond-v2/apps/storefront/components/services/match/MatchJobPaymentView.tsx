'use client';

import Link from 'next/link';
import { AqondButton as Button, AqondCard as Card } from '@aqond/components';
import { useMatchJobPayment } from '@/hooks/services/useMatchJobPayment';
import { formatMatchJobPrice } from '@/lib/services/matchJobApi';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function MatchJobPaymentView({ jobId }: { jobId: string }) {
  const {
    job,
    loading,
    paying,
    intent,
    err,
    msg,
    hasInsurance,
    setHasInsurance,
    isEmployer,
    canPay,
    startPayment,
    reload,
  } = useMatchJobPayment(jobId);

  if (loading) {
    return <AxsServicesLoading label="กำลังโหลดข้อมูลการชำระเงิน..." />;
  }

  if (!job) {
    return (
      <div className="tt-services-payment">
        <Link href="/m/services/match" className="tt-services-back-link">
          ‹ กลับ
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          {err || 'ไม่พบงานนี้'}
        </p>
      </div>
    );
  }

  return (
    <div className="tt-services-payment">
      <div className="tt-services-detail-head">
        <Link href={`/m/services/match/${jobId}`} className="tt-services-back-link">
          ‹ รายละเอียดงาน
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <Card className="tt-services-detail-card">
        <h2 className="tt-services-detail-title">ชำระเงิน Match Job</h2>
        <p className="tt-services-detail-desc">{job.title}</p>

        <dl className="tt-services-detail-facts">
          <div>
            <dt>ยอดชำระ</dt>
            <dd className="tt-services-job-price">{formatMatchJobPrice(job.price)}</dd>
          </div>
          <div>
            <dt>สถานะงาน</dt>
            <dd>{String(job.status)}</dd>
          </div>
        </dl>

        {!isEmployer && (
          <p className="tt-error-inline">เฉพาะผู้จ้างงานเท่านั้นที่ชำระเงินได้</p>
        )}

        {isEmployer && !canPay && (
          <p className="tt-hint">งานนี้ยังไม่อยู่ในสถานะที่ต้องชำระเงิน</p>
        )}

        {canPay && (
          <>
            <label className="tt-services-mine-expired" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={hasInsurance}
                onChange={(e) => setHasInsurance(e.target.checked)}
              />
              รวมประกันงาน (ถ้ามี)
            </label>
            <Button
              type="button"
              variant="primary"
              disabled={paying}
              onClick={() => void startPayment()}
              style={{ width: '100%', marginTop: 12 }}
            >
              {paying ? 'กำลังสร้างรายการ...' : 'สร้างรายการชำระเงิน (Stripe)'}
            </Button>
          </>
        )}

        {msg && <p className="tt-success-inline" style={{ marginTop: 12 }}>{msg}</p>}
        {err && <p className="tt-error-inline" style={{ marginTop: 12 }}>{err}</p>}

        {intent?.clientSecret && (
          <div className="tt-services-payment-intent">
            <p className="tt-hint">Payment Intent สร้างแล้ว</p>
            {intent.amountThb != null && (
              <p>
                <strong>ยอด:</strong> ฿{intent.amountThb.toLocaleString('th-TH')}
              </p>
            )}
            {intent.paymentIntentId && (
              <p className="tt-hint" style={{ wordBreak: 'break-all' }}>
                ID: {intent.paymentIntentId}
              </p>
            )}
            <p className="tt-hint">
              ขั้นตอนถัดไป: ใช้ Stripe Elements หรือแอปมือถือเพื่อชำระด้วย client secret
              (เต็มรูปแบบใน sprint ถัดไป)
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
