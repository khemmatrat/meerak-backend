/**
 * Insurance Vault Manager — กำหนด % เบี้ยประกัน (รวมแยกตามหมวดงาน), แสดงยอดสะสม, Reserve 60% / Manageable 40%, ถอนส่วน 40%
 * เชื่อมกับ Insurance Claims: TIPO อัปเดตจาก claim payouts, Claims Overview panel
 */
import React, { useState, useEffect } from "react";
import { Shield, Loader2, RefreshCw, Lock, TrendingUp, Save, Plus, X, ClipboardList, AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import {
  getInsuranceSettings,
  patchInsuranceSettings,
  getInsuranceSummary,
  withdrawInsurance,
  getJobCategoryList,
} from "../services/adminApi";
import type {
  InsuranceSettingsResponse,
  InsuranceSummaryResponse,
  JobCategoryItem,
} from "../services/adminApi";

/** รายการหมวด — ตรงกับ NEXUS_MODULE2_CATEGORIES / คอร์สข้อสอบที่ปรับปรุงแล้ว */
const DEFAULT_CATEGORIES: JobCategoryItem[] = [
  // งานบ้าน
  { category: "Cleaning", display_name: "แม่บ้าน / ทำความสะอาด", rate_percent: 10 },
  { category: "Gardening", display_name: "ช่างสวน / จัดสวน", rate_percent: 10 },
  { category: "Moving", display_name: "ขนย้ายสิ่งของ", rate_percent: 10 },
  // ช่าง
  { category: "Repair", display_name: "ช่างซ่อมแซมทั่วไป", rate_percent: 10 },
  { category: "AC Technician", display_name: "ช่างแอร์", rate_percent: 10 },
  { category: "Construction", display_name: "ช่างก่อสร้าง", rate_percent: 10 },
  { category: "Plumber", display_name: "ช่างประปา", rate_percent: 10 },
  { category: "Electrician", display_name: "ช่างไฟฟ้า", rate_percent: 10 },
  // ขนส่ง & ความปลอดภัย
  { category: "Delivery", display_name: "ขนส่ง / จัดส่งพัสดุ", rate_percent: 10 },
  { category: "Driving", display_name: "ขับรถ", rate_percent: 10 },
  { category: "Security", display_name: "รปภ. / ยาม", rate_percent: 10 },
  // อาหาร
  { category: "Chef", display_name: "พ่อครัว / แม่ครัว", rate_percent: 10 },
  { category: "Catering", display_name: "จัดเลี้ยง / Catering", rate_percent: 10 },
  { category: "Cooking", display_name: "ทำอาหาร", rate_percent: 10 },
  // ดูแลบุคคล
  { category: "Babysitter", display_name: "พี่เลี้ยงเด็ก", rate_percent: 10 },
  { category: "Elderly", display_name: "ผู้ดูแลผู้สูงอายุ", rate_percent: 10 },
  { category: "Massage", display_name: "นักนวด / นวดแผนไทย", rate_percent: 10 },
  // สุขภาพ & ความงาม
  { category: "Beauty", display_name: "ความงาม / เสริมสวย", rate_percent: 10 },
  { category: "Trainer", display_name: "เทรนเนอร์ฟิตเนส", rate_percent: 10 },
  // สัตว์เลี้ยง
  { category: "Pet Care", display_name: "ดูแลสัตว์เลี้ยง", rate_percent: 10 },
  // ไอที
  { category: "IT Support", display_name: "ช่างซ่อมคอมพิวเตอร์ / IT", rate_percent: 10 },
  // การสอน & ฝึก
  { category: "Tutor", display_name: "ครูสอนพิเศษ / ติวเตอร์", rate_percent: 10 },
  { category: "Tutoring", display_name: "สอนพิเศษ (ทั่วไป)", rate_percent: 10 },
  // ครีเอทีฟ
  { category: "Photography", display_name: "ช่างภาพ / วิดีโอ", rate_percent: 10 },
  { category: "Design", display_name: "ออกแบบ / กราฟิก", rate_percent: 10 },
  // ธุรกิจ & วิชาชีพ
  { category: "Event", display_name: "จัดงานอีเวนต์", rate_percent: 10 },
  { category: "Accounting", display_name: "บัญชี / การเงิน", rate_percent: 10 },
  { category: "Legal", display_name: "กฎหมาย / นิติกรรม", rate_percent: 10 },
  { category: "Medical", display_name: "สาธารณสุข / การแพทย์", rate_percent: 10 },
  // อื่นๆ
  { category: "other", display_name: "อื่นๆ", rate_percent: 10 },
  { category: "default", display_name: "ค่าเริ่มต้น (ทุกงาน)", rate_percent: 10 },
];

interface InsuranceManagerProps {
  /** ถ้าส่งมา ปุ่ม "ดูรายละเอียด Claims" จะเรียก setView('insurance-claims') */
  setView?: (view: string) => void;
}

export const InsuranceManager: React.FC<InsuranceManagerProps> = ({ setView }) => {
  const [settings, setSettings] = useState<InsuranceSettingsResponse | null>(null);
  const [summary, setSummary] = useState<InsuranceSummaryResponse | null>(null);
  const [categories, setCategories] = useState<JobCategoryItem[]>([]);
  const [categoryRates, setCategoryRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingRate, setSavingRate] = useState(false);
  const [savingCategoryRates, setSavingCategoryRates] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawReason, setWithdrawReason] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryKey, setNewCategoryKey] = useState("");
  const [newCategoryDisplayName, setNewCategoryDisplayName] = useState("");
  const [newCategoryRate, setNewCategoryRate] = useState("10");

  const fetchAll = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [s, sum, catList] = await Promise.all([
        getInsuranceSettings(),
        getInsuranceSummary(),
        getJobCategoryList().catch(() => ({ categories: [] })),
      ]);
      setSettings(s);
      setSummary(sum);
      setRateInput(String(s.insurance_rate_percent));
      const list = catList.categories?.length ? catList.categories : DEFAULT_CATEGORIES;
      setCategories(list);
      const rates: Record<string, string> = {};
      list.forEach((c) => {
        rates[c.category] = String((s.category_rates && s.category_rates[c.category]) ?? c.rate_percent ?? 10);
      });
      setCategoryRates(rates);
    } catch (e) {
      console.error("Insurance fetch error:", e);
      setMessage({ type: "error", text: "โหลดข้อมูลไม่สำเร็จ" });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleSaveRate = async () => {
    const pct = parseFloat(rateInput);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      setMessage({ type: "error", text: "กรุณาระบุ % ระหว่าง 0–100" });
      return;
    }
    setSavingRate(true);
    setMessage(null);
    try {
      await patchInsuranceSettings({ insurance_rate_percent: pct });
      setSettings((prev) => (prev ? { ...prev, insurance_rate_percent: pct } : null));
      setMessage({ type: "success", text: "บันทึกอัตราเบี้ยประกัน (ค่าเริ่มต้น) แล้ว" });
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    }
    setSavingRate(false);
  };

  const handleSaveCategoryRates = async () => {
    const rates: Record<string, number> = {};
    Object.entries(categoryRates).forEach(([cat, val]) => {
      const n = parseFloat(String(val).trim());
      if (!isNaN(n) && n >= 0 && n <= 100) rates[cat] = n;
    });
    if (Object.keys(rates).length === 0) {
      setMessage({ type: "error", text: "ไม่มีอัตราที่ถูกต้องให้บันทึก (กรุณากรอกตัวเลข 0–100 ในช่องอัตรา %)" });
      return;
    }
    setSavingCategoryRates(true);
    setMessage(null);
    try {
      const globalRate = parseFloat(rateInput);
      const body: { insurance_rate_percent?: number; category_rates?: Record<string, number> } = { category_rates: rates };
      if (!isNaN(globalRate) && globalRate >= 0 && globalRate <= 100) body.insurance_rate_percent = globalRate;
      await patchInsuranceSettings(body);
      setMessage({ type: "success", text: "บันทึกอัตราประกันแยกตามหมวดงานแล้ว — หน้า JobDetails จะใช้ค่าล่าสุดเมื่อโหลดหรือเมื่อสลับกลับมาเปิดแท็บ" });
      fetchAll();
    } catch (e: unknown) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" });
    }
    setSavingCategoryRates(false);
  };

  const handleAddCategory = () => {
    const key = newCategoryKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) {
      setMessage({ type: "error", text: "กรุณาระบุรหัสหมวด (ภาษาอังกฤษ เช่น delivery)" });
      return;
    }
    if (categories.some((c) => c.category === key)) {
      setMessage({ type: "error", text: "มีหมวดนี้อยู่แล้ว" });
      return;
    }
    const rate = Math.min(100, Math.max(0, parseFloat(newCategoryRate) || 10));
    const displayName = newCategoryDisplayName.trim() || key;
    setCategories((prev) => [...prev, { category: key, display_name: displayName, rate_percent: rate }]);
    setCategoryRates((prev) => ({ ...prev, [key]: String(rate) }));
    setNewCategoryKey("");
    setNewCategoryDisplayName("");
    setNewCategoryRate("10");
    setShowAddCategory(false);
    setMessage({ type: "success", text: `เพิ่มหมวด "${displayName}" แล้ว — กด "บันทึกอัตราต่อหมวด" เพื่อบันทึกลงระบบ` });
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!(amt > 0)) {
      setMessage({ type: "error", text: "กรุณาระบุยอดถอนที่ถูกต้อง" });
      return;
    }
    setWithdrawing(true);
    setMessage(null);
    try {
      await withdrawInsurance({ amount: amt, reason: withdrawReason || undefined });
      setWithdrawAmount("");
      setWithdrawReason("");
      setMessage({ type: "success", text: "บันทึกการถอนเงินประกันแล้ว (Liability ไม่เปลี่ยน)" });
      fetchAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "ถอนไม่สำเร็จ";
      setMessage({ type: "error", text: msg });
    }
    setWithdrawing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={32} className="animate-spin text-indigo-600" />
      </div>
    );
  }

  const cib = summary?.current_insurance_balance ?? 0;
  const reserve = summary?.reserve_60 ?? 0;
  const manageable = summary?.manageable_40 ?? 0;
  const alreadyWithdrawn = summary?.already_withdrawn_for_investment ?? 0;
  const allowed = summary?.allowed_to_withdraw ?? 0;
  const tic = summary?.total_insurance_collected ?? 0;

  return (
    <div className="space-y-6">
      {/* Insurance Fund — CEO visibility: total premiums collected (safety pool) */}
      <div className="rounded-xl overflow-hidden border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-lg">
        <div className="p-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-emerald-500/20 rounded-xl">
              <Shield size={40} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                Insurance Fund (Revenue B/C)
              </h2>
              <p className="text-sm text-slate-600 mt-0.5">
                Total premiums collected — safety pool for claims
              </p>
              <p className="text-3xl font-bold text-emerald-700 mt-2">
                ฿{tic.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-sm font-medium shrink-0"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Shield size={20} className="text-indigo-600" />
            คลังประกัน (Insurance Vault) — หนี้สิน ไม่ใช่รายได้
          </h3>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-200 hover:bg-slate-300 rounded-lg"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {message && (
          <div
            className={`mx-4 mt-4 px-4 py-2 rounded-lg text-sm ${
              message.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Settings: อัตรา % เบี้ยประกัน (ค่าเริ่มต้น) */}
        <div className="p-6 border-b border-slate-100">
          <h4 className="font-medium text-slate-700 mb-3">อัตราเบี้ยประกันค่าเริ่มต้น (ใช้เมื่อไม่มีอัตราต่อหมวด)</h4>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />
            <span className="text-slate-600">% (แนะนำ 10–20%)</span>
            <button
              onClick={handleSaveRate}
              disabled={savingRate}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {savingRate ? <Loader2 size={14} className="animate-spin" /> : null}
              บันทึก
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            อัตรานี้ใช้กับงานที่ไม่มีอัตราแยกตามหมวด หรือหมวดที่ยังไม่ได้ตั้งค่า
          </p>
        </div>

        {/* อัตราประกันแยกตามหมวดงาน (โดยละเอียด) */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h4 className="font-medium text-slate-700">อัตราประกันแยกตามหมวดงาน (กำหนดโดยละเอียด)</h4>
              <p className="text-sm text-slate-600 mt-1">
                ตั้งค่า % เบี้ยประกันต่อประเภทงาน — ลูกค้าเห็นอัตราตามประเภทงานใน JobDetails
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddCategory((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200"
            >
              <Plus size={16} />
              {showAddCategory ? "ยกเลิก" : "เพิ่มหมวด"}
            </button>
          </div>
          {showAddCategory && (
            <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">รหัสหมวด (ภาษาอังกฤษ)</span>
                <input
                  type="text"
                  value={newCategoryKey}
                  onChange={(e) => setNewCategoryKey(e.target.value)}
                  placeholder="เช่น delivery, messenger"
                  className="w-40 border border-slate-300 rounded px-3 py-2 text-sm font-mono"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">ชื่อแสดง</span>
                <input
                  type="text"
                  value={newCategoryDisplayName}
                  onChange={(e) => setNewCategoryDisplayName(e.target.value)}
                  placeholder="เช่น จัดส่ง / Messenger"
                  className="w-44 border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-slate-600">อัตรา %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={newCategoryRate}
                  onChange={(e) => setNewCategoryRate(e.target.value)}
                  className="w-20 border border-slate-300 rounded px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={handleAddCategory}
                className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 flex items-center gap-2"
              >
                <Plus size={14} /> เพิ่ม
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full border border-slate-200 rounded-lg text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left p-3 font-medium text-slate-700">หมวด (category)</th>
                  <th className="text-left p-3 font-medium text-slate-700">ชื่อแสดง</th>
                  <th className="text-left p-3 font-medium text-slate-700 w-32">อัตรา %</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.category} className="border-b border-slate-100 hover:bg-slate-50/50">
                    <td className="p-3 font-mono text-slate-600">{c.category}</td>
                    <td className="p-3 text-slate-800">{c.display_name}</td>
                    <td className="p-3">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={categoryRates[c.category] ?? ""}
                        onChange={(e) => setCategoryRates((prev) => ({ ...prev, [c.category]: e.target.value }))}
                        className="w-20 border border-slate-300 rounded px-2 py-1.5 text-sm"
                      />
                      <span className="ml-1 text-slate-500">%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {categories.length === 0 && (
            <p className="text-slate-500 text-sm mt-2">กด &quot;เพิ่มหมวด&quot; เพื่อเพิ่มประเภทงานและตั้งอัตราประกัน</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={handleSaveCategoryRates}
              disabled={savingCategoryRates || categories.length === 0}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              {savingCategoryRates ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              บันทึกอัตราต่อหมวด
            </button>
          </div>
        </div>

        {/* ── Claims Overview — เชื่อมกับ InsuranceClaimsView ── */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-slate-700 flex items-center gap-2">
              <ClipboardList size={18} className="text-amber-500" />
              สถานะการเคลมประกัน (Insurance Claims)
            </h4>
            {setView && (
              <button
                onClick={() => setView('insurance-claims')}
                className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-semibold"
              >
                จัดการ Claims <ChevronRight size={16} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Pending Claims */}
            <div className={`rounded-xl border p-4 flex items-start gap-3 ${
              (summary?.pending_claims_count ?? 0) > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <AlertTriangle size={20} className={
                (summary?.pending_claims_count ?? 0) > 0 ? 'text-amber-500 mt-0.5' : 'text-slate-400 mt-0.5'
              } />
              <div>
                <p className="text-2xl font-bold text-slate-800">
                  {summary?.pending_claims_count ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">เคลมรอพิจารณา</p>
                {(summary?.pending_claims_exposure ?? 0) > 0 && (
                  <p className="text-xs text-amber-600 font-semibold mt-1">
                    ความเสี่ยง ฿{(summary!.pending_claims_exposure!).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>

            {/* Total Approved Payout */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle2 size={20} className="text-emerald-500 mt-0.5" />
              <div>
                <p className="text-xl font-bold text-slate-800">
                  ฿{(summary?.total_claims_approved_amount ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">จ่ายเคลมแล้วทั้งหมด (55%)</p>
                <p className="text-[10px] text-emerald-600 mt-1">รวมใน TIPO แล้ว</p>
              </div>
            </div>

            {/* Net Reserve (after claims) */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <Lock size={20} className="text-indigo-500 mt-0.5" />
              <div>
                <p className="text-xl font-bold text-slate-800">
                  ฿{(summary?.reserve_60 ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Reserve 60% (สุทธิ)</p>
                {(summary?.gross_reserve_60 ?? 0) !== (summary?.reserve_60 ?? 0) && (
                  <p className="text-[10px] text-slate-400 mt-1">
                    ก่อนหัก: ฿{(summary?.gross_reserve_60 ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-slate-500 mt-3 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
            💡 <strong>การเชื่อมข้อมูล:</strong> เมื่อ Admin อนุมัติ Claim — ระบบจะบันทึก <code>liability_debit</code> ใน <code>insurance_fund_movements</code>
            อัตโนมัติ ทำให้ยอด TIPO และ Reserve 60% (สุทธิ) อัปเดตทันที
          </p>
        </div>

        {/* Finance Dashboard: TIC, TIPO, CIB, 60/40 */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wider">ยอดเก็บสะสม (TIC)</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {(summary?.total_insurance_collected ?? 0).toLocaleString()} THB
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
            <div className="text-xs text-slate-500 uppercase tracking-wider">จ่ายเคลมแล้ว (TIPO)</div>
            <div className="text-xl font-bold text-slate-800 mt-1">
              {(summary?.total_insurance_paid_out ?? 0).toLocaleString()} THB
            </div>
          </div>
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
            <div className="text-xs text-indigo-600 uppercase tracking-wider">คงเหลือ (CIB) = หนี้สิน</div>
            <div className="text-xl font-bold text-indigo-800 mt-1">{cib.toLocaleString()} THB</div>
          </div>
          <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
            <div className="text-xs text-amber-700 uppercase tracking-wider">ถอนไปลงทุนแล้ว</div>
            <div className="text-xl font-bold text-amber-800 mt-1">{alreadyWithdrawn.toLocaleString()} THB</div>
          </div>
        </div>

        {/* 60% Reserve (Locked) / 40% Manageable — Phase 2 จาก payment_ledger_audit */}
        {summary?.source && (
          <p className="px-6 text-xs text-slate-500">ยอด 60/40 คำนวณจาก payment_ledger_audit (Ledger)</p>
        )}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-100 border border-slate-200">
            <Lock size={32} className="text-slate-500 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-slate-600">Reserves (60%) — ห้ามถอน</div>
              <div className="text-2xl font-bold text-slate-800">{reserve.toLocaleString()} THB</div>
              <p className="text-xs text-slate-500 mt-1">สำรองจ่ายกรณี Dispute/Claim</p>
            </div>
          </div>
          <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <TrendingUp size={32} className="text-emerald-600 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium text-emerald-700">Manageable (40%) — ถอนได้</div>
              <div className="text-2xl font-bold text-emerald-800">{manageable.toLocaleString()} THB</div>
              <p className="text-xs text-emerald-600 mt-1">ถอนได้สูงสุด: {allowed.toLocaleString()} THB</p>
            </div>
          </div>
        </div>

        {/* Withdraw 40% */}
        <div className="p-6 bg-amber-50/50 border-t border-slate-100">
          <h4 className="font-medium text-slate-700 mb-3">ถอนเงินประกันส่วน 40% ไปบริหาร/ลงทุน</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">ยอดถอน (THB)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0"
                className="w-40 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-slate-600">เหตุผล (ถ้ามี)</span>
              <input
                type="text"
                value={withdrawReason}
                onChange={(e) => setWithdrawReason(e.target.value)}
                placeholder="Withdrawal for investment"
                className="w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={handleWithdraw}
              disabled={withdrawing || !(parseFloat(withdrawAmount) > 0)}
              className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
            >
              {withdrawing ? <Loader2 size={14} className="animate-spin" /> : null}
              ถอน
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            ขีดจำกัดจาก Ledger: Allowed = Manageable (40% ของหนี้สินจาก Ledger) − ถอนไปแล้ว
          </p>
        </div>
      </div>
    </div>
  );
};
