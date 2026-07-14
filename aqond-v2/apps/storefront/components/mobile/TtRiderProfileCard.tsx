'use client';

import type { RiderProfile, RiderTrackingView } from '@/lib/server/riderTracking';

type Props = {
  rider: RiderProfile;
  tracking: RiderTrackingView;
  onChat: () => void;
  onCall?: () => void;
};

export function TtRiderProfileCard({ rider, tracking, onChat, onCall }: Props) {
  if (!tracking.show_rider_profile) {
    if (tracking.phase === 'finding_rider') {
      return (
        <div className="tt-rider-finding-v2">
          <div className="tt-rider-finding-rings" aria-hidden>
            <span /><span /><span />
          </div>
          <div>
            <strong>กำลังหาไรเดอร์ที่ดีที่สุด</strong>
            <p>จับคู่ตามระยะทาง · คะแนน · อัตราส่งสำเร็จ</p>
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="tt-rider-profile-v2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={rider.avatar_url} alt="" className="tt-rider-avatar-v2" />
      <div className="tt-rider-profile-v2-body">
        <div className="tt-rider-profile-v2-top">
          <strong>{rider.name}</strong>
          <span className="tt-rider-grade-pill">{rider.grade}</span>
        </div>
        <p className="tt-rider-profile-v2-vehicle">
          {rider.vehicle} ทะเบียน <b>{rider.plate}</b>
        </p>
        <p className="tt-rider-profile-v2-rating">
          ⭐ {rider.rating} <span>({rider.review_count.toLocaleString()} รีวิว)</span>
        </p>
      </div>
      {tracking.can_chat && (
        <div className="tt-rider-profile-v2-actions">
          {onCall && (
            <button type="button" className="tt-rider-v2-btn call" onClick={onCall}>
              โทร
            </button>
          )}
          <button type="button" className="tt-rider-v2-btn chat" onClick={onChat}>
            แชท
          </button>
        </div>
      )}
    </div>
  );
}
