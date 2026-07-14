// ProviderMap — แผนที่แสดงงานใกล้เคียง + ตำแหน่งปักหมุดของผู้รับงาน
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { icon, LatLngExpression } from "leaflet";
import { Job } from "../types";
import { MapPin, Navigation } from "lucide-react";
import "leaflet/dist/leaflet.css";

import L from "leaflet";
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface ProviderMapProps {
  jobs?: Job[];
  currentLocation?: { lat: number; lng: number };
  pinnedLocation?: { lat: number; lng: number; address?: string } | null;
  draftPickLocation?: { lat: number; lng: number } | null;
  onMapPick?: (lat: number, lng: number) => void;
  acceptedJob?: Job | null;
  onJobSelect?: (job: Job) => void;
  onNavigateToJob?: (job: Job) => void;
  height?: string;
  showControls?: boolean;
  jobSearchMode?: boolean; // โหมดหางาน — เลื่อนเพื่อเปิด
  /** แสดงวงเรดาร์ค้นหางาน (สไตล์ LINE MAN) */
  radarOverlay?: boolean;
}

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

const ProviderMap: React.FC<ProviderMapProps> = ({
  jobs = [],
  currentLocation = { lat: 13.736717, lng: 100.523186 },
  pinnedLocation = null,
  draftPickLocation = null,
  onMapPick,
  acceptedJob = null,
  onJobSelect,
  onNavigateToJob,
  height = "400px",
  showControls = true,
  jobSearchMode = true,
  radarOverlay = false,
}) => {
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const onMapReady = useCallback((map: L.Map) => setMapInstance(map), []);
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

  const pickEnabled = Boolean(onMapPick);

  /** ต้อง encode SVG ทั้งก้อน — ถ้าใส่ fill="#hex" ใน data URL โดยตรง ตัว # จะตัด URL ทำให้ไอคอนแตกและเห็นรูป placeholder */
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
      provider: createIcon("#64748b", 32),
      pinned: createIcon("#475569", 30),
      jobOpen: createIcon("#ca8a04", 26),
      jobAccepted: createIcon("#059669", 26),
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
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLoc([p.coords.latitude, p.coords.longitude]),
        () => {},
      );
    }
  }, []);

  const jobsWithLocation = useMemo(
    () =>
      jobs.filter((j) => {
        const loc = (j as any).location;
        return (
          loc && typeof loc === "object" && loc.lat != null && loc.lng != null
        );
      }),
    [jobs],
  );

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
    ({
      lat: currentLocation.lat,
      lng: currentLocation.lng,
    } as { lat: number; lng: number; address?: string });

  const showSearchAnchorPin =
    Boolean(onMapPick) || pinnedLocation != null || draftPickLocation != null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50 shadow-md ring-1 ring-slate-200/40 ${pickEnabled ? "[&_.leaflet-container]:cursor-crosshair" : ""}`}
    >
      {radarOverlay && jobSearchMode && (
        <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div
            className="absolute h-48 w-48 rounded-full border-2 border-emerald-400/50 bg-emerald-400/5 animate-ping"
            style={{ animationDuration: "2.4s" }}
          />
          <div
            className="absolute h-72 w-72 rounded-full border border-teal-400/35 bg-teal-400/[0.03] animate-ping"
            style={{ animationDuration: "3.2s", animationDelay: "0.4s" }}
          />
          <div className="absolute h-3 w-3 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 ring-4 ring-white" />
        </div>
      )}
      {showControls && (
        <div className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
          <button
            onClick={goToMyLocation}
            className="p-2 bg-white rounded-lg shadow-md hover:bg-gray-50"
            title="ตำแหน่งของฉัน"
          >
            <Navigation size={18} className="text-blue-600" />
          </button>
        </div>
      )}

      <div className="absolute bottom-2 left-2 z-[400] rounded-lg border border-slate-200/90 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-600" />
          <span>ตำแหน่งปักหมุดของคุณ</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          <span>งานว่าง</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
          <span>งานที่รับแล้ว</span>
        </div>
      </div>

      <div style={{ height, width: "100%" }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: "100%", width: "100%" }}
          className="z-0 [&_.leaflet-control-attribution]:rounded-t [&_.leaflet-control-attribution]:bg-white/90 [&_.leaflet-control-attribution]:text-[10px]"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <MapController center={center} zoom={zoom} onMapReady={onMapReady} />
          {pickEnabled && onMapPick ? (
            <MapTapToPickHandler enabled={pickEnabled} onPick={onMapPick} />
          ) : null}

          {/* หมุดโฟกัสการค้นหา Jobs Near You — ซ่อนถ้าเป็นแผนที่ดูพิกัดงานอย่างเดียว */}
          {showSearchAnchorPin && (
            <Marker
              position={
                [effectivePin.lat, effectivePin.lng] as LatLngExpression
              }
              icon={icons.pinned}
            >
              <Popup>
                <div className="font-semibold text-purple-700 flex items-center gap-1">
                  <MapPin size={14} />
                  {draftPickLocation
                    ? "จุดที่เลือกบนแผนที่"
                    : "ตำแหน่งปักหมุดของคุณ"}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {effectivePin.lat.toFixed(6)}, {effectivePin.lng.toFixed(6)}
                </div>
                {draftPickLocation && (
                  <div className="text-xs text-amber-800 mt-1">
                    กดเริ่มรับงานเพื่อบันทึกจุดนี้และเปิดรับงาน
                  </div>
                )}
                {!draftPickLocation && pinnedLocation?.address ? (
                  <div className="text-xs text-gray-500 mt-1">
                    {pinnedLocation.address}
                  </div>
                ) : null}
              </Popup>
            </Marker>
          )}

          {/* GPS เมื่อต่างจากหมุดค้นหา — มีเฉพาะเมื่อมีหมุดโฟกัส */}
          {showSearchAnchorPin &&
            userLoc != null &&
            (Math.abs(userLoc[0] - effectivePin.lat) > 0.002 ||
              Math.abs(userLoc[1] - effectivePin.lng) > 0.002) && (
              <Marker
                position={userLoc as LatLngExpression}
                icon={icons.provider}
              >
                <Popup>
                  <div className="font-semibold text-slate-800">
                    ตำแหน่ง GPS ของอุปกรณ์
                  </div>
                </Popup>
              </Marker>
            )}

          {/* งาน */}
          {jobsWithLocation.map((job) => {
            const loc = (job as any).location;
            const lat = loc?.lat ?? 0;
            const lng = loc?.lng ?? 0;
            const isAccepted = acceptedJob?.id === job.id;
            if (!lat || !lng) return null;
            return (
              <Marker
                key={`job-${job.id}`}
                position={[lat, lng] as LatLngExpression}
                icon={isAccepted ? icons.jobAccepted : icons.jobOpen}
                eventHandlers={{
                  click: () => onJobSelect?.(job),
                }}
              >
                <Popup>
                  <div className="p-2 max-w-xs">
                    <h3 className="font-bold text-gray-900 mb-1">
                      {job.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {job.description}
                    </p>
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-emerald-600">
                        ฿{job.price}
                      </span>
                      <span className="text-xs text-gray-500">
                        {job.category}
                      </span>
                    </div>
                    {onJobSelect && (
                      <button
                        onClick={() => onJobSelect(job)}
                        className="w-full py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                      >
                        ดูรายละเอียด
                      </button>
                    )}
                    {onNavigateToJob && (
                      <button
                        onClick={() => onNavigateToJob(job)}
                        className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      >
                        <Navigation size={14} /> นำทาง
                      </button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default ProviderMap;
