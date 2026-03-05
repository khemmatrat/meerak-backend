/**
 * Insurance Vault Manager — กำหนด % เบี้ยประกัน (รวมแยกตามหมวดงาน), แสดงยอดสะสม, Reserve 60% / Manageable 40%, ถอนส่วน 40%
 */
import React, { useState, useEffect } from "react";
import { Shield, Loader2, RefreshCw, Lock, TrendingUp, Save, Plus, X } from "lucide-react";
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

/** รายการหมวดเริ่มต้น (ใช้เมื่อ API ไม่ส่งมาหรือส่งว่าง) — ตรงกับ backend JOB_CATEGORY_KEYS */
const DEFAULT_CATEGORIES: JobCategoryItem[] = [
  { category: "maid", display_name: "แม่บ้าน", rate_percent: 10 },
  { category: "detective", display_name: "นักสืบ", rate_percent: 15 },
  { category: "logistics", display_name: "ขนส่ง", rate_percent: 12 },
  { category: "ac_cleaning", display_name: "ล้างแอร์", rate_percent: 10 },
  { category: "delivery", display_name: "จัดส่ง", rate_percent: 10 },
  { category: "tutor", display_name: "ติวเตอร์", rate_percent: 10 },
  { category: "repair", display_name: "ซ่อมบำรุง", rate_percent: 10 },
  { category: "event", display_name: "อีเวนต์", rate_percent: 10 },
  { category: "photography", display_name: "ถ่ายภาพ", rate_percent: 10 },
  { category: "cleaning", display_name: "ทำความสะอาด", rate_percent: 10 },
  { category: "moving", display_name: "ย้ายของ", rate_percent: 10 },
  { category: "pet_care", display_name: "เลี้ยงสัตว์", rate_percent: 10 },
  { category: "beauty", display_name: "ความงาม", rate_percent: 10 },
  { category: "health", display_name: "สุขภาพ", rate_percent: 10 },
  { category: "consulting", display_name: "ที่ปรึกษา", rate_percent: 10 },
  { category: "tech_support", display_name: "ซ่อมไอที", rate_percent: 10 },
  { category: "teaching", display_name: "สอนพิเศษ", rate_percent: 10 },
  { category: "driving", display_name: "ขับรถ", rate_percent: 10 },
  { category: "other", display_name: "อื่นๆ", rate_percent: 10 },
  { category: "default", display_name: "ค่าเริ่มต้น (ทุกงาน)", rate_percent: 10 },
];

export const InsuranceManager: React.FC = () => {
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

  return (
    <div className="space-y-6">
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
