'use client';

import { useId, useMemo } from 'react';
import type { RiderTrackingView } from '@/lib/server/riderTracking';
import { mapPointToCoords, mapPointToPercent, routeCurvePath } from '@/lib/foodTracking';

type Props = {
  tracking: RiderTrackingView;
};

function shortLabel(text: string, max = 22) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function TtRiderLiveMap({ tracking }: Props) {
  const uid = useId().replace(/:/g, '');
  const bounds = {
    minLat: Math.min(tracking.restaurant.lat, tracking.destination.lat) - 0.002,
    maxLat: Math.max(tracking.restaurant.lat, tracking.destination.lat) + 0.002,
    minLng: Math.min(tracking.restaurant.lng, tracking.destination.lng) - 0.002,
    maxLng: Math.max(tracking.restaurant.lng, tracking.destination.lng) + 0.002,
  };

  const shop = mapPointToCoords(tracking.restaurant, bounds);
  const home = mapPointToCoords(tracking.destination, bounds);
  const shopStyle = mapPointToPercent(tracking.restaurant, bounds);
  const homeStyle = mapPointToPercent(tracking.destination, bounds);
  const riderStyle = mapPointToPercent(tracking.rider_pos, bounds);

  const pathD = useMemo(() => routeCurvePath(shop, home), [shop, home]);
  const progressPct = Math.round(tracking.progress * 100);
  const isLive =
    !tracking.delivered &&
    tracking.phase !== 'completed' &&
    tracking.phase !== 'review_pending';

  const showRiderOnRoute =
    tracking.show_rider && tracking.phase !== 'finding_rider';

  return (
    <div className="tt-rider-map-wrap">
      <div className="tt-rider-map-card">
        <div className="tt-rider-map-head">
          <span className="tt-rider-map-title">เส้นทางจัดส่ง</span>
          {isLive ? (
            <span className="tt-rider-live-badge">
              <span className="tt-rider-live-dot" aria-hidden />
              LIVE
            </span>
          ) : (
            <span className="tt-rider-map-done-badge">ส่งแล้ว</span>
          )}
        </div>

        <div className="tt-rider-map" aria-label="แผนที่ติดตามไรเดอร์">
          <div className="tt-rider-map-terrain" aria-hidden />
          <div className="tt-rider-map-glow" aria-hidden />

          <svg
            className="tt-rider-map-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <linearGradient id={`route-base-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.18)" />
              </linearGradient>
              <linearGradient id={`route-active-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#0ecb81" />
                <stop offset="100%" stopColor="#fcd535" />
              </linearGradient>
              <filter id={`route-glow-${uid}`}>
                <feGaussianBlur stdDeviation="1.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <path
              d={pathD}
              className="tt-route-shadow"
              pathLength={100}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={pathD}
              className="tt-route-base"
              stroke={`url(#route-base-${uid})`}
              pathLength={100}
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={pathD}
              className="tt-route-active"
              stroke={`url(#route-active-${uid})`}
              pathLength={100}
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: `${progressPct} 100` }}
              filter={`url(#route-glow-${uid})`}
            />
          </svg>

          <div className="tt-map-pin shop" style={shopStyle}>
            <span className="tt-map-pin-bubble shop">🍽️</span>
            <span className="tt-map-pin-label">ร้าน</span>
          </div>

          <div className="tt-map-pin home" style={homeStyle}>
            <span className="tt-map-pin-bubble home">🏠</span>
            <span className="tt-map-pin-label">คุณ</span>
          </div>

          {tracking.phase === 'finding_rider' && (
            <div className="tt-map-finding" style={shopStyle}>
              <span className="tt-map-finding-ring" aria-hidden />
              <span className="tt-map-finding-ring delay" aria-hidden />
              <span className="tt-map-finding-icon">🔍</span>
            </div>
          )}

          {showRiderOnRoute && (
            <div
              className={`tt-map-pin rider${tracking.delivered ? ' delivered' : ''}`}
              style={riderStyle}
            >
              {!tracking.delivered && (
                <span className="tt-map-rider-pulse" aria-hidden />
              )}
              <span className="tt-map-pin-bubble rider">
                {tracking.rider.vehicle}
              </span>
            </div>
          )}
        </div>

        <div className="tt-rider-map-route-bar">
          <div className="tt-route-stop from">
            <span className="tt-route-stop-dot shop" aria-hidden />
            <div className="tt-route-stop-text">
              <span className="tt-route-stop-kind">จากร้าน</span>
              <strong>{shortLabel(tracking.merchant_name, 28)}</strong>
            </div>
          </div>
          <div className="tt-route-mid">
            <span className="tt-route-mid-line" aria-hidden />
            {isLive && tracking.minutes_left > 0 && (
              <span className="tt-route-mid-eta">~{tracking.minutes_left} นาที</span>
            )}
          </div>
          <div className="tt-route-stop to">
            <span className="tt-route-stop-dot home" aria-hidden />
            <div className="tt-route-stop-text">
              <span className="tt-route-stop-kind">ถึงที่อยู่</span>
              <strong>{shortLabel(tracking.address, 32)}</strong>
            </div>
          </div>
        </div>
      </div>

      {tracking.active_events.length > 0 && (
        <div className="tt-rider-events">
          {tracking.active_events.map((e) => (
            <span key={e} className="tt-rider-event-chip">
              {e}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
