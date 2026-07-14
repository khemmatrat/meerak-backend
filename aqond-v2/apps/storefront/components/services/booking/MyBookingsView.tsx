'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import { AqondButton as Button, AqondCard as Card, AqondChip as StatusChip } from '@aqond/components';
import { useMyBookings } from '@/hooks/services/useMyBookings';
import { bookingStatusTone } from '@/lib/services/bookingApi';
import { bookingStatusLabel } from '@/lib/services/bookingTaxonomy';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function MyBookingsView() {
  const {
    bookings,
    loading,
    activeTab,
    setTab,
    actingId,
    err,
    msg,
    userId,
    confirmBooking,
    cancelBooking,
    payDeposit,
    reload,
  } = useMyBookings();

  if (!userId) {
    return (
      <div className="tt-services-booking-mine">
        <EmptyState title="เข้าสู่ระบบก่อน" description="ดูและจัดการการจองได้หลังล็อกอิน" />
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
    <div className="tt-services-booking-mine">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">การจองของฉัน</h2>
          <p className="tt-hint">คำขอจองและคิวที่รับงาน</p>
        </div>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <div className="tt-services-mine-tabs">
        <button
          type="button"
          className={`tt-services-pill${activeTab === 'my-requests' ? ' active' : ''}`}
          onClick={() => setTab('my-requests')}
        >
          ที่ฉันจอง
        </button>
        <button
          type="button"
          className={`tt-services-pill${activeTab === 'incoming' ? ' active' : ''}`}
          onClick={() => setTab('incoming')}
        >
          คิวขาเข้า (Talent)
        </button>
      </div>

      {msg && <p className="tt-success-inline">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {loading ? (
        <AxsServicesLoading label="กำลังโหลดการจอง..." />
      ) : bookings.length === 0 ? (
        <EmptyState
          title="ยังไม่มีรายการ"
          description={
            activeTab === 'my-requests'
              ? 'เลือก Talent และจองคิวจากหน้า Talents'
              : 'ยังไม่มีคำขอจองเข้ามา'
          }
        />
      ) : (
        <ul className="tt-services-job-list">
          {bookings.map((b) => {
            const counterparty =
              activeTab === 'incoming' ? b.booker_name : b.talent_name;
            const canPay =
              activeTab === 'my-requests' &&
              b.status === 'confirmed' &&
              b.deposit_status !== 'held' &&
              b.deposit_amount > 0;
            const canConfirm = activeTab === 'incoming' && b.status === 'pending';
            return (
              <li key={b.id}>
                <Card className="tt-services-board-applicant-card">
                  <div className="tt-services-job-card-top">
                    <strong>{counterparty || '—'}</strong>
                    <StatusChip tone={bookingStatusTone(b.status)}>
                      {bookingStatusLabel(b.status)}
                    </StatusChip>
                  </div>
                  <p className="tt-hint">
                    {new Date(b.start_time).toLocaleString('th-TH')} –{' '}
                    {new Date(b.end_time).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                  {b.deposit_amount > 0 && (
                    <p className="tt-hint">
                      มัดจำ ฿{b.deposit_amount.toLocaleString('th-TH')} ({b.deposit_status})
                    </p>
                  )}
                  <div className="tt-services-board-applicant-actions">
                    {canConfirm && (
                      <>
                        <Button
                          type="button"
                          variant="primary"
                          disabled={actingId === b.id}
                          onClick={() => void confirmBooking(b.id)}
                        >
                          ยืนยัน
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={actingId === b.id}
                          onClick={() => void cancelBooking(b.id)}
                        >
                          ปฏิเสธ
                        </Button>
                      </>
                    )}
                    {canPay && (
                      <Button
                        type="button"
                        variant="primary"
                        disabled={actingId === b.id}
                        onClick={() => void payDeposit(b.id)}
                      >
                        ชำระมัดจำ
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="tt-hint" style={{ marginTop: 16, textAlign: 'center' }}>
        แชท / check-in QR / beauty flow — sprint 28g+
      </p>
    </div>
  );
}
