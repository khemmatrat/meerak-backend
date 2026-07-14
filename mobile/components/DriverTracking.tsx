// 🚗 Real-time Driver Tracking Component
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { DriverLocation, Job } from '../types';
import { Navigation, MapPin, Navigation2 } from 'lucide-react';
import { MockApi } from '../services/mockApi';
import LocationService, { ProviderLocation } from '../services/locationService';

// Fix leaflet icons - ใช้วิธีที่ปลอดภัยกว่า
if (typeof window !== 'undefined') {
  // @ts-ignore
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

// 🚗 สร้าง icon ตำแหน่งผู้รับงาน (ใช้รูปจาก public/)
const createCarIcon = (heading: number) => {
  const size = 44;
  const safeHeading = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  const html = `
    <div style="
      width:${size}px;
      height:${size}px;
      display:flex;
      align-items:center;
      justify-content:center;
      transform: rotate(${safeHeading}deg);
      transform-origin: center;
      transition: transform 220ms linear;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.25));
    ">
      <img
        src="/transport/vehicle-tricycle-tuktuk-Photoroom.png"
        style="
          width:${size}px;
          height:${size}px;
          object-fit: contain;
          border-radius: 10px;
          background: transparent;
          mix-blend-mode: multiply;
        "
        alt=""
      />
    </div>
  `;
  return L.divIcon({
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "driver-vehicle-icon",
    popupAnchor: [0, -(size / 2)],
  });
};

// สร้าง icon สำหรับ destination
const createDestinationIcon = () => {
  return L.divIcon({
    html: `<div style="background: #0f172a; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    className: 'destination-icon'
  });
};

interface DriverTrackingProps {
  driverId: string;
  jobId?: string;
  height?: string;
  showControls?: boolean;
  onLocationUpdate?: (location: DriverLocation) => void;
}

const DriverTracking: React.FC<DriverTrackingProps> = ({
  driverId,
  jobId,
  height = '400px',
  showControls = true,
 // initialZoom = 14,
  onLocationUpdate
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const [providerLocation, setProviderLocation] = useState<ProviderLocation | null>(null);
  const [driverHistory, setDriverHistory] = useState<Array<[number, number]>>([]);
  const [jobDetails, setJobDetails] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [center, setCenter] = useState<[number, number]>([13.736717, 100.523186]);
  const [zoom, setZoom] = useState(14);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [distance, setDistance] = useState<number>(0);
  const [eta, setETA] = useState<string>('');

  const computeBearingDeg = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const toDeg = (r: number) => (r * 180) / Math.PI;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δλ = toRad(lng2 - lng1);
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x =
      Math.cos(φ1) * Math.sin(φ2) -
      Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const deg = (toDeg(θ) + 360) % 360;
    return Number.isFinite(deg) ? deg : 0;
  };

  const derivedHeading = (() => {
    const raw = providerLocation?.heading;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n % 360;
    if (driverHistory.length >= 2) {
      const [p1Lat, p1Lng] = driverHistory[driverHistory.length - 2];
      const [p2Lat, p2Lng] = driverHistory[driverHistory.length - 1];
      return computeBearingDeg(p1Lat, p1Lng, p2Lat, p2Lng);
    }
    return 0;
  })();

  // Map controller component
  const MapController = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
    const map = useMap();
    
    useEffect(() => {
      map.setView(center, zoom);
    }, [center, zoom, map]);
    
    return null;
  };

  // 🔥 Real-time Location Subscription (Employer ติดตาม Provider)
  useEffect(() => {
    if (!jobId || !driverId) return;

    setLoading(true);

    // Subscribe to provider's real-time location
    const unsubscribe = LocationService.subscribeToProviderLocation(
      driverId,
      jobId,
      (location) => {
        if (location) {
          setProviderLocation(location);
          setCenter([location.lat, location.lng]);
          setLastUpdate(new Date(location.timestamp).toLocaleTimeString('th-TH'));
          
          // Add to history for path tracking
          setDriverHistory(prev => [...prev.slice(-49), [location.lat, location.lng]]);
          
        }
        setLoading(false);
      }
    );

    return () => {
      unsubscribe();
      console.log('🔕 Unsubscribed from provider location');
    };
  }, [driverId, jobId]);

  // Fetch job details
  useEffect(() => {
    if (!jobId) return;
    
    const fetchJob = async () => {
      try {
        const job = await MockApi.getJobDetails(jobId);
        setJobDetails(job || null);
      } catch (err) {
        console.error('Failed to fetch job:', err);
      }
    };
    
    fetchJob();
  }, [jobId]);

  // Calculate distance and ETA (เมื่อ job มี location เป็น lat/lng)
  useEffect(() => {
    const loc = jobDetails?.location;
    if (providerLocation && loc != null && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      const dist = LocationService.calculateDistance(
        providerLocation.lat,
        providerLocation.lng,
        loc.lat,
        loc.lng
      );
      setDistance(dist);
      const estimatedTime = LocationService.calculateETA(dist, providerLocation.speed || 40);
      setETA(estimatedTime);
    }
  }, [providerLocation, jobDetails]);

  const handleCenterOnProvider = () => {
    if (providerLocation && mapRef.current) {
      mapRef.current.flyTo([providerLocation.lat, providerLocation.lng], 16);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'moving': return 'bg-emerald-100 text-emerald-900';
      case 'stopped': return 'bg-amber-100 text-amber-900';
      case 'arrived': return 'bg-slate-200 text-slate-800';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/40">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
        <p className="text-gray-600">กำลังโหลดตำแหน่งผู้รับงาน...</p>
      </div>
    );
  }

  if (!providerLocation) {
    return (
      <div className="rounded-2xl border border-slate-200/90 bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/40">
        <Navigation2 className="text-gray-400 mx-auto mb-4" size={48} />
        <p className="text-gray-900 font-bold mb-2">ยังไม่มีข้อมูลตำแหน่ง</p>
        <p className="text-gray-600">รอให้ผู้รับงานเปิดแอปและเริ่มการติดตาม</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 shadow-md ring-1 ring-slate-200/40">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white px-4 py-3 sm:p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
          <div className="min-w-0">
            <h3 className="font-semibold text-base sm:text-lg flex items-center gap-2">
              <Navigation className="shrink-0" size={18} />
              <span className="truncate">ติดตามผู้รับงาน (เรียลไทม์)</span>
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm mt-0.5">อัปเดตตำแหน่งอัตโนมัติ</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className={`px-2 py-1 rounded-full text-[10px] sm:text-xs font-bold ${getStatusColor(providerLocation.status)}`}>
              {providerLocation.status === 'moving' ? 'กำลังเดินทาง' : 
               providerLocation.status === 'stopped' ? 'หยุดพัก' : 
               'ถึงที่แล้ว'}
            </span>
            <div className="rounded-full bg-emerald-500 p-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-white"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Leaflet Map */}
      <div className="relative" style={{ height }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          className="z-0 [&_.leaflet-control-attribution]:rounded-t [&_.leaflet-control-attribution]:bg-white/90 [&_.leaflet-control-attribution]:text-[10px]"
        >
          <MapController center={center} zoom={zoom} />
          
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* 🚗 Provider Car Marker with direction */}
          {providerLocation && (
            <Marker
              position={[providerLocation.lat, providerLocation.lng] as LatLngExpression}
              icon={createCarIcon(derivedHeading)}
            >
              <Popup>
                <div className="p-2">
                  <p className="font-bold text-slate-800">ผู้รับงาน</p>
                  <p className="text-sm text-slate-600">ความเร็ว: {Math.round(providerLocation.speed * 3.6)} km/h</p>
                  <p className="text-sm text-slate-600">ทิศทาง: {providerLocation.heading}°</p>
                  <p className="text-xs text-slate-500 mt-1">{lastUpdate}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Driver path history */}
          {driverHistory.length > 1 && (
            <Polyline
              positions={driverHistory}
              pathOptions={{
                color: '#64748b',
                opacity: 0.55,
                weight: 3
              }}
            />
          )}

          {/* Job destination marker — เฉพาะเมื่อ job มี location เป็น { lat, lng } */}
          {jobDetails?.location != null && typeof jobDetails.location.lat === 'number' && typeof jobDetails.location.lng === 'number' && (
            <Marker
              position={[jobDetails.location.lat, jobDetails.location.lng] as LatLngExpression}
              icon={createDestinationIcon()}
            >
              <Popup>
                <div className="p-2">
                  <p className="font-bold">Destination</p>
                  <p className="text-sm">{jobDetails.title}</p>
                  <a 
                    href={`/jobs/${jobDetails.id}`}
                    className="text-emerald-700 text-sm hover:underline"
                  >
                    View Job →
                  </a>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route line from provider to job destination */}
          {providerLocation && jobDetails?.location != null && typeof jobDetails.location.lat === 'number' && typeof jobDetails.location.lng === 'number' && (
            <Polyline
              positions={[
                [providerLocation.lat, providerLocation.lng],
                [jobDetails.location.lat, jobDetails.location.lng]
              ]}
              pathOptions={{
                color: '#059669',
                opacity: 0.55,
                weight: 3,
                dashArray: '8, 8'
              }}
            />
          )}
        </MapContainer>

        {/* Controls */}
        {showControls && (
          <div className="absolute bottom-4 right-4 z-[1000] flex flex-col space-y-2">
            <button
              onClick={handleCenterOnProvider}
              className="bg-white p-3 rounded-full shadow-lg hover:shadow-xl transition-shadow"
              title="ติดตามผู้รับงาน"
            >
              <Navigation size={22} className="text-emerald-700" />
            </button>
          </div>
        )}

        {/* แถบสรุปบนแผนที่ — โทนเดียวกับแอป */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-14 z-[1000] flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur-sm">
          <span className="font-semibold tabular-nums text-slate-900">
            {Math.round((providerLocation.speed || 0) * 3.6)} km/h
          </span>
          <span className="text-slate-300">·</span>
          <span className="tabular-nums">{lastUpdate || "—"}</span>
          {distance > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{distance.toFixed(1)} km</span>
              <span className="text-slate-300">·</span>
              <span className="tabular-nums">{eta}</span>
            </>
          )}
        </div>
      </div>

      {/* Footer — สรุปแบบเดียวกับแถบบนแผนที่ ไม่ใช้หลายสี */}
      <div className="border-t border-slate-200/90 bg-white p-4">
        <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3 text-center">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">ความเร็ว</div>
            <div className="text-lg font-semibold tabular-nums text-slate-900">
              {Math.round((providerLocation.speed || 0) * 3.6)}
              <span className="text-xs font-normal text-slate-500"> km/h</span>
            </div>
          </div>
          <div className="border-x border-slate-200/80">
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">ระยะทาง</div>
            <div className="text-lg font-semibold tabular-nums text-slate-900">
              {distance > 0 ? distance.toFixed(1) : "—"}
              <span className="text-xs font-normal text-slate-500"> km</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">เวลาโดยประมาณ</div>
            <div className="text-base font-semibold tabular-nums text-slate-900">{eta || "—"}</div>
          </div>
        </div>

        {jobDetails && (
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">จุดหมายปลายทาง</p>
                <p className="truncate font-semibold text-slate-900">{jobDetails.title}</p>
                <p className="text-sm font-semibold text-emerald-700">฿{Number(jobDetails.price ?? 0).toLocaleString()}</p>
              </div>
              <a
                href={`#/jobs/${jobDetails.id}`}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                ดูงาน
              </a>
            </div>
            {jobDetails.location != null && typeof jobDetails.location.lat === 'number' && typeof jobDetails.location.lng === 'number' && (
              <div className="mt-2 flex items-center text-xs text-slate-500">
                <MapPin size={12} className="mr-1 shrink-0" />
                {jobDetails.location.lat.toFixed(4)}, {jobDetails.location.lng.toFixed(4)}
              </div>
            )}
          </div>
        )}

        <div
          className={`mt-4 rounded-lg border px-3 py-2.5 text-center text-sm font-semibold ${
            providerLocation.status === "moving"
              ? "border-emerald-200/80 bg-emerald-50 text-emerald-900"
              : providerLocation.status === "stopped"
                ? "border-amber-200/80 bg-amber-50 text-amber-900"
                : "border-slate-200/80 bg-slate-100 text-slate-800"
          }`}
        >
          {providerLocation.status === "moving"
            ? "กำลังเดินทางมา"
            : providerLocation.status === "stopped"
              ? "หยุดพักชั่วคราว"
              : "มาถึงจุดหมายแล้ว"}
        </div>
      </div>
    </div>
  );
};

export default DriverTracking;