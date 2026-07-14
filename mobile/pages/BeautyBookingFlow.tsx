import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { adsService } from "../services/adsService";
import { useNotification } from "../context/NotificationContext";
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Scissors,
  Calendar,
  Wallet,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  calcBeautyEmployerTotal,
  resolveMerchantHubPercent,
} from "../constants/beautyBookingFees";
import { getServiceMerchantMeta } from "../constants/serviceMerchantCategories";
import { useAuth } from "../context/AuthContext";

const markerIcon = L.icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface ServiceItem {
  id: string;
  item_type: string;
  title: string;
  price: number;
}

interface Slot {
  id: string;
  start_time: string;
  end_time: string;
}

function MapClickPicker({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export const BeautyBookingFlow: React.FC = () => {
  const { id: talentId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { notify } = useNotification();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [profile, setProfile] = useState<{
    settings: Record<string, unknown>;
    services: ServiceItem[];
    policy: Record<string, unknown>;
    expert_category?: string | null;
  } | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [locationMode, setLocationMode] = useState<"at_shop" | "at_home">(
    "at_shop",
  );
  const [mainId, setMainId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [slotId, setSlotId] = useState("");
  const [customerPin, setCustomerPin] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [transportQuote, setTransportQuote] = useState<{
    distance_km: number;
    transport_total: number;
    vehicle_type: string | null;
    vehicle_plate: string | null;
  } | null>(null);

  useEffect(() => {
    adsService.captureAdClickFromUrl(searchParams);
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!talentId) return;
    setLoading(true);
    try {
      const [profRes, slotRes] = await Promise.all([
        api.get(`/providers/${talentId}/beauty-profile`),
        api.get(`/availability/${talentId}`),
      ]);
      setProfile(profRes.data);
      setSlots(slotRes.data?.slots || []);
      const mains = (profRes.data?.services || []).filter(
        (s: ServiceItem) => s.item_type === "main",
      );
      if (mains[0]) setMainId(mains[0].id);
    } catch {
      notify("โหลดข้อมูลช่างไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  }, [talentId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const mains = useMemo(
    () => (profile?.services || []).filter((s) => s.item_type === "main"),
    [profile],
  );
  const addons = useMemo(
    () => (profile?.services || []).filter((s) => s.item_type === "addon"),
    [profile],
  );

  const serviceSubtotal = useMemo(() => {
    const items = profile?.services || [];
    let sum = 0;
    const main = items.find((s) => s.id === mainId);
    if (main) sum += main.price;
    for (const id of addonIds) {
      const a = items.find((s) => s.id === id);
      if (a) sum += a.price;
    }
    return sum;
  }, [profile, mainId, addonIds]);

  const transportTotal =
    locationMode === "at_home" && transportQuote
      ? transportQuote.transport_total
      : 0;
  const quotedPrice = serviceSubtotal + transportTotal;
  const baseFare = profile?.policy?.transport_base_fare_thb ?? 45;
  const feePercent = resolveMerchantHubPercent(
    profile?.policy as Record<string, unknown> | undefined,
    "employer_service_fee_percent",
    "employer_service_fee_by_tier",
    user?.vip_tier,
  );
  const { employerServiceFee, employerTotal } = calcBeautyEmployerTotal(
    quotedPrice,
    feePercent,
  );

  const fetchTransport = async (lat: number, lng: number) => {
    if (!talentId) return;
    try {
      const res = await api.get(
        `/providers/${talentId}/transport-quote?lat=${lat}&lng=${lng}`,
      );
      setTransportQuote(res.data);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "คำนวณระยะทางไม่สำเร็จ";
      notify(msg, "error");
    }
  };

  const shopLat = Number(profile?.settings?.shop_lat) || 13.7563;
  const shopLng = Number(profile?.settings?.shop_lng) || 100.5018;

  const submit = async () => {
    if (!talentId || !slotId || !mainId) {
      return notify("เลือกบริการและเวลาให้ครบ", "error");
    }
    if (locationMode === "at_home" && !customerPin) {
      return notify("เลือกจุดบนแผนที่", "error");
    }
    setSubmitting(true);
    try {
      const res = await api.post("/bookings/beauty", {
        talent_id: talentId,
        slot_id: slotId,
        location_mode: locationMode,
        main_item_id: mainId,
        addon_item_ids: addonIds,
        customer_lat: customerPin?.lat,
        customer_lng: customerPin?.lng,
        ...adsService.getAdClickPayloadForBooking(),
        adSurface: adsService.getStoredClickAttribution()?.surface || "MARKETPLACE",
      });
      notify("จองคิวสำเร็จ — รอช่างยืนยัน", "success");
      navigate("/my-bookings", { state: { bookingId: res.data?.booking?.id } });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "จองไม่สำเร็จ";
      notify(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const bookMeta = getServiceMerchantMeta(profile?.expert_category);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-emerald-600" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
        <Link
          to={`/talents/${talentId}`}
          className="p-2 rounded-lg hover:bg-slate-100"
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-bold text-slate-800">{bookMeta.bookingTitle}</h1>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-5">
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <label className="text-sm font-semibold text-slate-800">
            ประเภทการจอง
          </label>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
            value={locationMode}
            onChange={(e) => {
              setLocationMode(e.target.value as "at_shop" | "at_home");
              setTransportQuote(null);
              setCustomerPin(null);
            }}
          >
            <option value="at_shop">จองที่สถานที่ให้บริการ</option>
            <option value="at_home">บริการนอกสถานที่ (On-site)</option>
          </select>
        </section>

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Scissors size={18} /> เลือกบริการ
          </div>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
            value={mainId}
            onChange={(e) => setMainId(e.target.value)}
          >
            {mains.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} — ฿{m.price}
              </option>
            ))}
          </select>
          {addons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">บริการเสริม</p>
              {addons.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={addonIds.includes(a.id)}
                    onChange={(e) => {
                      setAddonIds((ids) =>
                        e.target.checked
                          ? [...ids, a.id]
                          : ids.filter((x) => x !== a.id),
                      );
                    }}
                  />
                  {a.title} (+฿{a.price})
                </label>
              ))}
            </div>
          )}
        </section>

        {locationMode === "at_home" && (
          <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <MapPin size={18} /> เลือกจุดให้ช่างไปหา
            </div>
            <div className="h-52 rounded-xl overflow-hidden border border-slate-200">
              <MapContainer
                center={[shopLat, shopLng]}
                zoom={12}
                className="h-full w-full"
                scrollWheelZoom
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[shopLat, shopLng]} icon={markerIcon} />
                {customerPin && (
                  <Marker
                    position={[customerPin.lat, customerPin.lng]}
                    icon={markerIcon}
                  />
                )}
                <MapClickPicker
                  onPick={(lat, lng) => {
                    setCustomerPin({ lat, lng });
                    void fetchTransport(lat, lng);
                  }}
                />
              </MapContainer>
            </div>
            {transportQuote && (
              <div className="text-sm text-slate-700 space-y-1 bg-slate-50 rounded-xl p-3">
                <p>ระยะทาง: {transportQuote.distance_km} กม.</p>
                <p>
                  รถ: {transportQuote.vehicle_type || "—"} ·{" "}
                  {transportQuote.vehicle_plate || "—"}
                </p>
                <p>
                  ค่าโดยสาร: ฿{baseFare} + ระยะทาง = ฿
                  {transportQuote.transport_total}
                </p>
              </div>
            )}
          </section>
        )}

        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar size={18} /> เลือกเวลา
          </div>
          <select
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm"
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
          >
            <option value="">— เลือกคิว —</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.start_time).toLocaleString("th-TH")} –{" "}
                {new Date(s.end_time).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </option>
            ))}
          </select>
        </section>

        <section className="bg-emerald-50 rounded-2xl border border-emerald-200 p-4 text-sm space-y-1">
          <div className="flex items-center gap-2 font-semibold text-emerald-900 mb-2">
            <Wallet size={18} /> สรุปราคา
          </div>
          <p>บริการ: ฿{serviceSubtotal.toLocaleString()}</p>
          {locationMode === "at_home" && (
            <p>ค่าโดยสาร: ฿{transportTotal.toLocaleString()}</p>
          )}
          <p>รวมบริการ: ฿{quotedPrice.toLocaleString()}</p>
          <p>
            ค่าบริการแพลตฟอร์ม (+{feePercent}%): ฿
            {employerServiceFee.toLocaleString()}
          </p>
          <p className="font-bold text-emerald-900 text-base pt-1">
            รวมชำระ: ฿{employerTotal.toLocaleString()}
          </p>
        </section>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white font-bold disabled:opacity-60"
        >
          {submitting ? "กำลังจอง…" : "ยืนยันจองคิว"}
        </button>
      </div>
    </div>
  );
};

export default BeautyBookingFlow;
