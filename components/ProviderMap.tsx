// src/components/ProviderMap.tsx
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import { icon, LatLngExpression } from 'leaflet';
import { Job, EmployerLocation, DriverLocation, JobStatus } from '../types';
import { Navigation, Target, Clock, Car, Users, MapPin, Layers, Filter, AlertCircle, DollarSign } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

// Fix for default icons in Leaflet
import L from 'leaflet';
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface ProviderMapProps {
  jobs?: Job[];
  employers?: EmployerLocation[];
  currentLocation?: { lat: number; lng: number };
  acceptedJob?: Job | null;
  onJobSelect?: (job: Job) => void;
  onNavigateToJob?: (job: Job) => void;
  height?: string;
  showControls?: boolean;
  initialZoom?: number;
}

// Component เพื่อควบคุม map จากภายนอก
const MapController = ({ center, zoom }: { center: [number, number]; zoom: number }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  
  return null;
};

const ProviderMap: React.FC<ProviderMapProps> = ({
  jobs = [],
  employers = [],
  currentLocation = { lat: 13.736717, lng: 100.523186 },
  acceptedJob = null,
  onJobSelect,
  onNavigateToJob,
  height = '500px',
  showControls = true,
  initialZoom = 12
}) => {
  const { t } = useLanguage();
  const mapRef = useRef<L.Map | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [center, setCenter] = useState<[number, number]>([currentLocation.lat, currentLocation.lng]);
  const [zoom, setZoom] = useState(initialZoom);
  const [showAllJobs, setShowAllJobs] = useState(true);
  const [showRoute, setShowRoute] = useState(true);
  const [showEmployers, setShowEmployers] = useState(false);
  const [filterStatus, setFilterStatus] = useState<JobStatus | 'ALL'>('ALL');
  const [routeInfo, setRouteInfo] = useState<{
    distance: string;
    time: string;
    polyline: [number, number][] | null;
  } | null>(null);

  // Custom icons สำหรับผู้รับงาน
  const createIcon = (color: string, type: string = 'marker', size: number = 25) => {
    if (type === 'car') {
      return icon({
        iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="${size}px" height="${size}px"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>`,
        iconSize: [size, size],
        iconAnchor: [size/2, size/2],
        popupAnchor: [0, -size/2]
      });
    }
    
    return icon({
      iconUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="${size}px" height="${size}px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
      iconSize: [size, size],
      iconAnchor: [size/2, size],
      popupAnchor: [0, -size]
    });
  };

  const icons = {
    currentLocation: createIcon('#4285F4', 'car', 35),
    jobOpen: createIcon('#F4B400', 'marker', 30),
    jobHighPriority: createIcon('#DB4437', 'marker', 35),
    jobAccepted: createIcon('#0F9D58', 'marker', 30),
    jobInProgress: createIcon('#4285F4', 'marker', 30),
    employer: createIcon('#9C27B0', 'marker', 28),
    employerVerified: createIcon('#0F9D58', 'marker', 32)
  };

  // คำนวณเส้นทางหากมีงานที่รับแล้ว
  useEffect(() => {
    if (acceptedJob && showRoute) {
      calculateRoute(acceptedJob);
    } else {
      setRouteInfo(null);
    }
  }, [acceptedJob, showRoute]);

  const calculateRoute = async (job: Job) => {
    try {
      // ตัวอย่างการคำนวณเส้นทาง (ในแอพจริงจะใช้ Google Maps Directions API)
      const { lat, lng } = job.location;
      const distance = calculateDistance(
        currentLocation.lat,
        currentLocation.lng,
        lat,
        lng
      );
      
      const estimatedTime = Math.round(distance / 40 * 60); // 40 km/h average
      
      // สร้างเส้นทางตัวอย่าง
      const polyline: [number, number][] = [
        [currentLocation.lat, currentLocation.lng],
        [
          (currentLocation.lat + lat) / 2 + 0.01,
          (currentLocation.lng + lng) / 2 - 0.01
        ],
        [lat, lng]
      ];
      
      setRouteInfo({
        distance: `${distance.toFixed(1)} km`,
        time: `${estimatedTime} mins`,
        polyline
      });
    } catch (error) {
      console.error('Error calculating route:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleJobClick = (job: Job) => {
    setSelectedJob(job);
    if (onJobSelect) {
      onJobSelect(job);
    }
  };

  const handleNavigateClick = (job: Job) => {
    if (onNavigateToJob) {
      onNavigateToJob(job);
    }
    
    // เปิด Google Maps สำหรับนำทาง
    const { lat, lng } = job.location;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      '_blank'
    );
  };

  const handleZoomToJob = (job: Job) => {
    const { lat, lng } = job.location;
    const newCenter: [number, number] = [lat, lng];
    setCenter(newCenter);
    setZoom(15);
    if (mapRef.current) {
      mapRef.current.flyTo(newCenter, 15);
    }
  };

  const handleZoomToCurrentLocation = () => {
    const newCenter: [number, number] = [currentLocation.lat, currentLocation.lng];
    setCenter(newCenter);
    setZoom(15);
    if (mapRef.current) {
      mapRef.current.flyTo(newCenter, 15);
    }
  };

  const getJobIcon = (job: Job) => {
    if (job.status === JobStatus.OPEN) {
      return job.price > 2000 ? icons.jobHighPriority : icons.jobOpen;
    } else if (job.status === JobStatus.ACCEPTED) {
      return icons.jobAccepted;
    } else if (job.status === JobStatus.IN_PROGRESS) {
      return icons.jobInProgress;
    }
    return icons.jobOpen;
  };

  const filteredJobs = filterStatus === 'ALL' 
    ? jobs 
    : jobs.filter(job => job.status === filterStatus);

  // Render Popup สำหรับงาน
  const renderJobPopup = (job: Job) => (
    <div className="p-2 max-w-xs">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-bold text-gray-900 text-sm">{job.title}</h3>
        <span className={`px-2 py-1 rounded text-xs font-bold ${
          job.status === JobStatus.OPEN ? 'bg-yellow-100 text-yellow-800' :
          job.status === JobStatus.ACCEPTED ? 'bg-green-100 text-green-800' :
          job.status === JobStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {job.status.replace('_', ' ')}
        </span>
      </div>
      
      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{job.description}</p>
      
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Price</div>
          <div className="font-bold text-emerald-600">฿{job.price}</div>
        </div>
        <div className="bg-gray-50 p-2 rounded">
          <div className="text-xs text-gray-500">Distance</div>
          <div className="font-bold text-blue-600">
            {calculateDistance(currentLocation.lat, currentLocation.lng, job.location.lat, job.location.lng).toFixed(1)} km
          </div>
        </div>
      </div>
      
      <div className="flex space-x-2">
        <button
          onClick={() => handleZoomToJob(job)}
          className="flex-1 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 text-sm"
        >
          <MapPin size={14} className="inline mr-1" />
          View
        </button>
        {job.status === JobStatus.OPEN && (
          <button
            onClick={() => handleNavigateClick(job)}
            className="flex-1 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            <Navigation size={14} className="inline mr-1" />
            Navigate
          </button>
        )}
      </div>
    </div>
  );

  // Render Popup สำหรับนายจ้าง
  const renderEmployerPopup = (employer: EmployerLocation) => (
    <div className="p-2 max-w-xs">
      <div className="flex items-center mb-2">
        <img 
          src={employer.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(employer.name)}&background=purple&color=fff`}
          alt={employer.name}
          className="w-10 h-10 rounded-full mr-3"
        />
        <div>
          <h3 className="font-bold text-gray-900">{employer.name}</h3>
          {employer.isVerified && (
            <span className="text-xs text-green-600">✓ Verified</span>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-2">{employer.address}</p>
      <div className="text-xs text-gray-500">
        {employer.jobCount} jobs • {employer.rating || 4.5} ★
      </div>
    </div>
  );

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-lg">
      {/* Map Controls สำหรับผู้รับงาน */}
      {showControls && (
        <div className="absolute top-4 left-4 z-[1000] flex flex-col space-y-2">
          {/* Job Filter Controls */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm flex items-center">
                <Filter size={16} className="mr-2" />
                Filter Jobs
              </h4>
              <button
                onClick={() => setShowAllJobs(!showAllJobs)}
                className={`p-1 rounded ${showAllJobs ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
              >
                {showAllJobs ? 'Hide' : 'Show'}
              </button>
            </div>
            
            <div className="space-y-1">
              {(['ALL', JobStatus.OPEN, JobStatus.ACCEPTED, JobStatus.IN_PROGRESS] as const).map(status => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                    filterStatus === status 
                      ? 'bg-blue-50 text-blue-700 font-medium' 
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {status === 'ALL' ? 'All Jobs' : status.replace('_', ' ')}
                  {status !== 'ALL' && (
                    <span className="float-right text-xs">
                      {jobs.filter(j => j.status === status).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Route Controls */}
          {acceptedJob && (
            <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-sm flex items-center">
                  <Navigation size={16} className="mr-2" />
                  Active Job Route
                </h4>
                <button
                  onClick={() => setShowRoute(!showRoute)}
                  className={`p-1 rounded ${showRoute ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {showRoute ? 'Hide' : 'Show'}
                </button>
              </div>
              
              {routeInfo && (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distance:</span>
                    <span className="font-bold">{routeInfo.distance}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">ETA:</span>
                    <span className="font-bold">{routeInfo.time}</span>
                  </div>
                  <button
                    onClick={() => handleNavigateClick(acceptedJob)}
                    className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center justify-center"
                  >
                    <Navigation size={14} className="mr-2" />
                    Open in Maps
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Map Actions */}
          <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-2">
            <button
              onClick={handleZoomToCurrentLocation}
              className="w-full flex items-center px-3 py-2 rounded text-gray-600 hover:bg-gray-50"
              title="Go to my location"
            >
              <Target size={16} className="mr-2" />
              My Location
            </button>
            
            <button
              onClick={() => setShowEmployers(!showEmployers)}
              className="w-full flex items-center justify-between px-3 py-2 rounded text-gray-600 hover:bg-gray-50"
            >
              <span className="flex items-center">
                <Users size={16} className="mr-2" />
                Employers
              </span>
              <div className={`w-3 h-3 rounded-full ${showEmployers ? 'bg-purple-500' : 'bg-gray-300'}`} />
            </button>
          </div>
        </div>
      )}

      {/* Legend สำหรับผู้รับงาน */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3 text-xs">
        <div className="font-semibold mb-2">Legend</div>
        <div className="space-y-1">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
            <span>Your Location</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
            <span>Available Jobs</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span>High Priority Jobs</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span>Your Accepted Job</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
            <span>Employers</span>
          </div>
        </div>
      </div>

      {/* Stats Bar สำหรับผู้รับงาน */}
      <div className="absolute top-4 right-4 z-[1000]">
        <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-md p-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-bold text-yellow-600">
                {jobs.filter(j => j.status === JobStatus.OPEN).length}
              </div>
              <div className="text-xs text-gray-600">Available</div>
            </div>
            <div>
              <div className="text-lg font-bold text-green-600">
                {jobs.filter(j => j.status === JobStatus.ACCEPTED || j.status === JobStatus.IN_PROGRESS).length}
              </div>
              <div className="text-xs text-gray-600">Active</div>
            </div>
          </div>
          
          {acceptedJob && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs text-gray-500">Current Job</div>
              <div className="font-semibold truncate max-w-[120px]">{acceptedJob.title}</div>
              <div className="text-sm font-bold text-emerald-600">฿{acceptedJob.price}</div>
            </div>
          )}
        </div>
      </div>

      {/* Leaflet Map */}
      <div style={{ height, width: '100%' }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
          className="rounded-xl"
        >
          <MapController center={center} zoom={zoom} />
          
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />

          {/* Current Location Marker */}
          <Marker 
            position={[currentLocation.lat, currentLocation.lng] as LatLngExpression}
            icon={icons.currentLocation}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-bold text-blue-700">Your Location</h3>
                <p className="text-sm text-gray-600">
                  Lat: {currentLocation.lat.toFixed(4)}, Lng: {currentLocation.lng.toFixed(4)}
                </p>
              </div>
            </Popup>
          </Marker>

          {/* Route Line สำหรับงานที่รับแล้ว */}
          {showRoute && routeInfo?.polyline && acceptedJob && (
            <Polyline
              positions={routeInfo.polyline.map(pos => [pos[0], pos[1]] as [number, number])}
              color="#10B981"
              weight={4}
              opacity={0.7}
              dashArray="10, 10"
            />
          )}

          {/* Job Markers */}
          {showAllJobs && filteredJobs.map((job) => (
            <Marker
              key={`job-${job.id}`}
              position={[job.location.lat, job.location.lng] as LatLngExpression}
              icon={getJobIcon(job)}
              eventHandlers={{
                click: () => handleJobClick(job)
              }}
            >
              <Popup>
                {renderJobPopup(job)}
              </Popup>
            </Marker>
          ))}

          {/* Employer Markers */}
          {showEmployers && employers.map((employer) => (
            <Marker
              key={`employer-${employer.id}`}
              position={[employer.lat, employer.lng] as LatLngExpression}
              icon={employer.isVerified ? icons.employerVerified : icons.employer}
            >
              <Popup>
                {renderEmployerPopup(employer)}
              </Popup>
            </Marker>
          ))}

          {/* Destination Marker สำหรับงานที่รับแล้ว */}
          {acceptedJob && (
            <Marker
              position={[acceptedJob.location.lat, acceptedJob.location.lng] as LatLngExpression}
              icon={icons.jobAccepted}
            >
              <Popup>
                <div className="p-2">
                  <h3 className="font-bold text-green-700">Your Destination</h3>
                  <p className="text-sm">{acceptedJob.title}</p>
                  {routeInfo && (
                    <div className="mt-2 text-xs">
                      <div>Distance: {routeInfo.distance}</div>
                      <div>ETA: {routeInfo.time}</div>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Job Details Panel */}
      {selectedJob && (
        <div className="absolute bottom-4 right-4 z-[1000] w-80">
          <div className="bg-white rounded-lg shadow-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-gray-900">{selectedJob.title}</h3>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">{selectedJob.category}</p>
            </div>
            
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500">Price</div>
                  <div className="font-bold text-emerald-600 text-lg">฿{selectedJob.price}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <div className="text-xs text-gray-500">Distance</div>
                  <div className="font-bold text-blue-600 text-lg">
                    {calculateDistance(
                      currentLocation.lat, 
                      currentLocation.lng, 
                      selectedJob.location.lat, 
                      selectedJob.location.lng
                    ).toFixed(1)} km
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <button
                  onClick={() => handleZoomToJob(selectedJob)}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center"
                >
                  <MapPin size={16} className="mr-2" />
                  View on Map
                </button>
                
                {selectedJob.status === JobStatus.OPEN && (
                  <button
                    onClick={() => handleNavigateClick(selectedJob)}
                    className="w-full py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center justify-center"
                  >
                    <Navigation size={16} className="mr-2" />
                    Navigate to Job
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProviderMap;