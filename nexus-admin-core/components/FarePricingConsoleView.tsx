import React, { useEffect, useState } from "react";
import { RefreshCw, Route, Save } from "lucide-react";
import {
  getDistancePricingSettings,
  patchDistancePricingSettings,
  type DistancePricingSettings,
} from "../services/adminApi";

export const FarePricingConsoleView: React.FC = () => {
  const [data, setData] = useState<DistancePricingSettings | null>(null);
  const [draft, setDraft] = useState({ base_fare_thb: "", price_per_km_thb: "", minimum_fare_thb: "" });
  const [err, setErr] = useState<string | null>(null);
  const [patchErr, setPatchErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setErr(null);
    getDistancePricingSettings()
      .then((d) => {
        setData(d);
        setDraft({
          base_fare_thb: String(d.base_fare_thb ?? 0),
          price_per_km_thb: String(d.price_per_km_thb ?? 0),
          minimum_fare_thb: String(d.minimum_fare_thb ?? 0),
        });
      })
      .catch((e: Error) => setErr(e.message || "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    setPatchErr(null);
    try {
      const base = Number(draft.base_fare_thb);
      const perKm = Number(draft.price_per_km_thb);
      const minF = Number(draft.minimum_fare_thb);
      if (![base, perKm, minF].every((n) => Number.isFinite(n) && n >= 0)) {
        setPatchErr("กรอกตัวเลขที่ไม่ติดลบเท่านั้น");
        return;
      }
      const d = await patchDistancePricingSettings({
        base_fare_thb: base,
        price_per_km_thb: perKm,
        minimum_fare_thb: minF,
      });
      setData(d);
      setDraft({
        base_fare_thb: String(d.base_fare_thb ?? 0),
        price_per_km_thb: String(d.price_per_km_thb ?? 0),
        minimum_fare_thb: String(d.minimum_fare_thb ?? 0),
      });
    } catch (e) {
      setPatchErr((e as Error).message || "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const pctLabel =
    data?.markup_percent != null
      ? `${data.markup_percent}%`
      : data?.markup_rate != null
        ? `${(data.markup_rate * 100).toFixed(2)}%`
        : "—";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Route className="text-amber-600" size={28} />
            Fare / Distance Pricing
          </h1>
          <p className="text-slate-600 mt-1 text-sm">
            คุมค่าคงที่ + ราคาต่อกิโลเมตร + ขั้นต่ำ สำหรับงาน Transport Hub (local) — บันทึกลงฐานข้อมูลทันที ไม่ต้องรีสตาร์ท · ค่าธรรมเนียมระบบ (markup) ยังตาม Payment Provider Gate
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          รีเฟรช
        </button>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{err}</div>
      ) : null}
      {patchErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{patchErr}</div>
      ) : null}

      {loading && !data ? (
        <p className="text-slate-500">กำลังโหลด…</p>
      ) : data ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <p className="text-sm font-semibold text-slate-800">สูตรค่าตอบแทน (ก่อนปรับตามประเภทรถ)</p>
            <p className="text-xs text-slate-600">
              ฐานระยะทาง = max(ขั้นต่ำ, ราคาเริ่มต้น + ระยะทาง × ราคาต่อกม.) → คูณตัวคูณรถ → บวกประกัน → บวก markup (ลูกค้าจ่าย)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Base fare (฿)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.base_fare_thb}
                  onChange={(e) => setDraft((d) => ({ ...d, base_fare_thb: e.target.value }))}
                  className="px-2 py-1.5 rounded border border-slate-300 text-sm font-mono text-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Price per km (฿/กม.)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.price_per_km_thb}
                  onChange={(e) => setDraft((d) => ({ ...d, price_per_km_thb: e.target.value }))}
                  className="px-2 py-1.5 rounded border border-slate-300 text-sm font-mono text-slate-900"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-slate-600">
                Minimum fare (฿)
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.minimum_fare_thb}
                  onChange={(e) => setDraft((d) => ({ ...d, minimum_fare_thb: e.target.value }))}
                  className="px-2 py-1.5 rounded border border-slate-300 text-sm font-mono text-slate-900"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 disabled:opacity-50"
            >
              <Save size={18} />
              บันทึก
            </button>
            {data.updated_at ? (
              <p className="text-xs text-slate-500">อัปเดตล่าสุด: {String(data.updated_at)}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-indigo-950">
            <p className="font-semibold mb-1">Markup / ค่าธรรมเนียมระบบ (อ่านอย่างเดียว)</p>
            <p className="text-xs text-indigo-900/90">
              อัตราปัจจุบัน: <span className="font-mono font-semibold">{pctLabel}</span> — ปรับได้จาก Payment Provider Gate
              (match markup) ไม่ใช่ฟิลด์ในหน้านี้
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
};
