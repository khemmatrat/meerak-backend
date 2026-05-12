import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMapEvents,
  useMap,
} from "react-leaflet";
import { divIcon, LatLngExpression } from "leaflet";
import L from "leaflet";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { useMobileAppConfig } from "../context/MobileAppConfigContext";
import { PreLaunchServiceBlock } from "../components/PreLaunchServiceBlock";
import { api } from "../services/api";
import {
  DISTANCE_PRICING_DEFAULTS,
  DEFAULT_TRANSPORT_MATCH_MARKUP_RATE,
  fetchDistancePricingSettings,
  fetchTransportIntercityPricing,
  type DistancePricingSettingsResponse,
} from "../services/transportDistancePricingService";
import { MockApi } from "../services/mockApi";
import {
  ChevronLeft,
  Car,
  Package,
  Users,
  Bus,
  Search,
  MapPin,
  CheckCircle2,
  Navigation,
  Clock,
  Home,
  Building2,
  ShoppingBag,
  UserCircle,
  X,
  Wallet,
  Banknote,
  Bike,
  ShieldCheck,
  Star,
  Maximize2,
  Loader2,
} from "lucide-react";

const AQOND_GREEN = "#00875A";
const DEFAULT_INSURANCE_PERCENT = 10;
const JOB_CATEGORY = "Driver";
import "leaflet/dist/leaflet.css";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

import {
  addRecentSearch,
  addTransportFavorite,
  filterPopularPlaces,
  getCentralLandmarkPoi,
  haversineKm,
  loadSavedTransportPlaces,
  resolveTransportDestination,
  reverseGeocodeShort,
  saveTransportHome,
  saveTransportOffice,
} from "../utils/transportBangkokPlaces";
import { buildLocationPatchForTransport, mergeTransportHubFromProfile } from "../utils/transportHubSync";
import { fetchOsrmDrivingRoute } from "../utils/transportOsrm";
import { buildTransportHubTransportContract } from "../types/transportContract";
import { computeIntercityQuoteBreakdown, type TransportPricingFormula } from "../utils/transportIntercityQuote";
import { inferRegionFromResidentialAddress } from "../utils/transportProvinceBinding";
import {
  TRANSPORT_REGIONS,
  CROSS_REGION_MIN_BASE_THB,
  inferRegionFromCoords,
  getRegionOrDefault,
  isCrossRegionTrip,
  pointInRegion,
  type TransportRegionId,
} from "../utils/transportRegions";

const REGION_STORAGE_KEY = "aqond_transport_region_v1";

function readStoredRegion(): TransportRegionId {
  try {
    const s = localStorage.getItem(REGION_STORAGE_KEY);
    if (s && s in TRANSPORT_REGIONS) return s as TransportRegionId;
  } catch {
    /* ignore */
  }
  return "bangkok";
}

const SUB_SERVICES = [
  { id: "driver", labelKey: "transport.driver", subKey: "transport.driver_sub", icon: Car },
  { id: "messenger", labelKey: "transport.messenger", subKey: "transport.messenger_sub", icon: Package },
  { id: "group", labelKey: "transport.group", subKey: "transport.group_sub", icon: Users },
  { id: "shuttle", labelKey: "transport.shuttle", subKey: "transport.shuttle_sub", icon: Bus },
];

const FAVORITE_PLACES = [
  { id: "home", labelKey: "transport.favorite_home", icon: Home },
  { id: "office", labelKey: "transport.favorite_office", icon: Building2 },
  { id: "central", labelKey: "transport.favorite_central", icon: ShoppingBag },
];

type VehicleId =
  | "standard"
  | "saver"
  | "premium"
  | "luxury"
  | "motorcycle_standard"
  | "motorcycle_saver"
  | "motorcycle_premium"
  | "tricycle_standard"
  | "tricycle_premium";

/** Paths under `mobile/public/transport/` — isometric-style art (เลียนแบบแนวเลือกรถแบบ ride-hailing) */
function transportIllustrationSrc(filename: string): string {
  const base = import.meta.env.BASE_URL;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}transport/${filename}`;
}

const VEHICLES: {
  id: VehicleId;
  labelKey: string;
  seatsKey: string;
  priceMultiplier: number;
  etaMins: number;
  illustration: string;
  icon: typeof Car;
  shuttleOnly?: boolean;
  shuttleExcluded?: boolean;
  isPremiumCard?: boolean;
  isLuxuryTier?: boolean;
}[] = [
  {
    id: "standard",
    labelKey: "transport.vehicle_standard",
    seatsKey: "transport.vehicle_standard_seats",
    priceMultiplier: 1,
    etaMins: 3,
    illustration: transportIllustrationSrc("vehicle-car-standard.png"),
    icon: Car,
  },
  {
    id: "saver",
    labelKey: "transport.vehicle_saver",
    seatsKey: "transport.vehicle_saver_seats",
    priceMultiplier: 0.7,
    etaMins: 5,
    illustration: transportIllustrationSrc("vehicle-car-saver.png"),
    icon: Car,
  },
  {
    id: "premium",
    labelKey: "transport.vehicle_premium",
    seatsKey: "transport.vehicle_premium_seats",
    priceMultiplier: 1.4,
    etaMins: 2,
    illustration: transportIllustrationSrc("vehicle-car-premium.png"),
    icon: Car,
  },
  {
    id: "luxury",
    labelKey: "transport.vehicle_luxury",
    seatsKey: "transport.vehicle_luxury_seats",
    priceMultiplier: 1.85,
    etaMins: 3,
    illustration: transportIllustrationSrc("vehicle-car-luxury.png"),
    icon: Car,
    isLuxuryTier: true,
  },
  {
    id: "motorcycle_standard",
    labelKey: "transport.vehicle_motorcycle_standard",
    seatsKey: "transport.vehicle_motorcycle_standard_seats",
    priceMultiplier: 0.55,
    etaMins: 2,
    illustration: transportIllustrationSrc("vehicle-motorcycle-stanndard.png"),
    icon: Bike,
  },
  {
    id: "motorcycle_saver",
    labelKey: "transport.vehicle_motorcycle_saver",
    seatsKey: "transport.vehicle_motorcycle_saver_seats",
    priceMultiplier: 0.4,
    etaMins: 4,
    illustration: transportIllustrationSrc("vehicle-motorcycle-saver.png"),
    icon: Bike,
  },
  {
    id: "motorcycle_premium",
    labelKey: "transport.vehicle_motorcycle_premium",
    seatsKey: "transport.vehicle_motorcycle_premium_seats",
    priceMultiplier: 0.75,
    etaMins: 1,
    illustration: transportIllustrationSrc("vehicle-motorcycle-premuim.png"),
    icon: Bike,
  },
  {
    id: "tricycle_standard",
    labelKey: "transport.vehicle_tricycle_standard",
    seatsKey: "transport.vehicle_tricycle_standard_seats",
    priceMultiplier: 0.5,
    etaMins: 4,
    illustration: transportIllustrationSrc("vehicle-tricycle-tuktuk.png"),
    icon: Bike,
    shuttleOnly: true,
  },
  {
    id: "tricycle_premium",
    labelKey: "transport.vehicle_tricycle_premium",
    seatsKey: "transport.vehicle_tricycle_premium_seats",
    priceMultiplier: 0.85,
    etaMins: 2,
    illustration: transportIllustrationSrc("vehicle-tricycle-tuktuk-electric.png"),
    icon: Bike,
    shuttleOnly: true,
    isPremiumCard: true,
  },
];

function MapBoundsUpdater({ pickup, dropoff }: { pickup: [number, number]; dropoff: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (dropoff) {
      const bounds = L.latLngBounds([pickup, dropoff]);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }, [pickup, dropoff, map]);
  return null;
}

function MapClickHandler({
  onPickDestination,
  disabled,
}: {
  onPickDestination: (lat: number, lng: number) => void;
  disabled?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (!disabled) onPickDestination(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function createPickupIcon() {
  return divIcon({
    className: "custom-pickup-marker",
    html: `<div style="
      width:28px;height:28px;background:${AQOND_GREEN};border:3px solid white;
      border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
    "><div style="width:8px;height:8px;background:white;border-radius:50%"></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function createDestinationIcon(label: string) {
  const escaped = label.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") || "Destination";
  return divIcon({
    className: "custom-dest-marker",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="
          padding:4px 10px;background:white;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);
          font-size:12px;font-weight:600;color:#1f2937;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;
          margin-bottom:4px;border:1px solid #e5e7eb;
        ">${escaped}</div>
        <div style="
          width:24px;height:32px;background:${AQOND_GREEN};border:2px solid white;
          border-radius:4px 4px 4px 0;transform:rotate(-45deg);margin-top:-4px;
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        "></div>
      </div>`,
    iconSize: [120, 60],
    iconAnchor: [60, 52],
  });
}

export const TransportHub: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { t, language } = useLanguage();
  const { notify } = useNotification();
  const { config: mobileAppConfig, bootstrap } = useMobileAppConfig();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [subService, setSubService] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const suggestionRef = useRef<HTMLDivElement | null>(null);
  const [osrm, setOsrm] = useState<{
    distanceKm: number;
    durationMin: number;
    coordinates: [number, number][];
  } | null>(null);
  const [osrmLoading, setOsrmLoading] = useState(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const osrmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastGpsRef = useRef<[number, number] | null>(null);
  const [serviceRegion, setServiceRegion] = useState<TransportRegionId>(readStoredRegion);
  const [pickup, setPickup] = useState<[number, number]>(() => getRegionOrDefault(readStoredRegion()).center);
  const [dropoff, setDropoff] = useState<[number, number] | null>(null);
  /** แตะแผนที่/ลากหมุด — ยังไม่ยืนยันจนกด "เลือกจุดนี้" */
  const [previewDropoff, setPreviewDropoff] = useState<[number, number] | null>(null);
  const [destinationLabel, setDestinationLabel] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [ladyDriver, setLadyDriver] = useState(false);
  const [insurance, setInsurance] = useState(true);
  const [insuranceRatePercent, setInsuranceRatePercent] = useState(DEFAULT_INSURANCE_PERCENT);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleId>("standard");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("wallet");
  /** งานทั่วไป vs เหมาข้ามจังหวัด — บันทึกเป็น transport_contract.job_kind */
  const [transportJobKind, setTransportJobKind] = useState<"local_on_demand" | "intercity_charter">(
    "local_on_demand"
  );
  const [transportPricing, setTransportPricing] = useState<{
    intercity_pricing_globally_enabled?: boolean;
    formula?: TransportPricingFormula;
  } | null>(null);
  /** Dynamic distance pricing — GET /api/settings/pricing (admin: PATCH /api/admin/settings/pricing) */
  const [distancePricingSettings, setDistancePricingSettings] =
    useState<DistancePricingSettingsResponse | null>(null);
  const driversNearby = 5;

  useEffect(() => {
    api.get<{ insurance_rate_percent?: number }>(`/settings/insurance-rate?category=${encodeURIComponent(JOB_CATEGORY)}`)
      .then((r) => setInsuranceRatePercent(r.data?.insurance_rate_percent ?? DEFAULT_INSURANCE_PERCENT))
      .catch(() => setInsuranceRatePercent(DEFAULT_INSURANCE_PERCENT));
  }, []);

  useEffect(() => {
    fetchTransportIntercityPricing()
      .then((r) => setTransportPricing(r))
      .catch(() => setTransportPricing(null));
  }, []);

  useEffect(() => {
    fetchDistancePricingSettings()
      .then((r) => setDistancePricingSettings(r))
      .catch(() => setDistancePricingSettings(null));
  }, []);

  useEffect(() => {
    if (bootstrap.transportPricing) {
      setDistancePricingSettings(bootstrap.transportPricing);
    }
  }, [bootstrap.transportPricing]);

  useEffect(() => {
    const fromProfile = user?.location?.transport_region;
    if (fromProfile && fromProfile in TRANSPORT_REGIONS) {
      const id = fromProfile as TransportRegionId;
      setServiceRegion(id);
      try {
        localStorage.setItem(REGION_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
    }
  }, [user?.location?.transport_region]);

  useEffect(() => {
    if (!user?.id) return;
    mergeTransportHubFromProfile(user);
    setSavedVersion((v) => v + 1);
  }, [user?.id]);

  const schedulePushToProfile = useCallback(
    (regionOverride?: TransportRegionId) => {
      if (!user?.id) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      const region = regionOverride ?? serviceRegion;
      syncTimerRef.current = setTimeout(async () => {
        try {
          const prefs = loadSavedTransportPlaces();
          await MockApi.updateProfile({
            location: buildLocationPatchForTransport(user.location, prefs, region),
          });
          await refreshUser();
        } catch {
          notify(t("transport.sync_failed"), "info");
        }
      }, 850);
    },
    [user?.id, user?.location, refreshUser, notify, t, serviceRegion]
  );

  /** จังหวัดจากที่อยู่โปรไฟล์ → transport_region เริ่มต้น (เมื่อเซิร์ฟเวอร์ยังไม่ set) */
  useEffect(() => {
    if (!user) return;
    if (user.location?.transport_region) return;
    const inferred = inferRegionFromResidentialAddress(user);
    if (inferred) {
      setServiceRegion(inferred);
      try {
        localStorage.setItem(REGION_STORAGE_KEY, inferred);
      } catch {
        /* ignore */
      }
      schedulePushToProfile(inferred);
    }
  }, [user?.id, user?.residential_address, user?.location?.transport_region, schedulePushToProfile]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setPickup(getRegionOrDefault(readStoredRegion()).center);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        lastGpsRef.current = [lat, lng];
        setPickup([lat, lng]);
        const inferred = inferRegionFromCoords(lat, lng);
        const fromAddr = user ? inferRegionFromResidentialAddress(user) : null;
        if (inferred && !user?.location?.transport_region && !fromAddr) {
          setServiceRegion(inferred);
          try {
            localStorage.setItem(REGION_STORAGE_KEY, inferred);
          } catch {
            /* ignore */
          }
          schedulePushToProfile(inferred);
        }
      },
      () => {
        setPickup(getRegionOrDefault(readStoredRegion()).center);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  }, [user?.location?.transport_region, schedulePushToProfile, user?.id]);

  const onServiceRegionChange = useCallback(
    (id: TransportRegionId) => {
      setServiceRegion(id);
      try {
        localStorage.setItem(REGION_STORAGE_KEY, id);
      } catch {
        /* ignore */
      }
      const r = TRANSPORT_REGIONS[id];
      const g = lastGpsRef.current;
      if (g && pointInRegion(g[0], g[1], r)) {
        setPickup(g);
      } else {
        setPickup(r.center);
      }
      schedulePushToProfile(id);
    },
    [schedulePushToProfile]
  );

  const savedPlaces = useMemo(() => loadSavedTransportPlaces(), [savedVersion]);

  const pickupPt = useMemo(() => ({ lat: pickup[0], lng: pickup[1] }), [pickup]);

  const applyDestination = useCallback(
    (lat: number, lng: number, label: string) => {
      setPreviewDropoff(null);
      setDropoff([lat, lng]);
      setDestinationLabel(label);
      setSearchQuery(label);
      addRecentSearch({ label, lat, lng });
      setSavedVersion((v) => v + 1);
      schedulePushToProfile();
    },
    [schedulePushToProfile]
  );

  const confirmPreviewPin = useCallback(async () => {
    if (!previewDropoff) return;
    const [lat, lng] = previewDropoff;
    const label = await reverseGeocodeShort(lat, lng);
    applyDestination(lat, lng, label);
  }, [previewDropoff, applyDestination]);

  const suggestionRows = useMemo(() => {
    const q = searchQuery.trim();
    const popular = filterPopularPlaces(q, 14, pickupPt, serviceRegion);
    const rows: Array<{ key: string; label: string; lat: number; lng: number; kind: "saved" | "poi" | "recent" }> = [];
    const recentSorted = [...savedPlaces.recent].sort(
      (a, b) => haversineKm(pickupPt, a) - haversineKm(pickupPt, b)
    );
    for (const r of recentSorted.slice(0, 8)) {
      rows.push({
        key: `recent-${r.at}-${r.label}`,
        label: `🕐 ${r.label}`,
        lat: r.lat,
        lng: r.lng,
        kind: "recent",
      });
    }
    if (savedPlaces.home) {
      rows.push({
        key: "home-saved",
        label: `🏠 ${t("transport.favorite_home")}: ${savedPlaces.home.label}`,
        lat: savedPlaces.home.lat,
        lng: savedPlaces.home.lng,
        kind: "saved",
      });
    }
    if (savedPlaces.office) {
      rows.push({
        key: "office-saved",
        label: `🏢 ${t("transport.favorite_office")}: ${savedPlaces.office.label}`,
        lat: savedPlaces.office.lat,
        lng: savedPlaces.office.lng,
        kind: "saved",
      });
    }
    for (const f of savedPlaces.favorites.slice(0, 6)) {
      rows.push({
        key: `fav-${f.lat}-${f.lng}-${f.label}`,
        label: `⭐ ${f.label}`,
        lat: f.lat,
        lng: f.lng,
        kind: "saved",
      });
    }
    for (const p of popular) {
      rows.push({ key: `poi-${p.id}`, label: p.label, lat: p.lat, lng: p.lng, kind: "poi" });
    }
    return rows;
  }, [searchQuery, savedPlaces, t, pickupPt, serviceRegion]);

  const mapMarkerPos = previewDropoff ?? dropoff;
  const effectiveLabel =
    destinationLabel || (dropoff ? searchQuery.trim() || t("transport.destination_label") : "");
  const mapMarkerLabel = previewDropoff
    ? t("transport.preview_pin")
    : effectiveLabel || t("transport.destination_label");

  useEffect(() => {
    const end = previewDropoff ?? dropoff;
    if (!end) {
      setOsrm(null);
      return;
    }
    if (osrmTimerRef.current) clearTimeout(osrmTimerRef.current);
    let cancelled = false;
    osrmTimerRef.current = setTimeout(async () => {
      setOsrmLoading(true);
      const r = await fetchOsrmDrivingRoute(pickup, end);
      if (cancelled) return;
      setOsrm(r);
      setOsrmLoading(false);
    }, 450);
    return () => {
      cancelled = true;
      if (osrmTimerRef.current) clearTimeout(osrmTimerRef.current);
    };
  }, [pickup, previewDropoff, dropoff]);

  /** ระยะทางจริงจาก OSRM เมื่อยืนยันจุดหมายแล้ว (ไม่มี preview) — fallback เป็นเส้นตรง */
  const distanceKm =
    dropoff && !previewDropoff
      ? Math.round(
          (osrm?.distanceKm ?? haversineKm(pickupPt, { lat: dropoff[0], lng: dropoff[1] })) * 10
        ) / 10
      : 0;

  /** จุดรับ–จุดหมายอยู่คนละ “ฮับ” ในแอป (ไม่ใช่ขอบเขตจังหวัดจริง) */
  const crossRegionTrip = useMemo(() => {
    if (!dropoff || previewDropoff) return null;
    return isCrossRegionTrip(pickup, dropoff);
  }, [pickup, dropoff, previewDropoff]);

  const linearBaseForJob = useMemo(() => {
    const base = distancePricingSettings?.base_fare_thb ?? DISTANCE_PRICING_DEFAULTS.base_fare_thb;
    const perKm =
      distancePricingSettings?.price_per_km_thb ?? DISTANCE_PRICING_DEFAULTS.price_per_km_thb;
    const minF =
      distancePricingSettings?.minimum_fare_thb ?? DISTANCE_PRICING_DEFAULTS.minimum_fare_thb;
    const d = Math.max(0, distanceKm);
    const raw = base + d * perKm;
    const linear = Math.round(raw * 100) / 100;
    return Math.max(minF, linear);
  }, [distanceKm, distancePricingSettings]);

  const basePrice = useMemo(() => {
    if (!crossRegionTrip) return linearBaseForJob;
    return Math.max(linearBaseForJob, CROSS_REGION_MIN_BASE_THB);
  }, [linearBaseForJob, crossRegionTrip]);

  const effectiveMarkupRate =
    distancePricingSettings?.markup_rate ?? DEFAULT_TRANSPORT_MATCH_MARKUP_RATE;

  const rawDistanceSubtotalThb = useMemo(() => {
    const base = distancePricingSettings?.base_fare_thb ?? DISTANCE_PRICING_DEFAULTS.base_fare_thb;
    const perKm =
      distancePricingSettings?.price_per_km_thb ?? DISTANCE_PRICING_DEFAULTS.price_per_km_thb;
    return Math.round((base + Math.max(0, distanceKm) * perKm) * 100) / 100;
  }, [distanceKm, distancePricingSettings]);

  const routeLinePositions: LatLngExpression[] = useMemo(() => {
    const end = previewDropoff ?? dropoff;
    if (!end) return [];
    if (osrm?.coordinates && osrm.coordinates.length >= 2) {
      return osrm.coordinates as LatLngExpression[];
    }
    return [pickup as LatLngExpression, end as LatLngExpression];
  }, [pickup, dropoff, previewDropoff, osrm]);

  const visibleVehicles = useMemo(() => {
    if (subService === "shuttle") {
      return VEHICLES.filter((v) => !v.shuttleExcluded);
    }
    return VEHICLES.filter((v) => !v.shuttleOnly);
  }, [subService]);

  useEffect(() => {
    const inList = visibleVehicles.some((v) => v.id === selectedVehicle);
    if (!inList && visibleVehicles.length > 0) {
      setSelectedVehicle(visibleVehicles[0].id);
    }
  }, [subService, visibleVehicles, selectedVehicle]);

  const vehicle = visibleVehicles.find((v) => v.id === selectedVehicle) || visibleVehicles[0];

  const intercityBreakdown = useMemo(() => {
    if (transportJobKind !== "intercity_charter" || !transportPricing?.formula) return null;
    return computeIntercityQuoteBreakdown({
      distanceKm,
      vehicleMultiplier: vehicle.priceMultiplier,
      insuranceEnabled: insurance,
      insuranceRatePercent,
      formula: transportPricing.formula,
    });
  }, [
    transportJobKind,
    transportPricing,
    distanceKm,
    vehicle.priceMultiplier,
    insurance,
    insuranceRatePercent,
  ]);

  const pricingActive =
    transportJobKind === "intercity_charter" && !!transportPricing?.intercity_pricing_globally_enabled;

  const legacyJobFee = Math.round(basePrice * vehicle.priceMultiplier * 100) / 100;
  const jobFee = pricingActive && intercityBreakdown ? intercityBreakdown.jobFeeThb : legacyJobFee;
  const insuranceAmount = insurance
    ? pricingActive && intercityBreakdown
      ? intercityBreakdown.insuranceAmount
      : Math.round(legacyJobFee * (insuranceRatePercent / 100) * 100) / 100
    : 0;
  const baseAmount = jobFee + insuranceAmount;
  const serviceFee =
    pricingActive && intercityBreakdown
      ? intercityBreakdown.serviceFeeThb
      : Math.round(baseAmount * effectiveMarkupRate * 100) / 100;
  const totalPrice =
    pricingActive && intercityBreakdown
      ? intercityBreakdown.finalPrice
      : Math.round(baseAmount * (1 + effectiveMarkupRate) * 100) / 100;

  const handleSearchConfirm = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setGeocoding(true);
    try {
      const res = await resolveTransportDestination(q, serviceRegion);
      if (res) {
        applyDestination(res.lat, res.lng, res.label);
        if (!mapExpanded) setSearchFocused(false);
      } else {
        notify(t("transport.geocode_not_found"), "error");
      }
    } finally {
      setGeocoding(false);
    }
  }, [searchQuery, mapExpanded, applyDestination, notify, t, serviceRegion]);

  const handleMapDestination = useCallback((lat: number, lng: number) => {
    setPreviewDropoff([lat, lng]);
  }, []);

  const showPickConfirm = !!previewDropoff;

  const handleRequestNow = async () => {
    if (!dropoff) {
      notify(t("transport.need_destination"), "error");
      return;
    }
    setLoading(true);
    setStep(4);
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const userId = user?.id || localStorage.getItem("meerak_user_id");
      if (!userId) {
        setLoading(false);
        return;
      }
      const descParts: string[] = [];
      if (ladyDriver) descParts.push(t("transport.lady_driver"));
      if (additionalDetails) descParts.push(additionalDetails);
      const description = descParts.length ? descParts.join(" • ") : "บริการขนส่ง";
      const destText = destinationLabel || searchQuery.trim() || t("transport.destination_label");
      const transport_contract = buildTransportHubTransportContract({
        jobKind: transportJobKind,
        serviceRegion,
        pickup,
        dropoff,
        destinationLabel: destText,
        crossRegion: !!crossRegionTrip,
        distanceKm,
        clientEstimateJobFeeThb: jobFee,
      });
      const jobPayload = {
        title: `${t(`transport.${subService || "driver"}`)} - ${destText}`,
        description,
        category: "Driver",
        /** ยอดที่ลูกค้าจ่ายจริง (รวมค่าประกัน + markup 5% ตามหน้าจอ) — ตรงกับ financialEngine */
        price: totalPrice,
        transport_insurance_amount: insuranceAmount,
        duration_hours: 2,
        datetime: new Date().toISOString(),
        assigned_to: null,
        location: {
          lat: dropoff[0],
          lng: dropoff[1],
          fullAddress: destText,
          address: destText,
        },
        created_by: String(userId),
        status: "open",
        tips_amount: 0,
        _submitted_at: new Date().toISOString(),
        _source: "transport_hub",
        _vehicle: selectedVehicle,
        _payment: paymentMethod,
        has_insurance: insurance,
        transport_contract,
      };
      const createdJob = await MockApi.createJob(jobPayload);
      if (createdJob?.id) {
        try {
          localStorage.setItem(`job_insurance_${createdJob.id}`, String(insurance));
        } catch (_) {}
      }
      setStep(5);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const MapBlock = ({ fullScreen = false }: { fullScreen?: boolean }) => (
    <div
      data-tour="driver-map"
      className={`rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white flex flex-col ${
        fullScreen ? "fixed inset-0 z-[100] mt-0 rounded-none" : "h-[280px]"
      }`}
    >
      {fullScreen && (
        <>
          {/* Top bar: Back + Search — หัวข้อชัดเจน กดได้ */}
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-gray-200 shadow-md shrink-0">
            <button
              onClick={() => {
                setSearchFocused(false);
                setMapExpanded(false);
              }}
              className="p-2.5 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl bg-white border-2 border-gray-200 focus-within:border-[#00875A] min-h-[48px]">
              <Search className="w-5 h-5 text-gray-500 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void handleSearchConfirm()}
                placeholder={t("transport.search_placeholder")}
                className="flex-1 py-2 bg-transparent text-gray-900 placeholder-gray-500 text-base outline-none min-w-0"
                autoFocus
              />
              <button
                type="button"
                disabled={geocoding}
                onClick={() => void handleSearchConfirm()}
                className="px-3 py-1.5 rounded-lg text-white font-semibold text-sm shrink-0 disabled:opacity-60 inline-flex items-center gap-1.5"
                style={{ backgroundColor: AQOND_GREEN }}
              >
                {geocoding ? <Loader2 size={16} className="animate-spin" /> : null}
                {t("transport.search")}
              </button>
            </div>
          </div>
          {/* Map area */}
          <div className="flex-1 min-h-0 relative">
            <MapContainer
              center={
                mapMarkerPos
                  ? [(pickup[0] + mapMarkerPos[0]) / 2, (pickup[1] + mapMarkerPos[1]) / 2]
                  : pickup
              }
              zoom={13}
              className="w-full h-full absolute inset-0"
              style={{ minHeight: 200 }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              {mapMarkerPos && <MapBoundsUpdater pickup={pickup} dropoff={mapMarkerPos} />}
              <MapClickHandler onPickDestination={handleMapDestination} />
              <Marker position={pickup} icon={createPickupIcon()} />
              {mapMarkerPos && (
                <Marker
                  position={mapMarkerPos}
                  icon={createDestinationIcon(mapMarkerLabel)}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const { lat, lng } = e.target.getLatLng();
                      setPreviewDropoff([lat, lng]);
                    },
                  }}
                />
              )}
              {routeLinePositions.length >= 2 && (
                <Polyline
                  positions={routeLinePositions}
                  pathOptions={{
                    color: AQOND_GREEN,
                    weight: 4,
                    opacity: previewDropoff ? 0.65 : 0.92,
                    dashArray: previewDropoff ? "10 12" : undefined,
                  }}
                />
              )}
            </MapContainer>
            {showPickConfirm && (
              <div className="absolute bottom-20 left-4 right-4 z-[2000] flex justify-center pointer-events-none">
                <button
                  type="button"
                  onClick={() => void confirmPreviewPin()}
                  className="pointer-events-auto px-5 py-3 rounded-2xl font-bold text-white shadow-xl border border-white/20"
                  style={{ backgroundColor: AQOND_GREEN }}
                >
                  {t("transport.select_this_point")}
                </button>
              </div>
            )}
          </div>
          {mapMarkerPos && (
            <div className="shrink-0 px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 flex items-center gap-2">
              {osrmLoading ? (
                <Loader2 size={14} className="animate-spin shrink-0 text-[#00875A]" />
              ) : (
                <Navigation size={14} className="shrink-0 text-gray-400" />
              )}
              <span>
                {osrmLoading
                  ? t("transport.osrm_loading")
                  : osrm
                    ? t("transport.osrm_route_hint")
                        .replace("{km}", osrm.distanceKm.toFixed(1))
                        .replace("{min}", String(Math.round(osrm.durationMin)))
                    : t("transport.osrm_unavailable")}
              </span>
            </div>
          )}
          {/* Bottom: Continue button — อยู่เหนือ bottom nav (pb-safe สำหรับจอมี notch) */}
          <div className="p-4 pb-8 bg-white border-t border-gray-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] shrink-0">
            <button
              type="button"
              onClick={() => {
                if (!dropoff) return;
                setSearchFocused(false);
                setMapExpanded(false);
                setStep(3);
              }}
              disabled={!dropoff}
              className={`w-full py-4 rounded-2xl font-bold text-base shadow-sm flex items-center justify-center gap-2 transition-all ${
                dropoff ? "text-white hover:opacity-95" : "bg-gray-200 text-gray-500 cursor-not-allowed"
              }`}
              style={dropoff ? { backgroundColor: AQOND_GREEN } : {}}
            >
              <Navigation size={20} />
              {t("transport.continue")}
            </button>
          </div>
        </>
      )}
      {!fullScreen && (
        <div className="relative h-[280px] w-full">
          <MapContainer
            center={
              mapMarkerPos
                ? [(pickup[0] + mapMarkerPos[0]) / 2, (pickup[1] + mapMarkerPos[1]) / 2]
                : pickup
            }
            zoom={13}
            className="w-full h-full z-0"
            style={{ minHeight: 280 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mapMarkerPos && <MapBoundsUpdater pickup={pickup} dropoff={mapMarkerPos} />}
            <MapClickHandler onPickDestination={handleMapDestination} />
            <Marker position={pickup} icon={createPickupIcon()} />
            {mapMarkerPos && (
              <Marker
                position={mapMarkerPos}
                icon={createDestinationIcon(mapMarkerLabel)}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    setPreviewDropoff([lat, lng]);
                  },
                }}
              />
            )}
            {routeLinePositions.length >= 2 && (
              <Polyline
                positions={routeLinePositions}
                pathOptions={{
                  color: AQOND_GREEN,
                  weight: 4,
                  opacity: previewDropoff ? 0.65 : 0.92,
                  dashArray: previewDropoff ? "10 12" : undefined,
                }}
              />
            )}
          </MapContainer>
          {showPickConfirm && (
            <div className="absolute bottom-14 left-3 right-3 z-[2000] flex justify-center pointer-events-none">
              <button
                type="button"
                onClick={() => void confirmPreviewPin()}
                className="pointer-events-auto px-4 py-2.5 rounded-xl font-bold text-sm text-white shadow-lg"
                style={{ backgroundColor: AQOND_GREEN }}
              >
                {t("transport.select_this_point")}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMapExpanded(true)}
            className="absolute bottom-3 right-3 z-[1000] inline-flex items-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-gray-800 shadow-lg border border-gray-200 hover:bg-white"
          >
            <Maximize2 size={16} />
            {t("transport.expand_map")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PreLaunchServiceBlock title="จองรถ / รับ-ส่ง" />
      <header className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm px-4 py-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="p-2 -ml-1 rounded-full hover:bg-gray-100 transition-colors text-gray-600">
            <ChevronLeft size={24} />
          </Link>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${AQOND_GREEN}15` }}
            >
              <Car size={22} strokeWidth={2.5} style={{ color: AQOND_GREEN }} />
            </div>
            <div>
              <h1 className="font-bold text-lg text-gray-900">{t("home.svc_driver_title")}</h1>
              <p className="text-gray-500 text-sm">
                {step === 1 && t("transport.choose_service")}
                {step === 2 && t("transport.where_to")}
                {step === 3 && t("transport.review")}
                {step === 4 && t("transport.searching")}
                {step === 5 && t("booking.step3_title")}
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto">
        {(language === "en" ? mobileAppConfig.remote.transportNoticeEn : mobileAppConfig.remote.transportNoticeTh)
          ?.trim() ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950 whitespace-pre-wrap">
            {language === "en"
              ? mobileAppConfig.remote.transportNoticeEn
              : mobileAppConfig.remote.transportNoticeTh}
          </div>
        ) : null}
        {step === 1 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {SUB_SERVICES.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSubService(s.id);
                      setStep(2);
                    }}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-[#00875A]/20 transition-all text-left"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center border border-gray-100"
                      style={{ color: AQOND_GREEN }}
                    >
                      <Icon size={26} strokeWidth={2} />
                    </div>
                    <span className="font-bold text-gray-900 text-center text-sm">{t(s.labelKey)}</span>
                    <span className="text-xs text-gray-500 text-center">{t(s.subKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="svc-region" className="text-xs text-gray-500 shrink-0">
                {t("transport.service_region")}
              </label>
              <select
                id="svc-region"
                value={serviceRegion}
                onChange={(e) => onServiceRegionChange(e.target.value as TransportRegionId)}
                className="flex-1 min-w-[180px] text-sm rounded-xl border border-gray-200 px-3 py-2 bg-white text-gray-900"
              >
                {(Object.keys(TRANSPORT_REGIONS) as TransportRegionId[]).map((id) => (
                  <option key={id} value={id}>
                    {t(`transport.region_${id}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative z-30">
              <div
                className={`flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border shadow-sm transition-all ${
                  searchFocused ? "border-[#00875A]/40 shadow-md" : "border-gray-100"
                }`}
              >
                <Search className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => {
                    window.setTimeout(() => setSearchFocused(false), 220);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && void handleSearchConfirm()}
                  placeholder={t("transport.search_placeholder")}
                  className="flex-1 py-2 bg-transparent text-gray-900 placeholder-gray-400 text-base outline-none"
                  autoComplete="off"
                />
                <button
                  type="button"
                  disabled={geocoding}
                  onClick={() => void handleSearchConfirm()}
                  className="px-4 py-2 rounded-xl text-white font-semibold text-sm shrink-0 disabled:opacity-60 inline-flex items-center gap-1.5"
                  style={{ backgroundColor: AQOND_GREEN }}
                >
                  {geocoding ? <Loader2 size={16} className="animate-spin" /> : null}
                  {t("transport.search")}
                </button>
              </div>

              {searchFocused && !mapExpanded && suggestionRows.length > 0 && (
                <div
                  ref={suggestionRef}
                  className="absolute left-0 right-0 top-full mt-1 rounded-2xl border border-gray-200 bg-white shadow-xl max-h-60 overflow-y-auto"
                >
                  <p className="text-[11px] text-gray-500 px-3 py-2 border-b border-gray-100 bg-gray-50/80">
                    {t("transport.popular_suggestions")}
                  </p>
                  {suggestionRows.map((row) => (
                    <button
                      key={row.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        applyDestination(row.lat, row.lng, row.label);
                        setSearchFocused(false);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-[#00875A]/8 border-b border-gray-50 last:border-0"
                    >
                      {row.label}
                    </button>
                  ))}
                </div>
              )}

              {!searchFocused && savedPlaces.recent.length > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] text-gray-500 mb-2">{t("transport.recent_searches")}</p>
                  <div className="flex flex-wrap gap-2">
                    {[...savedPlaces.recent]
                      .sort((a, b) => haversineKm(pickupPt, a) - haversineKm(pickupPt, b))
                      .slice(0, 8)
                      .map((r) => (
                        <button
                          key={`recent-chip-${r.at}-${r.label}`}
                          type="button"
                          onClick={() => {
                            applyDestination(r.lat, r.lng, r.label);
                          }}
                          className="max-w-[200px] truncate px-3 py-1.5 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-800 hover:border-[#00875A]/35 hover:bg-[#00875A]/5"
                        >
                          {r.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {!mapExpanded && (
              <>
                <div className="flex flex-wrap gap-2">
                  {FAVORITE_PLACES.map((f) => {
                    const Icon = f.icon;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          if (f.id === "central") {
                            const poi = getCentralLandmarkPoi(serviceRegion);
                            if (poi) applyDestination(poi.lat, poi.lng, poi.label);
                            return;
                          }
                          if (f.id === "home") {
                            const h = savedPlaces.home;
                            if (h) applyDestination(h.lat, h.lng, h.label);
                            else notify(t("transport.no_home_saved"), "info");
                            return;
                          }
                          if (f.id === "office") {
                            const o = savedPlaces.office;
                            if (o) applyDestination(o.lat, o.lng, o.label);
                            else notify(t("transport.no_office_saved"), "info");
                            return;
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-gray-100 shadow-sm text-sm text-gray-700 hover:border-[#00875A]/30 hover:shadow"
                      >
                        <Icon size={14} className="text-gray-500" />
                        {t(f.labelKey)}
                      </button>
                    );
                  })}
                </div>

                {dropoff && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const label = destinationLabel || searchQuery.trim() || t("transport.destination_label");
                        saveTransportHome({
                          lat: dropoff[0],
                          lng: dropoff[1],
                          label,
                        });
                        setSavedVersion((v) => v + 1);
                        schedulePushToProfile();
                        notify(t("transport.saved_home_ok"), "success");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-emerald-200 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
                    >
                      <Home size={14} />
                      {t("transport.save_as_home")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const label = destinationLabel || searchQuery.trim() || t("transport.destination_label");
                        saveTransportOffice({
                          lat: dropoff[0],
                          lng: dropoff[1],
                          label,
                        });
                        setSavedVersion((v) => v + 1);
                        notify(t("transport.saved_office_ok"), "success");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-sky-200 text-sm font-medium text-sky-900 hover:bg-sky-50"
                    >
                      <Building2 size={14} />
                      {t("transport.save_as_office")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const label = destinationLabel || searchQuery.trim() || t("transport.destination_label");
                        addTransportFavorite({
                          lat: dropoff[0],
                          lng: dropoff[1],
                          label,
                        });
                        setSavedVersion((v) => v + 1);
                        schedulePushToProfile();
                        notify(t("transport.saved_favorite_ok"), "success");
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-amber-200 text-sm font-medium text-amber-900 hover:bg-amber-50"
                    >
                      <Star size={14} />
                      {t("transport.save_favorite")}
                    </button>
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  {t("transport.drivers_available").replace("{count}", String(driversNearby))}
                </p>
              </>
            )}

            <MapBlock fullScreen={mapExpanded} />

            {!mapExpanded && (
              <>
                {crossRegionTrip && (
                  <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-2">
                    {t("transport.cross_region_hint")}
                  </p>
                )}
                <p className="text-xs text-gray-500 flex items-center gap-2">
                  <MapPin size={14} />
                  {t("transport.tap_map_hint")}
                </p>
                {mapMarkerPos && (
                  <p className="text-xs text-gray-600 flex items-center gap-2 min-h-[1.25rem]">
                    {osrmLoading ? <Loader2 size={14} className="animate-spin shrink-0 text-[#00875A]" /> : null}
                    <span>
                      {osrmLoading
                        ? t("transport.osrm_loading")
                        : osrm
                          ? t("transport.osrm_route_hint")
                              .replace("{km}", osrm.distanceKm.toFixed(1))
                              .replace("{min}", String(Math.round(osrm.durationMin)))
                          : t("transport.osrm_unavailable")}
                    </span>
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!dropoff) return;
                    setStep(3);
                  }}
                  disabled={!dropoff}
                  className={`w-full py-4 rounded-2xl font-bold text-base shadow-sm flex items-center justify-center gap-2 transition-all ${
                    dropoff ? "text-white hover:opacity-95" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                  }`}
                  style={dropoff ? { backgroundColor: AQOND_GREEN } : {}}
                >
                  <Navigation size={20} />
                  {t("transport.continue")}
                </button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <p className="text-xs text-gray-500">
              {t("transport.drivers_available").replace("{count}", String(driversNearby))}
            </p>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
              <h3 className="font-bold text-gray-900 text-lg">{t("transport.trip_summary")}</h3>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">{t("transport.job_type_label")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTransportJobKind("local_on_demand")}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${
                      transportJobKind === "local_on_demand"
                        ? "border-[#00875A] bg-[#00875A]/8 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span className="block text-sm font-bold text-gray-900">{t("transport.job_type_local")}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">{t("transport.job_type_local_sub")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTransportJobKind("intercity_charter")}
                    className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${
                      transportJobKind === "intercity_charter"
                        ? "border-amber-500 bg-amber-50 shadow-sm"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    <span className="block text-sm font-bold text-gray-900">{t("transport.job_type_intercity")}</span>
                    <span className="block text-[11px] text-gray-500 mt-0.5">{t("transport.job_type_intercity_sub")}</span>
                  </button>
                </div>
              </div>
              {transportJobKind === "intercity_charter" && intercityBreakdown && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 space-y-1.5 text-xs text-gray-800">
                  <div className="flex justify-between items-center gap-2">
                    <span className="font-bold text-amber-950">{t("transport.intercity_breakdown_title")}</span>
                    {pricingActive ? (
                      <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                        {t("transport.pricing_engine_active")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-800">{t("transport.pricing_engine_preview")}</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span>
                      {t("transport.intercity_distance_line")
                        .replace("{km}", String(intercityBreakdown.distanceKm))
                        .replace("{rate}", String(transportPricing?.formula?.thb_per_km ?? 15))}
                    </span>
                    <span className="font-mono">{intercityBreakdown.distanceChargeThb.toLocaleString()} ฿</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("transport.intercity_surcharge")}</span>
                    <span className="font-mono">{intercityBreakdown.baseSurchargeThb.toLocaleString()} ฿</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>{t("transport.intercity_floor")}</span>
                    <span className="font-mono">≥ {intercityBreakdown.floorJobFeeThb.toLocaleString()} ฿</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t("transport.intercity_vehicle_line").replace("{m}", String(intercityBreakdown.vehicleMultiplier))}</span>
                    <span className="font-mono">{intercityBreakdown.jobFeeThb.toLocaleString()} ฿</span>
                  </div>
                </div>
              )}
              {crossRegionTrip && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200/80 rounded-xl px-3 py-2">
                  {t("transport.cross_region_hint")}
                </p>
              )}
              {crossRegionTrip && (
                <p className="text-xs text-gray-600">
                  {t("transport.cross_region_floor").replace("{n}", String(CROSS_REGION_MIN_BASE_THB))}
                </p>
              )}
              {transportJobKind === "local_on_demand" && dropoff && !previewDropoff && distanceKm > 0 ? (
                <div className="rounded-xl border border-[#00875A]/25 bg-emerald-50/70 p-3 space-y-2 text-xs text-gray-800">
                  <div className="font-bold text-gray-900">Fare breakdown</div>
                  <p className="text-gray-700 leading-relaxed">
                    ราคาเริ่มต้น ฿
                    {(distancePricingSettings?.base_fare_thb ?? DISTANCE_PRICING_DEFAULTS.base_fare_thb).toLocaleString()}{" "}
                    + (฿
                    {(distancePricingSettings?.price_per_km_thb ?? DISTANCE_PRICING_DEFAULTS.price_per_km_thb).toLocaleString()}
                    /กม. × {distanceKm} กม.) = ฿
                    {rawDistanceSubtotalThb.toLocaleString()}
                    {rawDistanceSubtotalThb <
                    (distancePricingSettings?.minimum_fare_thb ?? DISTANCE_PRICING_DEFAULTS.minimum_fare_thb) ? (
                      <span className="text-gray-600">
                        {" "}
                        → ใช้ขั้นต่ำ ฿
                        {(
                          distancePricingSettings?.minimum_fare_thb ??
                          DISTANCE_PRICING_DEFAULTS.minimum_fare_thb
                        ).toLocaleString()}{" "}
                        (ฐานระยะทาง)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-gray-600">
                    ระยะทางรวม: <span className="font-mono font-semibold text-gray-900">{distanceKm} กม.</span>
                  </p>
                </div>
              ) : null}
              <div className="flex justify-between text-gray-600">
                <span>{t("transport.distance")}</span>
                <span className="font-mono font-semibold">~{distanceKm} km</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{t("transport.estimated_price")}</span>
                <span className="font-mono font-bold" style={{ color: AQOND_GREEN }}>
                  {totalPrice} ฿
                </span>
              </div>
              <div className="space-y-1 text-sm text-gray-500 border-t border-gray-100 pt-3">
                <div className="flex justify-between">
                  <span>ค่าจ้างงาน</span>
                  <span className="font-mono">{jobFee.toLocaleString()} ฿</span>
                </div>
                {insurance && (
                  <div className="flex justify-between">
                    <span>เบี้ยประกัน ({insuranceRatePercent}%)</span>
                    <span className="font-mono">+{insuranceAmount.toLocaleString()} ฿</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>ค่าบริการ ({(effectiveMarkupRate * 100).toFixed(2)}%)</span>
                  <span className="font-mono">+{serviceFee.toLocaleString()} ฿</span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setInsurance(!insurance)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    insurance ? "border-[#00875A]/40 bg-[#00875A]/5" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <ShieldCheck
                    size={20}
                    style={{ color: insurance ? AQOND_GREEN : "#9ca3af" }}
                    className="shrink-0"
                  />
                  <div className="text-left">
                    <span className="font-medium text-gray-900 text-sm">ประกันงาน ({insuranceRatePercent}%)</span>
                    <p className="text-xs text-gray-500">คุ้มครองการจัดหาผู้รับงานใหม่ สูงสุด 40%</p>
                  </div>
                  <div
                    className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      insurance ? "border-[#00875A] bg-[#00875A]" : "border-gray-300"
                    }`}
                  >
                    {insurance && <span className="text-white text-xs">✓</span>}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setLadyDriver(!ladyDriver)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    ladyDriver ? "border-[#00875A]/40 bg-[#00875A]/5" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <UserCircle size={20} style={{ color: ladyDriver ? AQOND_GREEN : "#9ca3af" }} />
                  <div className="text-left">
                    <span className="font-medium text-gray-900 text-sm">{t("transport.lady_driver")}</span>
                    <p className="text-xs text-gray-500">{t("transport.lady_driver_desc")}</p>
                  </div>
                  <div
                    className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      ladyDriver ? "border-[#00875A] bg-[#00875A]" : "border-gray-300"
                    }`}
                  >
                    {ladyDriver && <span className="text-white text-xs">✓</span>}
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t("transport.additional_details")}
                </label>
                <textarea
                  value={additionalDetails}
                  onChange={(e) => setAdditionalDetails(e.target.value)}
                  placeholder={t("transport.details_placeholder")}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#00875A] focus:ring-2 focus:ring-[#00875A]/15 outline-none resize-none"
                />
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
            >
              {t("booking.back")}
            </button>

            {/* Schedule & Request Buttons (primary row) */}
            <div className="flex gap-3">
              <button
                onClick={() => notify(t("transport.schedule") + " — Coming soon", "info")}
                className="flex-1 py-4 rounded-2xl font-medium border border-gray-200 text-gray-700 flex items-center justify-center gap-2 hover:bg-gray-50 shadow-sm"
              >
                <Clock size={20} />
                {t("transport.schedule")}
              </button>
              <button
                onClick={handleRequestNow}
                className="flex-[1.5] py-4 rounded-2xl font-bold text-base text-white shadow-sm flex items-center justify-center gap-2 hover:opacity-95"
                style={{ backgroundColor: AQOND_GREEN }}
              >
                <img
                  src={vehicle.illustration}
                  alt=""
                  className="w-[22px] h-[22px] object-contain shrink-0 drop-shadow-sm brightness-110"
                  draggable={false}
                />
                {t("transport.request_vehicle").replace("{vehicle}", t(vehicle.labelKey))}
              </button>
            </div>

            {/* Vehicle Selection Panel — Below Schedule, scrollable bottom sheet */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden" data-tour="driver-vehicle">
              <div className="px-4 py-3 border-b border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {t("transport.trip_summary")} — {t(vehicle.labelKey)}
                </h4>
              </div>
              <div className="max-h-52 overflow-y-auto">
                {visibleVehicles.map((v) => {
                  const vLegacyFee = Math.round(basePrice * v.priceMultiplier * 100) / 100;
                  const rowIc =
                    pricingActive && transportPricing?.formula
                      ? computeIntercityQuoteBreakdown({
                          distanceKm,
                          vehicleMultiplier: v.priceMultiplier,
                          insuranceEnabled: insurance,
                          insuranceRatePercent,
                          formula: transportPricing.formula,
                        })
                      : null;
                  const vJobFee = rowIc ? rowIc.jobFeeThb : vLegacyFee;
                  const vIns = insurance
                    ? rowIc
                      ? rowIc.insuranceAmount
                      : Math.round(vLegacyFee * (insuranceRatePercent / 100) * 100) / 100
                    : 0;
                  const price = rowIc
                    ? rowIc.finalPrice
                    : Math.round((vJobFee + vIns) * (1 + effectiveMarkupRate) * 100) / 100;
                  const isSelected = selectedVehicle === v.id;
                  const isPremiumCard = v.isPremiumCard;
                  const isLuxuryTier = v.isLuxuryTier;
                  const accentColor = isPremiumCard ? "#dc2626" : isLuxuryTier ? "#b45309" : AQOND_GREEN;
                  const selectedVehicleRowClass = isPremiumCard
                    ? "bg-red-50 border-l-4 border-l-red-500"
                    : isLuxuryTier
                      ? "bg-amber-50 border-l-4 border-l-amber-600"
                      : "bg-[#00875A]/8 border-l-4 border-l-[#00875A]";
                  return (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicle(v.id)}
                      className={`w-full flex items-center gap-4 px-4 py-4 border-b border-gray-50 last:border-0 transition-colors ${
                        isSelected ? selectedVehicleRowClass : "hover:bg-gray-50"
                      }`}
                    >
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden px-1"
                        style={{ backgroundColor: isSelected ? `${accentColor}20` : "#f3f4f6" }}
                      >
                        <img
                          src={v.illustration}
                          alt=""
                          className="w-full h-full object-contain pointer-events-none select-none drop-shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                          draggable={false}
                        />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{t(v.seatsKey)}</p>
                        <p className="text-xs text-gray-500">
                          {t("transport.eta_mins").replace("{n}", String(v.etaMins))}
                        </p>
                      </div>
                      <span className="font-bold text-base shrink-0" style={{ color: accentColor }}>
                        {price} ฿
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Method — Above main action */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                {t("transport.payment_method")}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setPaymentMethod("wallet")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                    paymentMethod === "wallet"
                      ? "border-[#00875A] bg-[#00875A]/10"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Wallet size={20} style={{ color: paymentMethod === "wallet" ? AQOND_GREEN : "#6b7280" }} />
                  <span className="font-medium" style={{ color: paymentMethod === "wallet" ? AQOND_GREEN : "#374151" }}>
                    {t("transport.payment_wallet")}
                  </span>
                  {user?.wallet_balance != null && (
                    <span className="text-xs text-gray-500">({user.wallet_balance} ฿)</span>
                  )}
                </button>
                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                    paymentMethod === "cash"
                      ? "border-[#00875A] bg-[#00875A]/10"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Banknote size={20} style={{ color: paymentMethod === "cash" ? AQOND_GREEN : "#6b7280" }} />
                  <span className="font-medium" style={{ color: paymentMethod === "cash" ? AQOND_GREEN : "#374151" }}>
                    {t("transport.payment_cash")}
                  </span>
                </button>
              </div>
            </div>

            {/* Main Action — Request {vehicle} */}
            <button
              onClick={handleRequestNow}
              className="w-full py-4 rounded-2xl font-bold text-base text-white shadow-sm flex items-center justify-center gap-2 hover:opacity-95"
              style={{ backgroundColor: AQOND_GREEN }}
            >
              <img
                src={vehicle.illustration}
                alt=""
                className="w-[22px] h-[22px] object-contain shrink-0 drop-shadow-sm brightness-110"
                draggable={false}
              />
              {t("transport.request_vehicle").replace("{vehicle}", t(vehicle.labelKey))}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-16 space-y-8">
            <div className="relative inline-block">
              <div
                className="w-24 h-24 rounded-full animate-ping absolute inset-0 opacity-30"
                style={{ backgroundColor: AQOND_GREEN }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center shadow-inner overflow-hidden"
                style={{ backgroundColor: AQOND_GREEN }}
              >
                <img
                  src={vehicle.illustration}
                  alt=""
                  className="w-[56px] h-[56px] object-contain drop-shadow-md brightness-110 contrast-105"
                  draggable={false}
                />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t("transport.searching_title")}</h2>
              <p className="text-gray-500 mt-2">{t("transport.searching_subtitle")}</p>
              {transportJobKind === "intercity_charter" && (
                <p className="text-sm font-semibold text-gray-800 mt-3">
                  {t("transport.searching_offer")}: {totalPrice} ฿
                  {pricingActive ? (
                    <span className="block text-xs font-normal text-emerald-700 mt-1">
                      {t("transport.pricing_engine_active")}
                    </span>
                  ) : null}
                </p>
              )}
            </div>
            <div className="flex justify-center gap-2">
              <span
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: AQOND_GREEN, animationDelay: "0ms" }}
              />
              <span
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: AQOND_GREEN, animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 rounded-full animate-bounce"
                style={{ backgroundColor: AQOND_GREEN, animationDelay: "300ms" }}
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="text-center space-y-6 py-8">
            <div
              className="inline-flex items-center justify-center w-24 h-24 rounded-full"
              style={{ backgroundColor: `${AQOND_GREEN}20` }}
            >
              <CheckCircle2 size={56} style={{ color: AQOND_GREEN }} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{t("booking.success_title")}</h2>
            <p className="text-gray-600">{t("booking.success_subtitle")}</p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 text-amber-800 font-medium border border-amber-100">
              {t("booking.status_waiting")}
            </div>
            <div className="confetti-container relative py-8">
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="confetti-piece"
                  style={{
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    background: [AQOND_GREEN, "#0077b6", "#ffb703", "#0d9488"][i % 4],
                  }}
                />
              ))}
            </div>
            <Link
              to="/my-jobs"
              className="block w-full py-4 rounded-2xl font-bold text-lg text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: AQOND_GREEN }}
            >
              {t("booking.go_to_my_jobs")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
