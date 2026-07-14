import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Megaphone,
  Plus,
  Pause,
  Play,
  BarChart3,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useNotification } from "../context/NotificationContext";
import {
  marketplaceAdsService,
  type AdsCampaignRow,
  type AdsCampaignInsightsV2,
} from "../services/marketplaceAdsService";

function stateBadge(state: string) {
  const map: Record<string, { cls: string; label: string }> = {
    ACTIVE: { cls: "bg-emerald-100 text-emerald-800", label: "กำลังยิง" },
    PAUSED: { cls: "bg-amber-100 text-amber-800", label: "หยุดชั่วคราว" },
    ARCHIVED: { cls: "bg-slate-100 text-slate-500", label: "จบแล้ว" },
    DRAFT: { cls: "bg-blue-100 text-blue-800", label: "ร่าง" },
  };
  return map[state] || { cls: "bg-slate-100 text-slate-600", label: state };
}

function modBadge(state?: string) {
  const map: Record<string, { cls: string; label: string }> = {
    PENDING: { cls: "bg-amber-100 text-amber-800", label: "รออนุมัติ" },
    APPROVED: { cls: "bg-emerald-100 text-emerald-800", label: "อนุมัติแล้ว" },
    REJECTED: { cls: "bg-red-100 text-red-700", label: "ไม่ผ่าน" },
  };
  return map[state || ""] || { cls: "bg-slate-100 text-slate-600", label: state || "—" };
}

const OBJECTIVE_LABELS: Record<string, string> = {
  TRAFFIC: "เพิ่มการเข้าชม",
  VIDEO_VIEWS: "ยอดวิวคลิป",
  STORY_VIEWS: "ยอดวิวสตอรี่",
  MARKETPLACE_LEADS: "ลูกค้า Marketplace",
  PROFILE_VISITS: "เข้าชมโปรไฟล์",
};

const OBJECTIVE_SURFACES: Record<string, string> = {
  TRAFFIC: "Video Feed · Story · Marketplace",
  VIDEO_VIEWS: "Video Feed",
  STORY_VIEWS: "Story",
  MARKETPLACE_LEADS: "Marketplace · ค้นหา Talents",
  PROFILE_VISITS: "โปรไฟล์ผู้ให้บริการ",
};

export const AdsMarketplace: React.FC = () => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const [campaigns, setCampaigns] = useState<AdsCampaignRow[]>([]);
  const [metrics, setMetrics] = useState<Record<string, AdsCampaignInsightsV2>>({});
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [betaAutoModerate, setBetaAutoModerate] = useState(false);

  const loadMetrics = useCallback(async (rows: AdsCampaignRow[]) => {
    const ids = rows.map((c) => c.id).filter(Boolean);
    if (!ids.length) {
      setMetrics({});
      return;
    }
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 5) batches.push(ids.slice(i, i + 5));
    try {
      const results = await Promise.all(batches.map((batch) => marketplaceAdsService.compareCampaigns(batch)));
      const map: Record<string, AdsCampaignInsightsV2> = {};
      for (const res of results) {
        for (const row of res.campaigns || []) {
          if (row.campaignId) map[row.campaignId] = row;
        }
      }
      setMetrics(map);
    } catch {
      setMetrics({});
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, pkg] = await Promise.all([
        marketplaceAdsService.listCampaigns(),
        marketplaceAdsService.getPackages().catch(() => ({ rollout: undefined })),
      ]);
      const rows = res.campaigns || [];
      setCampaigns(rows);
      setConfigured(res.configured !== false);
      setBetaAutoModerate(!!pkg.rollout?.betaAutoModerate);
      await loadMetrics(rows);
    } catch {
      notify("โหลดแคมเปญไม่สำเร็จ", "error");
    }
    setLoading(false);
  }, [notify, loadMetrics]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePause = async (c: AdsCampaignRow) => {
    const next = c.lifecycleState === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const mod = c.creatives?.[0]?.moderationState;
    if (next === "ACTIVE" && mod === "PENDING") {
      notify("รอทีมงานอนุมัติ creative ก่อน — เปิดได้หลังสถานะเป็น อนุมัติแล้ว", "error");
      return;
    }
    if (next === "ACTIVE" && mod === "REJECTED") {
      notify("Creative ไม่ผ่านการตรวจ — สร้างแคมเปญใหม่หรืออัปโหลดสื่อใหม่", "error");
      return;
    }
    try {
      await marketplaceAdsService.setLifecycle(c.id, next);
      notify(
        next === "PAUSED"
          ? "หยุดแคมเปญชั่วคราว"
          : mod === "APPROVED"
            ? "เปิดแคมเปญแล้ว — โฆษณาจะแสดงใน Feed ภายในไม่กี่นาที"
            : "เปิดแคมเปญอีกครั้ง",
        "success",
      );
      load();
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { error?: string; message?: string; reason?: string } };
      };
      notify(
        e.response?.data?.message ||
          (e.response?.status === 422
            ? "Creative ยังไม่พร้อมแสดง — รออนุมัติหรือตรวจไฟล์สื่อ"
            : "อัปเดตสถานะไม่สำเร็จ"),
        "error",
      );
    }
  };

  const activeCount = campaigns.filter((c) => c.lifecycleState === "ACTIVE").length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/40 text-slate-900">
      <div className="px-4 pt-5 pb-6 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-slate-500 text-sm font-medium mb-4 hover:text-slate-800"
        >
          <ChevronLeft size={18} /> กลับ Settings
        </button>

        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-5 text-white shadow-xl shadow-emerald-900/20 mb-6">
          <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -right-2 bottom-0 w-20 h-20 rounded-full bg-white/5" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Megaphone size={22} />
                <span className="text-sm font-semibold text-emerald-100">Ads on marketplace</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">ยิงโฆษณาให้ลูกค้าเห็นคุณ</h1>
              <p className="text-emerald-100/90 text-sm mt-2 leading-relaxed max-w-[240px]">
                แสดงใน Video Feed, Story และ Marketplace — จ่ายด้วย Wallet
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/settings/ads-marketplace/create")}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white text-emerald-800 text-sm font-bold shadow-lg hover:bg-emerald-50 active:scale-95 transition-transform"
            >
              <Plus size={18} /> สร้าง
            </button>
          </div>
          {!loading && campaigns.length > 0 && (
            <div className="relative flex gap-4 mt-5 pt-4 border-t border-white/20">
              <div>
                <p className="text-2xl font-bold">{campaigns.length}</p>
                <p className="text-xs text-emerald-200">แคมเปญทั้งหมด</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-emerald-200">กำลังยิง</p>
              </div>
              {campaigns.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => navigate("/settings/ads-marketplace/compare")}
                  className="ml-auto self-end text-xs px-3 py-1.5 rounded-xl bg-white/15 text-emerald-50 font-semibold hover:bg-white/25"
                >
                  เทียบแคมเปญ
                </button>
              ) : null}
            </div>
          )}
        </div>

        {!configured && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            ระบบโฆษณายังไม่พร้อมบนเซิร์ฟเวอร์ — ติดต่อทีมงาน
          </div>
        )}

        {betaAutoModerate && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs leading-relaxed">
            โหมด Beta: Creative อนุมัติอัตโนมัติ — แคมเปญใหม่ขึ้น Feed ได้เลย (กด เปิด ถ้าสถานะหยุดชั่วคราว)
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">กำลังโหลดแคมเปญ...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-3xl bg-white border border-slate-100 shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 flex items-center justify-center mb-4">
              <Sparkles className="text-emerald-600" size={28} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">เริ่มแคมเปญแรกของคุณ</h3>
            <p className="text-slate-500 text-sm mt-2 mb-6 leading-relaxed">
              โปรโมตบริการ คลิป หรือโปรไฟล์ให้คนใน AQOND เห็น — ใช้เวลาไม่ถึง 2 นาที
            </p>
            <button
              type="button"
              onClick={() => navigate("/settings/ads-marketplace/create")}
              className="px-8 py-3.5 rounded-2xl bg-emerald-600 text-white font-bold shadow-lg shadow-emerald-600/25 hover:bg-emerald-700"
            >
              สร้างแคมเปญโฆษณา
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide px-1">แคมเปญของฉัน</h2>
            {campaigns.map((c) => {
              const mod = c.creatives?.[0]?.moderationState;
              const budgetThb = Number(c.totalBudgetMicro || c.dailyBudgetMicro || 0) / 1_000_000;
              const st = stateBadge(c.lifecycleState);
              const md = modBadge(mod);
              const m = metrics[c.id];
              const ctr = m?.periodCtr ?? m?.ctr ?? 0;
              const cvr = m?.periodCvr ?? m?.funnel?.clickToOutcomeRate ?? 0;
              const costOutcome = m?.efficiency?.costPerOutcomeThb ?? 0.05;
              const bestCtr = Math.max(...campaigns.map((x) => metrics[x.id]?.periodCtr ?? metrics[x.id]?.ctr ?? 0), 0);
              const bestCvr = Math.max(...campaigns.map((x) => metrics[x.id]?.periodCvr ?? metrics[x.id]?.funnel?.clickToOutcomeRate ?? 0), 0);
              const ctrWinner = ctr > 0 && ctr >= bestCtr;
              const cvrWinner = cvr > 0 && cvr >= bestCvr;
              return (
                <div
                  key={c.id}
                  className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-900 truncate">{c.title}</h3>
                      <p className="text-slate-500 text-sm mt-1">
                        {OBJECTIVE_LABELS[c.objective || ""] || c.objective} · {budgetThb.toLocaleString()} บาท
                      </p>
                      {c.objective && OBJECTIVE_SURFACES[c.objective] && (
                        <p className="text-xs text-emerald-700 mt-1">
                          แสดงที่: {OBJECTIVE_SURFACES[c.objective]}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${st.cls}`}>
                      {st.label}
                    </span>
                  </div>
                  {mod && (
                    <span className={`inline-block mt-2.5 text-xs px-2.5 py-1 rounded-full font-medium ${md.cls}`}>
                      Creative: {md.label}
                    </span>
                  )}
                  {mod === "PENDING" && !betaAutoModerate && (
                    <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                      รอทีมงานอนุมัติใน Ads Admin → Moderation ก่อนโฆษณาจะขึ้น Feed
                    </p>
                  )}
                  {mod === "APPROVED" && c.lifecycleState === "PAUSED" && (
                    <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                      อนุมัติแล้ว — กด เปิด เพื่อเริ่มแสดงใน Feed
                    </p>
                  )}
                  {m && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      <div className={`rounded-xl px-2.5 py-2 text-center ${ctrWinner ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"}`}>
                        <p className="text-[10px] text-slate-500 uppercase">CTR</p>
                        <p className="text-sm font-bold text-slate-800">{ctr.toFixed(2)}%</p>
                      </div>
                      <div className={`rounded-xl px-2.5 py-2 text-center ${cvrWinner ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"}`}>
                        <p className="text-[10px] text-slate-500 uppercase">CVR</p>
                        <p className="text-sm font-bold text-slate-800">{cvr.toFixed(2)}%</p>
                      </div>
                      <div className="rounded-xl px-2.5 py-2 text-center bg-slate-50">
                        <p className="text-[10px] text-slate-500 uppercase">฿/ผล</p>
                        <p className="text-sm font-bold text-slate-800">{costOutcome.toFixed(2)}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/settings/ads-marketplace/${c.id}`)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
                    >
                      <BarChart3 size={15} /> สถิติ
                    </button>
                    {c.lifecycleState !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => togglePause(c)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
                      >
                        {c.lifecycleState === "ACTIVE" ? <Pause size={15} /> : <Play size={15} />}
                        {c.lifecycleState === "ACTIVE" ? "หยุด" : "เปิด"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick tip */}
        <div className="mt-8 p-4 rounded-2xl bg-white border border-slate-100 flex gap-3 shadow-sm">
          <TrendingUp className="text-emerald-600 shrink-0" size={20} />
          <p className="text-sm text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-800">เคล็ดลับ:</span> โฆษณาวิดีโอแนวตั้ง 9:16 มักได้ engagement สูงกว่าใน Video Feed
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdsMarketplace;
