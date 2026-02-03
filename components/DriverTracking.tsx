// 🚗 Real-time Driver Tracking Component
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L, { LatLngExpression } from 'leaflet';
import { DriverLocation, Job } from '../types';
import { Navigation, Clock, MapPin, Gauge, Wifi, WifiOff, Battery, AlertTriangle, Phone, MessageSquare, Navigation2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
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

// 🚗 สร้าง custom car icon พร้อมทิศทาง
const createCarIcon = (heading: number) => {
  const carSvg = `
    <svg width="40" height="40" viewBox="0 0 64 64" style="transform: rotate(${heading}deg);">
      <ellipse cx="32" cy="54" rx="20" ry="4" fill="#000" opacity="0.2"/>
      <path d="M 12,32 L 18,20 L 46,20 L 52,32 L 52,45 L 12,45 Z" fill="#4285F4" stroke="#1565C0" stroke-width="2"/>
      <path d="M 20,20 L 24,12 L 40,12 L 44,20 Z" fill="#1E88E5" stroke="#1565C0" stroke-width="1.5"/>
      <circle cx="50" cy="34" r="2" fill="#FFF176"/>
      <circle cx="20" cy="45" r="6" fill="#424242" stroke="#212121" stroke-width="2"/>
      <circle cx="44" cy="45" r="6" fill="#424242" stroke="#212121" stroke-width="2"/>
    </svg>
  `;
  
  return L.divIcon({
    html: carSvg,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    className: 'car-icon',
    popupAnchor: [0, -20]
  });
};

// สร้าง icon สำหรับ destination
const createDestinationIcon = () => {
  return L.divIcon({
    html: `<div style="background: #EF4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
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
  const { t } = useLanguage();
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
          
          console.log('📍 Provider location updated:', location);
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

  // Calculate distance and ETA
  useEffect(() => {
    if (providerLocation && jobDetails?.location) {
      const dist = LocationService.calculateDistance(
        providerLocation.lat,
        providerLocation.lng,
        jobDetails.location.lat,
        jobDetails.location.lng
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
      case 'moving': return 'bg-blue-100 text-blue-800';
      case 'stopped': return 'bg-yellow-100 text-yellow-800';
      case 'arrived': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">กำลังโหลดตำแหน่งผู้รับงาน...</p>
      </div>
    );
  }

  if (!providerLocation) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <Navigation2 className="text-gray-400 mx-auto mb-4" size={48} />
        <p className="text-gray-900 font-bold mb-2">ยังไม่มีข้อมูลตำแหน่ง</p>
        <p className="text-gray-600">รอให้ผู้รับงานเปิดแอปและเริ่มการติดตาม</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg flex items-center">
              <Navigation className="mr-2" />
              🚗 ติดตามผู้รับงานแบบ Real-time
            </h3>
            <p className="text-blue-100 text-sm">กำลังอัปเดตตำแหน่งอัตโนมัติ</p>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 rounded-full text-xs font-bold ${getStatusColor(providerLocation.status)}`}>
              {providerLocation.status === 'moving' ? '🚗 กำลังเดินทาง' : 
               providerLocation.status === 'stopped' ? '⏸️ หยุดพัก' : 
               '✅ ถึงที่แล้ว'}
            </span>
            <div className="p-2 rounded-full bg-green-500">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
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
          className="rounded-b-xl"
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
              icon={createCarIcon(providerLocation.heading || 0)}
            >
              <Popup>
                <div className="p-2">
                  <p className="font-bold text-blue-700">🚗 ผู้รับงาน</p>
                  <p className="text-sm text-gray-600">ความเร็ว: {Math.round(providerLocation.speed * 3.6)} km/h</p>
                  <p className="text-sm text-gray-600">ทิศทาง: {providerLocation.heading}°</p>
                  <p className="text-xs text-gray-500 mt-1">{lastUpdate}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Driver path history */}
          {driverHistory.length > 1 && (
            <Polyline
              positions={driverHistory}
              pathOptions={{
                color: '#3B82F6',
                opacity: 0.6,
                weight: 3
              }}
            />
          )}

          {/* Job destination marker */}
          {jobDetails && (
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
                    className="text-blue-600 text-sm hover:underline"
                  >
                    View Job →
                  </a>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route line from provider to job destination */}
          {providerLocation && jobDetails && (
            <Polyline
              positions={[
                [providerLocation.lat, providerLocation.lng],
                [jobDetails.location.lat, jobDetails.location.lng]
              ]}
              pathOptions={{
                color: '#10B981',
                opacity: 0.6,
                weight: 4,
                dashArray: '10, 10'
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
              <Navigation size={22} className="text-blue-600" />
            </button>
          </div>
        )}

        {/* 🎯 Distance & ETA Display */}
        {distance > 0 && (
          <div className="absolute top-4 right-4 z-[1000] bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg shadow-lg p-4">
            <div className="space-y-2">
              <div className="flex items-center">
                <MapPin size={18} className="mr-2" />
                <div>
                  <div className="text-xs opacity-90">ระยะทาง</div>
                  <div className="font-bold text-lg">{distance.toFixed(1)} km</div>
                </div>
              </div>
              <div className="flex items-center">
                <Clock size={18} className="mr-2" />
                <div>
                  <div className="text-xs opacity-90">เวลาโดยประมาณ</div>
                  <div className="font-bold text-lg">{eta}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats overlay */}
        <div className="absolute top-4 left-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl shadow-lg p-4 border border-blue-100">
          <div className="space-y-3">
            <div className="flex items-center">
              <Gauge size={18} className="text-blue-600 mr-3" />
              <div>
                <div className="text-xs text-gray-500">ความเร็ว</div>
                <div className="font-bold text-blue-700">{Math.round((providerLocation.speed || 0) * 3.6)} km/h</div>
              </div>
            </div>
            <div className="flex items-center">
              <Clock size={18} className="text-blue-600 mr-3" />
              <div>
                <div className="text-xs text-gray-500">อัปเดตล่าสุด</div>
                <div className="font-bold text-sm">{lastUpdate}</div>
              </div>
            </div>
            <div className="flex items-center">
              <Wifi size={18} className="text-green-600 mr-3" />
              <div>
                <div className="text-xs text-gray-500">สัญญาณ</div>
                <div className="font-bold text-green-700">
                  {providerLocation.accuracy < 20 ? 'แม่นยำสูง' : 'ปกติ'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-gray-100">
        {/* Real-time Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-blue-600 font-medium">ความเร็ว</div>
                <div className="text-2xl font-bold text-blue-700">{Math.round((providerLocation.speed || 0) * 3.6)}</div>
                <div className="text-xs text-blue-500">km/h</div>
              </div>
              <Gauge size={28} className="text-blue-400" />
            </div>
          </div>
          
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 rounded-xl border border-emerald-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-emerald-600 font-medium">ระยะทาง</div>
                <div className="text-2xl font-bold text-emerald-700">{distance.toFixed(1)}</div>
                <div className="text-xs text-emerald-500">km</div>
              </div>
              <MapPin size={28} className="text-emerald-400" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl border border-purple-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-purple-600 font-medium">เวลาโดยประมาณ</div>
                <div className="text-lg font-bold text-purple-700">{eta || 'คำนวณ...'}</div>
              </div>
              <Clock size={28} className="text-purple-400" />
            </div>
          </div>
        </div>

        {/* Job Info */}
        {jobDetails && (
          <div className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs text-gray-500 font-medium">จุดหมายปลายทาง</p>
                <p className="text-gray-900 font-bold text-lg">{jobDetails.title}</p>
                <p className="text-sm text-emerald-600 font-bold">฿{jobDetails.price.toLocaleString()}</p>
              </div>
              <a
                href={`#/jobs/${jobDetails.id}`}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
              >
                ดูงาน →
              </a>
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-2">
              <MapPin size={12} className="mr-1" />
              {jobDetails.location.lat.toFixed(4)}, {jobDetails.location.lng.toFixed(4)}
            </div>
          </div>
        )}

        {/* Status Banner */}
        <div className={`mt-4 p-3 rounded-lg text-center font-bold ${
          providerLocation.status === 'moving' ? 'bg-blue-100 text-blue-700' :
          providerLocation.status === 'stopped' ? 'bg-yellow-100 text-yellow-700' :
          'bg-green-100 text-green-700'
        }`}>
          {providerLocation.status === 'moving' ? '🚗 กำลังเดินทางมา...' :
           providerLocation.status === 'stopped' ? '⏸️ หยุดพักชั่วคราว' :
           '✅ มาถึงจุดหมายแล้ว!'}
        </div>
      </div>
    </div>
  );
};

export default DriverTracking;