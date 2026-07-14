// src/components/EmployerMap.tsx (แบบ Leaflet ที่ถูกต้อง)
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";

import { icon, LatLngExpression, LatLng } from "leaflet";
import {
  EmployerLocation,
  Job,
  DriverLocation,
  JobLocation,
  Location,
} from "../types";
import {
  Filter,
  Search,
  Navigation,
  Layers,
  Users,
  Briefcase,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import "leaflet/dist/leaflet.css";
import { reverseGeocodeOSM } from "../context/reverseGeocodeOSM";

// Fix for default icons in Leaflet
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

interface ClickToAddMarkerProps {
  onSelect: (lat: number, lng: number) => void;
  markerIcon?: ReturnType<typeof icon>;
}

const ClickToAddMarker: React.FC<ClickToAddMarkerProps> = ({ onSelect, markerIcon }) => {
  const [position, setPosition] = useState<LatLng | null>(null);

  useMapEvents({
    click(e) {
      if (!onSelect) return;
      setPosition(e.latlng);
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!position) return null;

  return (
    <Marker position={position} icon={markerIcon}>
      <Popup>
        ตำแหน่งที่เลือก
        <br />
        Lat: {position.lat.toFixed(6)}
        <br />
        Lng: {position.lng.toFixed(6)}
      </Popup>
    </Marker>
  );
};

interface EmployerMapProps {
  employers?: EmployerLocation[];
  jobs?: Job[];
  drivers?: DriverLocation[];
  onEmployerSelect?: (employer: EmployerLocation) => void;
  onJobSelect?: (job: Job) => void;
  onDriverSelect?: (driver: DriverLocation) => void;

  onPickLocation?: (location: JobLocation) => void;
  enablePick?: boolean; // ⭐ สำคัญ
  height?: string;
  showControls?: boolean;
  initialZoom?: number;
}

// Component เพื่อควบคุม map จากภายนอก
const MapController = ({
  center,
  zoom,
}: {
  center: [number, number];
  zoom: number;
}) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);

  return null;
};

const EmployerMap: React.FC<EmployerMapProps> = ({
  employers = [],
  jobs = [],
  drivers = [],
  onEmployerSelect,
  onJobSelect,
  onDriverSelect,
  onPickLocation,
  enablePick = false, // ✅ default false
  height = "500px",
  showControls = true,
  initialZoom = 12,
}) => {
  const { t } = useLanguage();
  const mapRef = useRef<L.Map | null>(null);
  const [selectedItem, setSelectedItem] = useState<{
    type: "employer" | "job" | "driver";
    data: any;
  } | null>(null);
  const [center, setCenter] = useState<[number, number]>([
    13.736717, 100.523186,
  ]);
  const [zoom, setZoom] = useState(initialZoom);
  const [showEmployers, setShowEmployers] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [showDrivers, setShowDrivers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState({
    search: true,
    filters: true,
    controls: false,
    legend: false,
    stats: true,
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );

  // Custom icons
  const svgDataUrl = (svg: string) =>
    `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  const createIcon = (color: string, size: number = 25) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="${size}px" height="${size}px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
    return icon({
      iconUrl: svgDataUrl(svg),
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  };

  /** Icon สำหรับจุดที่ผู้ใช้เลือก (สื่อว่า “ฉันอยู่ตรงนี้”) — inline SVG ไม่พึ่ง asset ภายนอก */
  const createPersonHereIcon = (size: number = 36) => {
    const color = "#ec4899"; // pink-500
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">` +
      `<path d="M32 62c-10-12-18-24-18-34C14 15.85 22.95 7 34 7s20 8.85 20 21c0 10-8 22-18 34z" fill="${color}"/>` +
      `<circle cx="34" cy="28" r="10" fill="white"/>` +
      `<path d="M34 26a5 5 0 1 0 0 .01" fill="${color}"/>` +
      `<path d="M26 44c2.5-5 8-8 16-8s13.5 3 16 8" fill="white" opacity="0.95"/>` +
      `</svg>`;
    return icon({
      iconUrl: svgDataUrl(svg),
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  };

  const filteredEmployers = useMemo(() => {
    if (!searchQuery) return employers;
    const q = searchQuery.toLowerCase();
    return employers.filter(
      (emp) =>
        emp.name.toLowerCase().includes(q) ||
        emp.address.toLowerCase().includes(q) ||
        emp.category?.toLowerCase().includes(q)
    );
  }, [employers, searchQuery]);

  const filteredJobs = useMemo(() => {
    if (!searchQuery) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (job) =>
        job.title.toLowerCase().includes(q) ||
        job.description.toLowerCase().includes(q) ||
        job.category.toLowerCase().includes(q)
    );
  }, [jobs, searchQuery]);

  const filteredDrivers = useMemo(() => {
    if (!searchQuery) return drivers;
    const q = searchQuery.toLowerCase();
    return drivers.filter(
      (driver) =>
        driver.driverName.toLowerCase().includes(q) ||
        driver.vehicleType?.toLowerCase().includes(q)
    );
  }, [drivers, searchQuery]);

  const userLocationIcon = useMemo(() => createIcon("#64748b", 35), []);
  const pickedHereIcon = useMemo(() => createPersonHereIcon(40), []);
  const icons = useMemo(
    () => ({
      employer: createIcon("#475569", 30),
      employerVerified: createIcon("#059669", 35),
      jobOpen: createIcon("#ca8a04", 28),
      jobInProgress: createIcon("#b45309", 28),
      jobCompleted: createIcon("#047857", 28),
      driverAvailable: createIcon("#059669", 25),
      driverOnJob: createIcon("#475569", 25),
      driverOffline: createIcon("#94a3b8", 22),
    }),
    []
  );

  // Initialize map
  useEffect(() => {
    // Try to get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLoc: [number, number] = [
            position.coords.latitude,
            position.coords.longitude,
          ];
          setUserLocation(userLoc);
          setCenter(userLoc);
          setZoom(14);
        },
        () => {
          console.log("Unable to get user location");
        }
      );
    }
  }, []);

  const handleMarkerClick = (
    type: "employer" | "job" | "driver",
    data: any
  ) => {
    setSelectedItem({ type, data });

    // Call callback
    if (type === "employer" && onEmployerSelect) {
      onEmployerSelect(data);
    } else if (type === "job" && onJobSelect) {
      onJobSelect(data);
    } else if (type === "driver" && onDriverSelect) {
      onDriverSelect(data);
    }
  };

  const handleUserLocationClick = () => {
    if (userLocation) {
      setCenter(userLocation);
      setZoom(14);
      if (mapRef.current) {
        mapRef.current.flyTo(userLocation, 14);
      }
    }
  };

  const handleResetView = () => {
    const defaultCenter: [number, number] = [13.736717, 100.523186];
    setCenter(defaultCenter);
    setZoom(initialZoom);
    if (mapRef.current) {
      mapRef.current.flyTo(defaultCenter, initialZoom);
    }
  };

  const getJobIcon = (job: Job) => {
    switch (job.status) {
      case "OPEN":
        return icons.jobOpen;
      case "IN_PROGRESS":
        return icons.jobInProgress;
      case "COMPLETED":
        return icons.jobCompleted;
      default:
        return icons.jobOpen;
    }
  };

  const getDriverIcon = (driver: DriverLocation) => {
    switch (driver.status) {
      case "available":
        return icons.driverAvailable;
      case "on_job":
        return icons.driverOnJob;
      case "offline":
        return icons.driverOffline;
      default:
        return icons.driverAvailable;
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Render Popup content
  const renderPopupContent = (
    type: "employer" | "job" | "driver",
    data: any
  ) => {
    switch (type) {
      case "employer":
        const employer = data as EmployerLocation;
        return (
          <div className="p-2 max-w-xs">
            <div className="flex items-center mb-2">
              <img
                src={
                  employer.avatarUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    employer.name
                  )}&background=0f172a&color=fff`
                }
                alt={employer.name}
                className="w-10 h-10 rounded-full mr-3"
              />
              <div>
                <h3 className="font-bold text-gray-900">{employer.name}</h3>
                {employer.isVerified && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-900">
                    ✓ Verified
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-2">{employer.address}</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-50 p-2 rounded">
                <div className="font-semibold text-blue-700">Total Jobs</div>
                <div className="text-lg font-bold">{employer.jobCount}</div>
              </div>
              <div className="bg-green-50 p-2 rounded">
                <div className="font-semibold text-green-700">Active</div>
                <div className="text-lg font-bold">{employer.activeJobs}</div>
              </div>
            </div>
            <button
              onClick={() =>
                (window.location.href = `/employer/${employer.id}`)
              }
              className="w-full mt-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              View Details
            </button>
          </div>
        );

      case "job":
        const job = data as Job;
        return (
          <div className="p-2 max-w-xs">
            <h3 className="font-bold text-gray-900 mb-1">{job.title}</h3>
            <p className="text-sm text-gray-600 mb-2 truncate">
              {job.description}
            </p>
            <div className="flex justify-between items-center mb-3">
              <span
                className={`px-2 py-1 rounded text-xs font-bold ${
                  job.status === "OPEN"
                    ? "bg-amber-100 text-amber-900"
                    : job.status === "IN_PROGRESS"
                    ? "bg-orange-100 text-orange-900"
                    : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {job.status.replace("_", " ")}
              </span>
              <span className="font-bold text-emerald-600">฿{job.price}</span>
            </div>
            <button
              onClick={() => (window.location.href = `/jobs/${job.id}`)}
              className="w-full py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
            >
              View Job
            </button>
          </div>
        );

      case "driver":
        const driver = data as DriverLocation;
        return (
          <div className="p-2 max-w-xs">
            <div className="flex items-center mb-2">
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
                  driver.driverName
                )}&background=047857&color=fff`}
                alt={driver.driverName}
                className="w-10 h-10 rounded-full mr-3"
              />
              <div>
                <h3 className="font-bold text-gray-900">{driver.driverName}</h3>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                    driver.status === "available"
                      ? "bg-green-100 text-green-800"
                      : driver.status === "on_job"
                      ? "bg-red-100 text-red-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {driver.status.replace("_", " ")}
                </span>
              </div>
            </div>
            {driver.vehicleType && (
              <p className="text-sm text-gray-600 mb-2">
                {driver.vehicleType}{" "}
                {driver.vehiclePlate ? `(${driver.vehiclePlate})` : ""}
              </p>
            )}
            {driver.currentJobId && (
              <p className="text-sm text-slate-700 mb-2">
                On job: {driver.currentJobId.substring(0, 8)}...
              </p>
            )}
            {driver.speed && (
              <p className="text-sm text-gray-600">
                Speed: {driver.speed} km/h
              </p>
            )}
          </div>
        );
    }
  };

  // Main render
  return (
    <div className={`flex flex-col lg:flex-row gap-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-white p-4' : ''}`}>
      {/* Left Control Panel - ด้านนอกแผนที่ */}
      {showControls && !isFullscreen && (
        <div className="lg:w-80 flex-shrink-0 space-y-4">
          {/* Search Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => toggleSection('search')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-t-xl"
            >
              <div className="flex items-center">
                <Search className="mr-2 text-gray-500" size={20} />
                <h3 className="font-semibold text-gray-800">ค้นหา</h3>
              </div>
              {expandedSections.search ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {expandedSections.search && (
              <div className="p-4 pt-0">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={t("jobs.search") || "ค้นหาผู้จ้าง, งาน..."}
                    className="w-full rounded-lg border border-slate-300 py-3 pl-4 pr-4 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <Search className="absolute right-3 top-3.5 text-gray-400" size={18} />
                </div>
              </div>
            )}
          </div>

          {/* Filter Toggles Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => toggleSection('filters')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-t-xl"
            >
              <div className="flex items-center">
                <Filter className="mr-2 text-gray-500" size={20} />
                <h3 className="font-semibold text-gray-800">ตัวกรองข้อมูล</h3>
              </div>
              {expandedSections.filters ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {expandedSections.filters && (
              <div className="p-4 pt-0 space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-slate-200/90 bg-slate-50 p-3">
                  <div className="flex items-center">
                    <Users className="mr-3 text-slate-600" size={18} />
                    <div>
                      <div className="font-medium text-gray-800">ผู้จ้างงาน</div>
                      <div className="text-sm text-gray-600">{employers.length} รายการ</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowEmployers(!showEmployers)}
                    className={`flex h-6 w-12 items-center rounded-full p-1 transition-colors ${showEmployers ? 'justify-end bg-emerald-600' : 'justify-start bg-slate-300'}`}
                  >
                    <div className="h-4 w-4 rounded-full bg-white"></div>
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200/90 bg-slate-50 p-3">
                  <div className="flex items-center">
                    <Briefcase className="mr-3 text-amber-700" size={18} />
                    <div>
                      <div className="font-medium text-gray-800">งาน</div>
                      <div className="text-sm text-gray-600">{jobs.length} รายการ</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowJobs(!showJobs)}
                    className={`flex h-6 w-12 items-center rounded-full p-1 transition-colors ${showJobs ? 'justify-end bg-amber-600' : 'justify-start bg-slate-300'}`}
                  >
                    <div className="h-4 w-4 rounded-full bg-white"></div>
                  </button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200/90 bg-slate-50 p-3">
                  <div className="flex items-center">
                    <Navigation className="mr-3 text-emerald-700" size={18} />
                    <div>
                      <div className="font-medium text-gray-800">คนขับ</div>
                      <div className="text-sm text-gray-600">{drivers.length} รายการ</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowDrivers(!showDrivers)}
                    className={`flex h-6 w-12 items-center rounded-full p-1 transition-colors ${showDrivers ? 'justify-end bg-emerald-600' : 'justify-start bg-slate-300'}`}
                  >
                    <div className="w-4 h-4 bg-white rounded-full"></div>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Map Controls Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => toggleSection('controls')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-t-xl"
            >
              <div className="flex items-center">
                <Layers className="mr-2 text-gray-500" size={20} />
                <h3 className="font-semibold text-gray-800">ควบคุมแผนที่</h3>
              </div>
              {expandedSections.controls ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {expandedSections.controls && (
              <div className="p-4 pt-0 space-y-2">
                <button
                  onClick={handleUserLocationClick}
                  disabled={!userLocation}
                  className="w-full flex items-center p-3 text-left rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Navigation className="mr-3 text-emerald-700" size={18} />
                  <div>
                    <div className="font-medium text-gray-800">ตำแหน่งของฉัน</div>
                    <div className="text-sm text-gray-600">ไปที่ตำแหน่งปัจจุบัน</div>
                  </div>
                </button>

                <button
                  onClick={handleResetView}
                  className="w-full flex items-center p-3 text-left rounded-lg hover:bg-gray-50"
                >
                  <MapPin className="mr-3 text-purple-600" size={18} />
                  <div>
                    <div className="font-medium text-gray-800">ตำแหน่งเริ่มต้น</div>
                    <div className="text-sm text-gray-600">รีเซ็ตมุมมองแผนที่</div>
                  </div>
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="w-full flex items-center p-3 text-left rounded-lg hover:bg-gray-50"
                >
                  {isFullscreen ? (
                    <Minimize2 className="mr-3 text-gray-600" size={18} />
                  ) : (
                    <Maximize2 className="mr-3 text-gray-600" size={18} />
                  )}
                  <div>
                    <div className="font-medium text-gray-800">
                      {isFullscreen ? "ออกจากเต็มหน้าจอ" : "เต็มหน้าจอ"}
                    </div>
                    <div className="text-sm text-gray-600">แสดงแผนที่เต็มหน้าจอ</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Stats Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
            <button
              onClick={() => toggleSection('stats')}
              className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-t-xl"
            >
              <div className="flex items-center">
                <AlertCircle className="mr-2 text-gray-500" size={20} />
                <h3 className="font-semibold text-gray-800">สถิติ</h3>
              </div>
              {expandedSections.stats ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {expandedSections.stats && (
              <div className="p-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200/80 bg-slate-50 p-4 text-center">
                    <div className="text-2xl font-bold text-slate-800">{employers.length}</div>
                    <div className="mt-1 text-sm text-slate-600">ผู้จ้างงาน</div>
                  </div>
                  <div className="rounded-lg border border-amber-200/60 bg-amber-50/80 p-4 text-center">
                    <div className="text-2xl font-bold text-amber-900">{jobs.length}</div>
                    <div className="mt-1 text-sm text-slate-600">งาน</div>
                  </div>
                  <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/80 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-800">{drivers.length}</div>
                    <div className="mt-1 text-sm text-slate-600">คนขับ</div>
                  </div>
                  <div className="rounded-lg border border-slate-200/80 bg-white p-4 text-center">
                    <div className="text-2xl font-bold text-slate-900">
                      {filteredEmployers.length + filteredJobs.length + filteredDrivers.length}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">แสดงอยู่</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Map Area */}
      <div className={`flex-1 ${isFullscreen ? 'h-screen' : ''}`}>
        <div className="relative h-full overflow-hidden rounded-xl border border-slate-200/90 shadow-md ring-1 ring-slate-200/40">
          {/* Fullscreen Controls */}
          {isFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 z-[1000] bg-white p-2 rounded-lg shadow-md hover:bg-gray-50"
            >
              <Minimize2 size={20} />
            </button>
          )}

          {/* Map Controls on Map (สำหรับ Fullscreen) */}
          {isFullscreen && (
            <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
              <div className="bg-white rounded-lg shadow-md p-2">
                <button
                  onClick={handleUserLocationClick}
                  disabled={!userLocation}
                  className="flex items-center p-2 text-sm text-gray-600 hover:bg-gray-50 rounded w-full"
                >
                  <Navigation size={16} className="mr-2" />
                  ตำแหน่งของฉัน
                </button>
                <button
                  onClick={handleResetView}
                  className="flex items-center p-2 text-sm text-gray-600 hover:bg-gray-50 rounded w-full"
                >
                  <MapPin size={16} className="mr-2" />
                  รีเซ็ตมุมมอง
                </button>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[400] bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 text-xs">
            <div className="font-semibold mb-2">คำอธิบายสัญลักษณ์</div>
            <div className="space-y-1">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                <span>ผู้จ้างงาน</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span>ผู้จ้างงานยืนยันแล้ว</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                <span>งานว่าง</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-400 mr-2"></div>
                <span>คนขับพร้อมทำงาน</span>
              </div>
            </div>
          </div>

          {/* Selected Location Info */}
          {pickedLocation && (
            <div className="absolute top-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 text-sm max-w-xs">
              <div className="font-semibold mb-1 flex items-center">
                <MapPin size={16} className="mr-1" />
                ตำแหน่งที่เลือก
              </div>
              <div className="text-gray-600 text-sm mb-2">ละติจูด: {pickedLocation.lat.toFixed(6)}</div>
              <div className="text-gray-600 text-sm mb-2">ลองจิจูด: {pickedLocation.lng.toFixed(6)}</div>
              {enablePick && (
                <button
                  onClick={() => {
                    setPickedLocation(null);
                    onPickLocation?.(null);
                  }}
                  className="text-sm text-slate-600 underline hover:text-slate-900"
                >
                  ล้างตำแหน่ง
                </button>
              )}
            </div>
          )}

          {/* Leaflet Map */}
          <div style={{ height: isFullscreen ? '100%' : height, width: "100%" }}>
            <MapContainer
              center={center}
              zoom={zoom}
              style={{ height: "100%", width: "100%" }}
              ref={mapRef}
              className="z-0 [&_.leaflet-control-attribution]:rounded-t [&_.leaflet-control-attribution]:bg-white/90 [&_.leaflet-control-attribution]:text-[10px]"
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              
              {enablePick && (
                <ClickToAddMarker
                  onSelect={(lat, lng) => {
                    const location = { lat, lng };
                    setPickedLocation(location);
                    onPickLocation?.(location);
                  }}
                  markerIcon={pickedHereIcon}
                />
              )}

              {/* User location marker */}
              {userLocation && (
                <Marker position={userLocation} icon={userLocationIcon}>
                  <Popup>
                    <div className="font-semibold">ตำแหน่งของคุณ</div>
                    <div className="text-sm text-gray-600">
                      ละติจูด: {userLocation[0].toFixed(6)}<br />
                      ลองจิจูด: {userLocation[1].toFixed(6)}
                    </div>
                  </Popup>
                </Marker>
              )}

              {/* Employer markers */}
              {showEmployers &&
                filteredEmployers.map((employer) => (
                  <Marker
                    key={`employer-${employer.id}`}
                    position={[employer.lat, employer.lng] as LatLngExpression}
                    icon={
                      employer.isVerified ? icons.employerVerified : icons.employer
                    }
                    eventHandlers={{
                      click: () => handleMarkerClick("employer", employer),
                    }}
                  >
                    <Popup>{renderPopupContent("employer", employer)}</Popup>
                  </Marker>
                ))}

              {/* Job markers */}
              {showJobs &&
                filteredJobs.map((job) => (
                  <Marker
                    key={`job-${job.id}`}
                    position={
                      [job.location.lat, job.location.lng] as LatLngExpression
                    }
                    icon={getJobIcon(job)}
                    eventHandlers={{
                      click: () => handleMarkerClick("job", job),
                    }}
                  >
                    <Popup>{renderPopupContent("job", job)}</Popup>
                  </Marker>
                ))}

              {/* Driver markers */}
              {showDrivers &&
                filteredDrivers.map((driver) => (
                  <Marker
                    key={`driver-${driver.driverId}`}
                    position={[driver.lat, driver.lng] as LatLngExpression}
                    icon={getDriverIcon(driver)}
                    eventHandlers={{
                      click: () => handleMarkerClick("driver", driver),
                    }}
                  >
                    <Popup>{renderPopupContent("driver", driver)}</Popup>
                  </Marker>
                ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmployerMap;