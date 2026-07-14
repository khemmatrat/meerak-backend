'use client';

import Link from 'next/link';
import { AqondButton as Button, AqondCard as Card, AqondInput as Input } from '@aqond/components';
import { useBookingTalentDetail } from '@/hooks/services/useBookingTalentDetail';
import { expertCategoryLabel } from '@/lib/services/bookingTaxonomy';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function BookingTalentDetailView({ talentId }: { talentId: string }) {
  const {
    profile,
    slots,
    loading,
    booking,
    selectedSlot,
    setSelectedSlot,
    depositAmount,
    setDepositAmount,
    err,
    msg,
    submitBooking,
    reload,
  } = useBookingTalentDetail(talentId);

  if (loading) {
    return <AxsServicesLoading label="กำลังโหลดโปรไฟล์..." />;
  }

  if (!profile) {
    return (
      <div className="tt-services-booking-detail">
        <Link href="/m/services/booking/talents" className="tt-services-back-link">
          ‹ Talents
        </Link>
        <p className="tt-error-inline" style={{ marginTop: 16 }}>
          {err || 'ไม่พบโปรไฟล์'}
        </p>
      </div>
    );
  }

  const displayName = profile.name || profile.full_name || 'Talent';

  return (
    <div className="tt-services-booking-detail">
      <div className="tt-services-detail-head">
        <Link href="/m/services/booking/talents" className="tt-services-back-link">
          ‹ Talents
        </Link>
        <button type="button" className="tt-merchant-refresh" onClick={() => void reload()}>
          รีเฟรช
        </button>
      </div>

      <Card className="tt-services-detail-card">
        <div className="tt-services-talent-detail-head">
          <div className="tt-services-talent-avatar tt-services-talent-avatar-lg">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" />
            ) : (
              <span>{displayName.charAt(0)}</span>
            )}
          </div>
          <div>
            <h2 className="tt-services-detail-title">{displayName}</h2>
            <p className="tt-hint">{expertCategoryLabel(profile.expert_category)}</p>
            {profile.rating != null && (
              <p className="tt-hint">★ {profile.rating.toFixed(1)}</p>
            )}
          </div>
        </div>
        {profile.signature_service && (
          <p className="tt-services-detail-desc">{profile.signature_service}</p>
        )}
        {profile.the_journey && (
          <>
            <h3 className="tt-services-board-section-title">เส้นทาง</h3>
            <p className="tt-services-detail-desc">{profile.the_journey}</p>
          </>
        )}
      </Card>

      <h3 className="tt-services-board-section-title">คิวว่าง</h3>
      {slots.length === 0 ? (
        <p className="tt-hint">ยังไม่มีช่วงเวลาว่าง — กลับมาใหม่ภายหลัง</p>
      ) : (
        <ul className="tt-services-booking-slots">
          {slots.map((slot) => (
            <li key={slot.id}>
              <button
                type="button"
                className={`tt-services-booking-slot${selectedSlot?.id === slot.id ? ' active' : ''}`}
                onClick={() => setSelectedSlot(slot)}
              >
                <span>
                  {new Date(slot.start_time).toLocaleString('th-TH', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
                <span className="tt-hint">
                  ถึง{' '}
                  {new Date(slot.end_time).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedSlot && (
        <Card className="tt-services-create-card" style={{ marginTop: 12 }}>
          <p className="tt-hint">จองคิวที่เลือก</p>
          <label className="tt-services-field">
            <span>มัดจำ (บาท)</span>
            <Input
              type="number"
              min={1}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={booking}
            onClick={() => void submitBooking()}
            style={{ width: '100%' }}
          >
            {booking ? 'กำลังจอง...' : 'ส่งคำขอจอง'}
          </Button>
        </Card>
      )}

      {msg && <p className="tt-success-inline">{msg}</p>}
      {err && <p className="tt-error-inline">{err}</p>}

      {msg && (
        <Link href="/m/services/booking/mine" style={{ display: 'block', marginTop: 12 }}>
          <Button type="button" variant="secondary" style={{ width: '100%' }}>
            ไป My Bookings
          </Button>
        </Link>
      )}
    </div>
  );
}
