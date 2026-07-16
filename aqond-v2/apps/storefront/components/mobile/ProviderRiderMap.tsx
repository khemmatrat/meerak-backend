'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import { icon, LatLngExpression } from 'leaflet';
import L from 'leaflet';
import type { RiderMapJob } from '@/lib/riderMapJobs';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

type Props = {
  jobs?: RiderMapJob[];
  currentLocation?: { lat: number; lng: number };
  pinnedLocation?: { lat: number; lng: number; address?: string } | null;
  draftPickLocation?: { lat: number; lng: number } | null;
  onMapPick?: (lat: number, lng: number) => void;
  acceptedJob?: RiderMapJob | null;
  onJobSelect?: (job: RiderMapJob) => void;
  height?: string;
  jobSearchMode?: boolean;
  radarOverlay?: boolean;
  embedded?: boolean;
};

const MapController: React.FC<{
  center: [number, number];
  zoom: number;
  onMapReady?: (map: L.Map) => void;
}> = ({ center, zoom, onMapReady }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  useEffect(() => {
    onMapReady?.(map);
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [map, onMapReady]);
  return null;
};

const MapTapToPickHandler: React.FC<{
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}> = ({ enabled, onPick }) => {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

function parseMapHeightPx(height: string, fallback = 240): number {
  const m = height.match(/(\d+)\s*px/);
  return m ? Number(m[1]) : fallback;
}

export function ProviderRiderMap({
  jobs = [],
  currentLocation = { lat: 13.736717, lng: 100.523186 },
  pinnedLocation = null,
  draftPickLocation = null,
  onMapPick,
  acceptedJob = null,
  onJobSelect,
  height = '240px',
  jobSearchMode = true,
  radarOverlay = false,
  embedded = false,
}: Props) {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapHostRef = useRef<HTMLDivElement>(null);
  const onMapReady = useCallback((map: L.Map) => setMapInstance(map), []);
  const mapHeightPx = parseMapHeightPx(height, 240);

  const resolveFocus = useCallback(() => {
    const loc = draftPickLocation ?? pinnedLocation ?? currentLocation;
    return [loc.lat, loc.lng] as [number, number];
  }, [draftPickLocation, pinnedLocation, currentLocation]);

  const [center, setCenter] = useState<[number, number]>(() => {
    const loc = draftPickLocation ?? pinnedLocation ?? currentLocation;
    return [loc.lat, loc.lng];
  });
  const [zoom, setZoom] = useState(13);
  const [userLoc, setUserLoc] = useState<[number, number] | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mapInstance || !mapHostRef.current) return;
    const ro = new ResizeObserver(() => {
      mapInstance.invalidateSize();
    });
    ro.observe(mapHostRef.current);
    return () => ro.disconnect();
  }, [mapInstance]);

  const pickEnabled = Boolean(onMapPick);

  const createIcon = (color: string, size = 28) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
    return icon({
      iconUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  };

  const icons = useMemo(
    () => ({
      provider: createIcon('#64748b', 32),
      pinned: createIcon('#475569', 30),
      jobOpen: createIcon('#ca8a04', 26),
      jobAccepted: createIcon('#059669', 26),
    }),
    [],
  );

  useEffect(() => {
    setCenter(resolveFocus());
  }, [
    draftPickLocation?.lat,
    draftPickLocation?.lng,
    pinnedLocation?.lat,
    pinnedLocation?.lng,
    currentLocation.lat,
    currentLocation.lng,
    resolveFocus,
  ]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setUserLoc([p.coords.latitude, p.coords.longitude]),
      () => {},
    );
  }, []);

  const goToMyLocation = () => {
    const loc = userLoc || [currentLocation.lat, currentLocation.lng];
    setCenter(loc);
    setZoom(14);
    mapInstance?.flyTo(loc, 14);
    onMapPick?.(loc[0], loc[1]);
  };

  const effectivePin =
    draftPickLocation ??
    pinnedLocation ??
    ({ lat: currentLocation.lat, lng: currentLocation.lng } as {
      lat: number;
      lng: number;
      address?: string;
    });

  const showSearchAnchorPin =
    Boolean(onMapPick) || pinnedLocation != null || draftPickLocation != null;

  const mapLayers = (
    <>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      <MapController center={center} zoom={zoom} onMapReady={onMapReady} />
      {pickEnabled && onMapPick ? (
        <MapTapToPickHandler enabled={pickEnabled} onPick={onMapPick} />
      ) : null}

      {showSearchAnchorPin && (
        <Marker
          position={[effectivePin.lat, effectivePin.lng] as LatLngExpression}
          icon={icons.pinned}
        >
          <Popup>
            <div className="font-semibold text-emerald-800">
              {draftPickLocation ? 'จุดที่เลือกบนแผนที่' : 'ตำแหน่งปักหมุดของคุณ'}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {effectivePin.lat.toFixed(6)}, {effectivePin.lng.toFixed(6)}
            </div>
          </Popup>
        </Marker>
      )}

      {showSearchAnchorPin &&
        userLoc != null &&
        (Math.abs(userLoc[0] - effectivePin.lat) > 0.002 ||
          Math.abs(userLoc[1] - effectivePin.lng) > 0.002) && (
          <Marker position={userLoc as LatLngExpression} icon={icons.provider}>
            <Popup>ตำแหน่ง GPS ของอุปกรณ์</Popup>
          </Marker>
        )}

      {jobs.map((job) => {
        const { lat, lng } = job.location;
        if (!lat || !lng) return null;
        const isAccepted = acceptedJob?.id === job.id;
        return (
          <Marker
            key={`job-${job.id}`}
            position={[lat, lng] as LatLngExpression}
            icon={isAccepted ? icons.jobAccepted : icons.jobOpen}
            eventHandlers={{ click: () => onJobSelect?.(job) }}
          >
            <Popup>
              <div className="p-2 max-w-xs">
                <h3 className="font-bold text-gray-900 mb-1">{job.title}</h3>
                <p className="text-sm text-gray-600 mb-2 line-clamp-2">{job.description}</p>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-emerald-600">฿{job.price}</span>
                  <span className="text-xs text-gray-500">{job.category}</span>
                </div>
                {onJobSelect && (
                  <button
                    type="button"
                    onClick={() => onJobSelect(job)}
                    className="w-full py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    ดูรายละเอียด
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );

  if (!mounted) {
    return (
      <div className="ros-map-loading" style={{ height: mapHeightPx }}>
        กำลังโหลดแผนที่…
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="ros-map-shell">
        <div className="ros-map-shell-head">
          <div className="ros-map-shell-title">
            <span className="ros-map-shell-icon" aria-hidden>
              🗺️
            </span>
            <div>
              <p className="ros-map-shell-label">แผนที่งานใกล้คุณ</p>
              {jobSearchMode && radarOverlay ? (
                <p className="ros-map-shell-sub">กำลังค้นหางานในพื้นที่…</p>
              ) : (
                <p className="ros-map-shell-sub">แตะแผนที่เพื่อปักหมุดรับงาน</p>
              )}
            </div>
          </div>
          <button
            type="button"
            className="ros-map-gps-btn"
            onClick={goToMyLocation}
            title="ตำแหน่งของฉัน"
            aria-label="ตำแหน่งของฉัน"
          >
            ⌖
          </button>
        </div>

        <div
          ref={mapHostRef}
          className="ros-map-shell-body"
          style={{ height: mapHeightPx }}
        >
          {radarOverlay && jobSearchMode && (
            <div className="ros-map-radar" aria-hidden>
              <span className="ros-map-radar-ring" />
              <span className="ros-map-radar-ring delay" />
              <span className="ros-map-radar-core" />
            </div>
          )}
          <MapContainer
            center={center}
            zoom={zoom}
            className="ros-map-leaflet"
            style={{ height: '100%', width: '100%' }}
          >
            {mapLayers}
          </MapContainer>
        </div>

        <div className="ros-map-legend">
          <span className="ros-map-legend-item">
            <i className="dot slate" /> ปักหมุดของคุณ
          </span>
          <span className="ros-map-legend-item">
            <i className="dot amber" /> งานว่าง
          </span>
          <span className="ros-map-legend-item">
            <i className="dot emerald" /> รับแล้ว
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`tt-provider-rider-map relative overflow-hidden rounded-2xl border border-emerald-100 bg-slate-50 shadow-md ${
        pickEnabled ? '[&_.leaflet-container]:cursor-crosshair' : ''
      }`}
      style={{ minHeight: mapHeightPx }}
    >
      {radarOverlay && jobSearchMode && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div className="ros-map-radar-ring absolute h-48 w-48 rounded-full border-2 border-emerald-400/50 bg-emerald-400/5 animate-ping" />
        </div>
      )}

      <div className="absolute top-2 right-2 z-[1000]">
        <button type="button" onClick={goToMyLocation} className="ros-map-gps-btn">
          ⌖
        </button>
      </div>

      <div ref={mapHostRef} style={{ height: mapHeightPx, width: '100%' }}>
        <MapContainer
          center={center}
          zoom={zoom}
          className="ros-map-leaflet"
          style={{ height: '100%', width: '100%' }}
        >
          {mapLayers}
        </MapContainer>
      </div>
    </div>
  );
}
