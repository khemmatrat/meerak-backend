import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useNotification } from "../context/NotificationContext";
import { MockApi } from "../services/mockApi";
import { checkCarBoatSync } from "../services/marineService";
import {
  ChevronLeft,
  Sailboat,
  Ticket,
  Package,
  Fish,
  MapPin,
  Calendar,
  Clock,
  Wallet,
  Banknote,
  Anchor,
} from "lucide-react";

const MARINE_CYAN = "#0891b2";
const JOB_CATEGORY = "Marine";

const SUB_SERVICES = [
  { id: "charter", labelKey: "marine.charter", subKey: "marine.charter_sub", icon: Sailboat },
  { id: "ferry", labelKey: "marine.ferry", subKey: "marine.ferry_sub", icon: Ticket },
  { id: "express", labelKey: "marine.express", subKey: "marine.express_sub", icon: Package },
  { id: "activity", labelKey: "marine.activity", subKey: "marine.activity_sub", icon: Fish },
];

const PIERS = [
  { id: "chao-phraya", name: "ท่าเรือเจ้าพระยา (Bangkok)", lat: 13.7563, lng: 100.5018 },
  { id: "phuket-chalong", name: "ท่าเรือฉลอง (ภูเก็ต)", lat: 7.8154, lng: 98.3845 },
  { id: "krabi-ao-nang", name: "ท่าเรืออ่าวนาง (กระบี่)", lat: 8.0314, lng: 98.9201 },
  { id: "samui-nathon", name: "ท่าเรือนาทอน (สมุย)", lat: 9.5357, lng: 100.0629 },
];

const FERRY_ROUNDS = [
  { id: "r1", time: "08:00", label: "รอบเช้า 08:00" },
  { id: "r2", time: "11:00", label: "รอบสาย 11:00" },
  { id: "r3", time: "14:00", label: "รอบบ่าย 14:00" },
  { id: "r4", time: "17:00", label: "รอบเย็น 17:00" },
];

export const MarineHub: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { notify } = useNotification();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [subService, setSubService] = useState<string | null>(null);
  const [pierId, setPierId] = useState<string>("");
  const [date, setDate] = useState("");
  const [roundId, setRoundId] = useState("");
  const [durationHours, setDurationHours] = useState(4);
  const [destinationIsland, setDestinationIsland] = useState("");
  const [boatGrade, setBoatGrade] = useState<"standard" | "premium">("standard");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "wallet">("wallet");
  const [loading, setLoading] = useState(false);
  const [carEtaMinutes, setCarEtaMinutes] = useState<number | null>(null);
  const [carBoatConflict, setCarBoatConflict] = useState<boolean | null>(null);

  const isFerry = subService === "ferry";
  const requiresDeposit = subService === "charter" || subService === "activity";
  const basePrice = subService === "charter" ? 8000 : subService === "ferry" ? 450 : subService === "express" ? 1200 : 6000;
  const priceMultiplier = boatGrade === "premium" ? 1.5 : 1;
  const totalPrice = Math.round(basePrice * priceMultiplier);

  const handleBook = async () => {
    setLoading(true);
    setStep(4);
    await new Promise((r) => setTimeout(r, 500));
    try {
      const userId = user?.id || localStorage.getItem("meerak_user_id");
      if (!userId) {
        notify("กรุณาเข้าสู่ระบบก่อนจอง", "error");
        setLoading(false);
        return;
      }
      if (requiresDeposit && paymentMethod === "cash") {
        notify("เหมาลำ/กิจกรรมต้องชำระมัดจำผ่านวอลเล็ต", "error");
        setLoading(false);
        return;
      }
      const departureTime = FERRY_ROUNDS.find((r) => r.id === roundId)?.time || "10:00";
      const jobPayload = {
        title: `${t(`marine.${subService}`)} - ${destinationIsland || t("marine.destination_island")}`,
        description: `Marine booking: ${subService}, Pier: ${PIERS.find((p) => p.id === pierId)?.name || pierId}, Date: ${date}`,
        category: JOB_CATEGORY,
        price: totalPrice,
        duration_hours: isFerry ? 2 : durationHours,
        datetime: new Date(`${date}T${departureTime}:00`).toISOString(),
        assigned_to: null,
        location: {
          lat: PIERS.find((p) => p.id === pierId)?.lat ?? 13.7563,
          lng: PIERS.find((p) => p.id === pierId)?.lng ?? 100.5018,
          fullAddress: PIERS.find((p) => p.id === pierId)?.name || "",
          address: PIERS.find((p) => p.id === pierId)?.name || "",
        },
        created_by: String(userId),
        status: "open",
        tips_amount: 0,
        _source: "marine_hub",
        _sub_service: subService,
        _boat_grade: boatGrade,
        pier_id: pierId,
        ferry_round_time: isFerry ? departureTime : undefined,
        boat_grade: boatGrade,
        car_eta_minutes: carEtaMinutes ?? undefined,
      };
      if (requiresDeposit) {
        const { bookWithDeposit } = await import("../services/marineService");
        await bookWithDeposit(jobPayload as any);
      } else {
        await MockApi.createJob(jobPayload as any);
      }
      notify("จองเรือสำเร็จ! รอการยืนยันจากกัปตัน", "success");
      setStep(1);
      setSubService(null);
      setPierId("");
      setDate("");
      setRoundId("");
    } catch (e: any) {
      notify(e?.message || "จองไม่สำเร็จ", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-4">
          <Link
            to="/"
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-gray-100"
          >
            <ChevronLeft size={24} className="text-gray-700" />
          </Link>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${MARINE_CYAN}15` }}
          >
            <Sailboat size={22} strokeWidth={2.5} style={{ color: MARINE_CYAN }} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900">{t("home.svc_marine_title")}</h1>
            <p className="text-gray-500 text-sm">
              {step === 1 && t("marine.choose_service")}
              {step === 2 && t("marine.pier")}
              {step === 3 && t("transport.trip_summary")}
              {step === 4 && (loading ? "กำลังจอง..." : "สำเร็จ")}
            </p>
          </div>
        </div>
      </header>

      <div className="px-4 py-6 space-y-6 max-w-2xl mx-auto">
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
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:border-cyan-400/30 transition-all text-left"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center border border-gray-100"
                      style={{ color: MARINE_CYAN }}
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
            <button
              onClick={() => { setStep(1); setSubService(null); }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
            >
              <ChevronLeft size={18} />
              {t("marine.back")}
            </button>
            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <MapPin size={16} className="inline mr-1" />
                {t("marine.pier")}
              </label>
              <select
                value={pierId}
                onChange={(e) => setPierId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900"
              >
                <option value="">{t("marine.pier_placeholder")}</option>
                {PIERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <Calendar size={16} className="inline mr-1" />
                {t("marine.date")}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900"
              />
            </div>

            {isFerry && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  <Clock size={16} className="inline mr-1" />
                  {t("marine.round")}
                </label>
                <select
                  value={roundId}
                  onChange={(e) => setRoundId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900"
                >
                  <option value="">{t("marine.round_placeholder")}</option>
                  {FERRY_ROUNDS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isFerry && (
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  {t("marine.duration")}
                </label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900"
                >
                  {[2, 4, 6, 8].map((h) => (
                    <option key={h} value={h}>
                      {h} ชม.
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                {t("marine.destination_island")}
              </label>
              <input
                type="text"
                value={destinationIsland}
                onChange={(e) => setDestinationIsland(e.target.value)}
                placeholder="เช่น เกาะพีพี, เกาะสมุย"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                รถจะมาส่ง? (Car-Boat Sync)
              </label>
              <input
                type="number"
                value={carEtaMinutes ?? ""}
                onChange={(e) => {
                  const v = e.target.value ? parseInt(e.target.value, 10) : null;
                  setCarEtaMinutes(v);
                  setCarBoatConflict(null);
                }}
                placeholder="ETA จากรถ (นาที) — ว่างถ้าไม่ใช้รถ"
                min={1}
                max={180}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-gray-900 placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-900 mb-2">
                <Anchor size={16} className="inline mr-1" />
                ประเภทเรือ
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setBoatGrade("standard")}
                  className={`flex-1 py-3 rounded-xl border font-medium transition-all ${
                    boatGrade === "standard"
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t("marine.boat_standard")}
                </button>
                <button
                  onClick={() => setBoatGrade("premium")}
                  className={`flex-1 py-3 rounded-xl border font-medium transition-all ${
                    boatGrade === "premium"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {t("marine.boat_premium")} VIP
                </button>
              </div>
            </div>

            <button
              onClick={async () => {
                if (carEtaMinutes != null && carEtaMinutes > 0) {
                  const depTime = FERRY_ROUNDS.find((r) => r.id === roundId)?.time || "10:00";
                  const boatDep = new Date(`${date}T${depTime}:00`).toISOString();
                  try {
                    const r = await checkCarBoatSync(carEtaMinutes, boatDep);
                    setCarBoatConflict(r.conflict);
                    if (r.conflict) {
                      notify(r.message || "รถอาจไปไม่ทันเรือ — แนะนำเลือกรอบถัดไป", "warning");
                      return;
                    }
                  } catch {
                    setCarBoatConflict(null);
                  }
                }
                setStep(3);
              }}
              disabled={!pierId || !date || (isFerry && !roundId)}
              className="w-full py-4 rounded-2xl font-bold text-base text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: MARINE_CYAN }}
            >
              {t("marine.continue")}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h4 className="font-semibold text-gray-900 mb-3">{t("transport.trip_summary")}</h4>
              <p className="text-sm text-gray-600">
                {t(`marine.${subService}`)} • {PIERS.find((p) => p.id === pierId)?.name} • {date}
                {isFerry && ` • ${FERRY_ROUNDS.find((r) => r.id === roundId)?.label}`}
              </p>
              <p className="text-lg font-bold mt-2" style={{ color: MARINE_CYAN }}>
                {totalPrice} ฿
              </p>
              {requiresDeposit && (
                <p className="text-sm text-amber-700 mt-2 bg-amber-50 rounded-lg px-3 py-2">
                  มัดจำ {subService === "charter" ? "40" : "35"}% = {Math.round(totalPrice * (subService === "charter" ? 0.4 : 0.35))} ฿ (ชำระผ่านวอลเล็ต)
                </p>
              )}
            </div>

            {requiresDeposit && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-medium">⚠️ ข้อควรทราบ</p>
                <p className="mt-1">สตาร์ทเครื่องยนต์มีค่าใช้จ่ายสูง การยกเลิกกะทันหันจะมีการหักค่ามัดจำเพื่อชดเชยค่าน้ำมันให้กัปตัน</p>
                <p className="mt-2 text-xs text-amber-700">ยกเลิก &gt;24 ชม.: คืน 90% · 12–24 ชม.: คืน 50% · &lt;12 ชม./No-show: 0%</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                {t("transport.payment_method")}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setPaymentMethod("wallet")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                    paymentMethod === "wallet"
                      ? "border-cyan-500 bg-cyan-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Wallet size={20} style={{ color: paymentMethod === "wallet" ? MARINE_CYAN : "#6b7280" }} />
                  <span className="font-medium" style={{ color: paymentMethod === "wallet" ? MARINE_CYAN : "#374151" }}>
                    {t("transport.payment_wallet")}
                  </span>
                  {user?.wallet_balance != null && (
                    <span className="text-xs text-gray-500">({user.wallet_balance} ฿)</span>
                  )}
                </button>
                <button
                  onClick={() => !requiresDeposit && setPaymentMethod("cash")}
                  disabled={requiresDeposit}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border transition-all ${
                    requiresDeposit ? "opacity-50 cursor-not-allowed" : ""
                  } ${paymentMethod === "cash"
                      ? "border-cyan-500 bg-cyan-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <Banknote size={20} style={{ color: paymentMethod === "cash" ? MARINE_CYAN : "#6b7280" }} />
                  <span className="font-medium" style={{ color: paymentMethod === "cash" ? MARINE_CYAN : "#374151" }}>
                    {t("transport.payment_cash")}
                  </span>
                  {requiresDeposit && <span className="text-xs text-amber-600">(เหมาลำ/กิจกรรมต้องใช้วอลเล็ต)</span>}
                </button>
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              className="w-full py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50"
            >
              {t("marine.back")}
            </button>

            <button
              onClick={handleBook}
              className="w-full py-4 rounded-2xl font-bold text-base text-white shadow-sm flex items-center justify-center gap-2"
              style={{ backgroundColor: MARINE_CYAN }}
            >
              <Sailboat size={20} />
              {t("marine.book_now")}
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="text-center py-16 space-y-8">
            <div className="relative inline-block">
              <div
                className="w-24 h-24 rounded-full animate-ping absolute inset-0 opacity-30"
                style={{ backgroundColor: MARINE_CYAN }}
              />
              <div
                className="relative w-24 h-24 rounded-full flex items-center justify-center"
                style={{ backgroundColor: MARINE_CYAN }}
              >
                <Sailboat size={48} className="text-white" strokeWidth={2} />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {loading ? "กำลังจอง..." : "จองสำเร็จ!"}
              </h1>
              <p className="text-gray-500 mt-2">
                {loading ? "กำลังประมวลผล กรุณารอสักครู่" : "กรุณารอการยืนยันจากกัปตัน"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
