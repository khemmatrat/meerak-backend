import React, { useCallback, useEffect, useState } from "react";
import { Compass, Loader2, RefreshCw } from "lucide-react";
import { getAdminCompassQueue } from "../services/adminApi";

type QueueRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  primary_intent: string | null;
  kyc_status: string | null;
  onboarding_status: string | null;
  provider_status: string | null;
  onboarding_compass_completed_at: string | null;
};

const INTENT_LABEL: Record<string, string> = {
  rider_delivery: "Rider / ส่งของ",
  provider_service: "ผู้รับงานบริการ",
  cleaning: "ทำความสะอาด",
  driving: "คนขับ",
  messenger: "Messenger",
  public_transport: "รถสาธารณะ",
  technical: "ช่างเทคนิค",
  marine: "Marine",
};

export const CompassQueueView: React.FC = () => {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [intent, setIntent] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await getAdminCompassQueue(intent || undefined);
      setRows(data.queue || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "โหลดคิวไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [intent]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Compass className="text-emerald-600" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Compass Queue</h1>
          <p className="text-sm text-slate-500">
            คิวผู้ใช้ที่อยู่ในเส้นทาง Compass — รอตรวจ KYC / อนุมัติรับงาน
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"
        >
          <RefreshCw size={16} />
          รีเฟรช
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        >
          <option value="">ทุกอาชีพ</option>
          {Object.entries(INTENT_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="flex items-center gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={18} />
          กำลังโหลด…
        </p>
      )}
      {err && <p className="text-red-600 text-sm">{err}</p>}

      {!loading && rows.length === 0 && (
        <p className="text-slate-500 text-sm">ไม่มีคิวในตัวกรองนี้</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left p-3">ชื่อ</th>
              <th className="text-left p-3">เบอร์</th>
              <th className="text-left p-3">อาชีพ</th>
              <th className="text-left p-3">KYC</th>
              <th className="text-left p-3">Training</th>
              <th className="text-left p-3">Provider</th>
              <th className="text-left p-3">สมัคร Compass</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="p-3 font-medium">{r.full_name || "—"}</td>
                <td className="p-3">{r.phone || "—"}</td>
                <td className="p-3">
                  {INTENT_LABEL[r.primary_intent || ""] || r.primary_intent || "—"}
                </td>
                <td className="p-3">{r.kyc_status || "—"}</td>
                <td className="p-3">{r.onboarding_status || "—"}</td>
                <td className="p-3">{r.provider_status || "—"}</td>
                <td className="p-3 text-xs text-slate-500">
                  {r.onboarding_compass_completed_at
                    ? new Date(r.onboarding_compass_completed_at).toLocaleString("th-TH")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CompassQueueView;
