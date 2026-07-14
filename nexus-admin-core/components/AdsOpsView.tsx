import React, { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  Pause,
  Play,
  RefreshCw,
  Sprout,
  Loader2,
} from "lucide-react";
import {
  listAdminAdCampaigns,
  patchAdminAdCampaignLifecycle,
  seedAdminHouseAds,
  type AdminAdCampaign,
} from "../services/adminApi";

export const AdsOpsView: React.FC = () => {
  const [campaigns, setCampaigns] = useState<AdminAdCampaign[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAdminAdCampaigns();
      setCampaigns(data.campaigns || []);
      setConfigured(data.configured !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      setCampaigns([]);
      setConfigured(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleLifecycle = async (
    id: string,
    next: "ACTIVE" | "PAUSED" | "ARCHIVED",
  ) => {
    setBusyId(id);
    try {
      await patchAdminAdCampaignLifecycle(id, next);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  };

  const seedHouse = async () => {
    setSeeding(true);
    try {
      const out = await seedAdminHouseAds();
      alert(out.message || "Seed house ads สำเร็จ");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Seed ไม่สำเร็จ");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="text-amber-600" size={28} />
            Ads Ops
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            จัดการแคมเปญโฆษณา (Social Core SSOT) — Video Feed & Story Viewer
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={() => void seedHouse()}
            disabled={seeding || configured === false}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60"
          >
            {seeding ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sprout size={16} />
            )}
            Seed House Ads
          </button>
        </div>
      </div>

      {configured === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ระบบ Ads bridge ยังไม่ตั้งค่า — ตั้ง{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">
            SOCIAL_CORE_API_URL
          </code>{" "}
          และ{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">
            ADS_SERVICE_API_KEY
          </code>{" "}
          บน backend
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">
                  แคมเปญ
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">
                  ผู้ลงโฆษณา
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">
                  สถานะ
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">
                  งบ/วัน (micro)
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">
                  ประเภท
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">
                  การจัดการ
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    <Loader2 className="inline animate-spin mr-2" size={18} />
                    กำลังโหลด...
                  </td>
                </tr>
              ) : campaigns.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    ยังไม่มีแคมเปญ — กด Seed House Ads หรือให้ user โปรโมตคลิป
                  </td>
                </tr>
              ) : (
                campaigns.map((c) => {
                  const isHouse = !!(c.metadata as { isHouse?: boolean })
                    ?.isHouse;
                  const active = c.lifecycleState === "ACTIVE";
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-slate-100 hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                        {c.title}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.advertiser}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            active
                              ? "bg-emerald-100 text-emerald-800"
                              : c.lifecycleState === "PAUSED"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {c.lifecycleState}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-600">
                        {c.dailyBudgetMicro}
                      </td>
                      <td className="px-4 py-3">
                        {isHouse ? (
                          <span className="text-xs font-medium text-emerald-700">
                            House (ฟรี)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Paid</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {active ? (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void toggleLifecycle(c.id, "PAUSED")}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-200 text-amber-800 text-xs font-medium hover:bg-amber-50 disabled:opacity-60"
                          >
                            <Pause size={14} />
                            Pause
                          </button>
                        ) : c.lifecycleState === "PAUSED" ? (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void toggleLifecycle(c.id, "ACTIVE")}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-800 text-xs font-medium hover:bg-emerald-50 disabled:opacity-60"
                          >
                            <Play size={14} />
                            Resume
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdsOpsView;
