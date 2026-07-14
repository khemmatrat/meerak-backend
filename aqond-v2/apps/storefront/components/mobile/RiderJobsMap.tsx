'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import type { RiderJob } from '@/lib/rider';
import { mapPointToCoords, mapPointToPercent, routeCurvePath } from '@/lib/foodTracking';

type JobPin = RiderJob & {
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_lat?: number;
  dropoff_lng?: number;
};

type Props = {
  jobs: JobPin[];
  selectedId?: string | null;
  onSelect?: (job: JobPin) => void;
};

const BKK = { lat: 13.736717, lng: 100.523186 };

function jobBounds(jobs: JobPin[], rider?: { lat: number; lng: number }) {
  const pts: { lat: number; lng: number }[] = [];
  if (rider) pts.push(rider);
  for (const j of jobs) {
    if (j.pickup_lat != null && j.pickup_lng != null) pts.push({ lat: j.pickup_lat, lng: j.pickup_lng });
    if (j.dropoff_lat != null && j.dropoff_lng != null) pts.push({ lat: j.dropoff_lat, lng: j.dropoff_lng });
  }
  if (!pts.length) {
    return {
      minLat: BKK.lat - 0.01,
      maxLat: BKK.lat + 0.01,
      minLng: BKK.lng - 0.01,
      maxLng: BKK.lng + 0.01,
    };
  }
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const pad = 0.004;
  return {
    minLat: Math.min(...lats) - pad,
    maxLat: Math.max(...lats) + pad,
    minLng: Math.min(...lngs) - pad,
    maxLng: Math.max(...lngs) + pad,
  };
}

export function RiderJobsMap({ jobs, selectedId, onSelect }: Props) {
  const uid = useId().replace(/:/g, '');
  const [riderPos, setRiderPos] = useState(BKK);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setRiderPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setRiderPos(BKK),
      { enableHighAccuracy: false, maximumAge: 30000 },
    );
  }, []);

  const bounds = useMemo(() => jobBounds(jobs, riderPos), [jobs, riderPos]);
  const riderStyle = mapPointToPercent(riderPos, bounds);

  const selected = jobs.find((j) => j.id === selectedId) || jobs[0] || null;

  const selectedRoute = useMemo(() => {
    if (!selected?.pickup_lat || !selected.pickup_lng || !selected.dropoff_lat || !selected.dropoff_lng) {
      return null;
    }
    const from = mapPointToCoords({ lat: selected.pickup_lat, lng: selected.pickup_lng }, bounds);
    const to = mapPointToCoords({ lat: selected.dropoff_lat, lng: selected.dropoff_lng }, bounds);
    return { from, to, path: routeCurvePath(from, to) };
  }, [selected, bounds]);

  return (
    <div className="tt-rider-jobs-map-wrap">
      <div className="tt-rider-jobs-map-head">
        <span className="tt-rider-map-title">งานใกล้คุณ</span>
        <span className="tt-rider-live-badge">
          <span className="tt-rider-live-dot" aria-hidden />
          {jobs.length} งาน
        </span>
      </div>

      <div className="tt-rider-jobs-map" aria-label="แผนที่งานส่งของ">
        <div className="tt-rider-map-terrain" aria-hidden />
        <div className="tt-rider-jobs-radar" style={riderStyle} aria-hidden>
          <span className="tt-rider-jobs-radar-ring" />
          <span className="tt-rider-jobs-radar-ring delay" />
          <span className="tt-rider-jobs-radar-core">🛵</span>
        </div>

        {selectedRoute && (
          <svg className="tt-rider-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <path d={selectedRoute.path} className="tt-route-base" pathLength={100} vectorEffect="non-scaling-stroke" />
            <path
              d={selectedRoute.path}
              className="tt-route-active"
              pathLength={100}
              vectorEffect="non-scaling-stroke"
              style={{ strokeDasharray: '100 100' }}
            />
          </svg>
        )}

        {jobs.map((j) => {
          if (j.pickup_lat == null || j.pickup_lng == null) return null;
          const style = mapPointToPercent({ lat: j.pickup_lat, lng: j.pickup_lng }, bounds);
          const active = j.id === (selectedId || selected?.id);
          return (
            <button
              key={j.id}
              type="button"
              className={`tt-rider-jobs-pin${active ? ' on' : ''}`}
              style={style}
              onClick={() => onSelect?.(j)}
              aria-label={`งาน ${j.merchant_name || j.order_id}`}
            >
              <span className="tt-rider-jobs-pin-bubble">{j.job_type === 'parcel' ? '📦' : '🍽️'}</span>
            </button>
          );
        })}

        {selected?.dropoff_lat != null && selected.dropoff_lng != null && (
          <div
            className="tt-map-pin home"
            style={mapPointToPercent({ lat: selected.dropoff_lat, lng: selected.dropoff_lng }, bounds)}
          >
            <span className="tt-map-pin-bubble home">🏠</span>
          </div>
        )}
      </div>

      {selected && (
        <p className="tt-rider-jobs-map-hint">
          {selected.merchant_name || 'ร้าน'} → {selected.address || 'จุดส่ง'}
        </p>
      )}
    </div>
  );
}
