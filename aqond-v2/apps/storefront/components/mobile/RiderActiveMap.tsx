'use client';

import { useId, useMemo } from 'react';
import { mapPointToCoords, mapPointToPercent, routeCurvePath } from '@/lib/foodTracking';

type Props = {
  pickup: { lat: number; lng: number; label?: string };
  dropoff: { lat: number; lng: number; label?: string };
  rider?: { lat: number; lng: number };
  phase?: string;
};

export function RiderActiveMap({ pickup, dropoff, rider, phase }: Props) {
  const uid = useId().replace(/:/g, '');
  const bounds = {
    minLat: Math.min(pickup.lat, dropoff.lat, rider?.lat ?? pickup.lat) - 0.003,
    maxLat: Math.max(pickup.lat, dropoff.lat, rider?.lat ?? pickup.lat) + 0.003,
    minLng: Math.min(pickup.lng, dropoff.lng, rider?.lng ?? pickup.lng) - 0.003,
    maxLng: Math.max(pickup.lng, dropoff.lng, rider?.lng ?? pickup.lng) + 0.003,
  };

  const shop = mapPointToCoords(pickup, bounds);
  const home = mapPointToCoords(dropoff, bounds);
  const riderPt = rider ? mapPointToCoords(rider, bounds) : null;
  const shopStyle = mapPointToPercent(pickup, bounds);
  const homeStyle = mapPointToPercent(dropoff, bounds);
  const riderStyle = rider ? mapPointToPercent(rider, bounds) : null;
  const pathD = useMemo(() => routeCurvePath(shop, home), [shop, home]);

  const navLabel =
    phase === 'rider_assigned' || phase === 'finding_rider' || phase === 'food_ready'
      ? 'นำทางไปร้าน'
      : 'นำทางไปลูกค้า';

  const openNav = () => {
    const target =
      phase === 'rider_assigned' || phase === 'finding_rider' || phase === 'food_ready'
        ? pickup
        : dropoff;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`,
      '_blank',
    );
  };

  return (
    <div className="tt-rider-active-map-wrap">
      <div className="tt-rider-jobs-map-head">
        <span className="tt-rider-map-title">{navLabel}</span>
        <button type="button" className="tt-rider-nav-ext-btn" onClick={openNav}>
          เปิดแผนที่ ↗
        </button>
      </div>
      <div className="tt-rider-jobs-map" style={{ height: 200 }}>
        <div className="tt-rider-map-terrain" aria-hidden />
        <svg className="tt-rider-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <path d={pathD} className="tt-route-base" pathLength={100} vectorEffect="non-scaling-stroke" />
          <path
            d={pathD}
            className="tt-route-active"
            pathLength={100}
            vectorEffect="non-scaling-stroke"
            style={{ strokeDasharray: '60 100' }}
          />
        </svg>
        <div className="tt-map-pin shop" style={shopStyle}>
          <span className="tt-map-pin-bubble shop">🍽️</span>
        </div>
        <div className="tt-map-pin home" style={homeStyle}>
          <span className="tt-map-pin-bubble home">🏠</span>
        </div>
        {riderStyle && (
          <div className="tt-map-pin rider" style={riderStyle}>
            <span className="tt-map-pin-bubble rider">🛵</span>
          </div>
        )}
      </div>
      <p className="tt-rider-jobs-map-hint">
        {pickup.label || 'ร้าน'} → {dropoff.label || 'ลูกค้า'}
      </p>
    </div>
  );
}
