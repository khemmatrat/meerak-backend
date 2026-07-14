import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Trophy } from "lucide-react";
import {
  marketplaceAdsService,
  type AdsCampaignRow,
  type AdsCampaignInsightsV2,
} from "../services/marketplaceAdsService";

const OBJECTIVE_LABELS: Record<string, string> = {
  TRAFFIC: "เพิ่มการเข้าชม",
  VIDEO_VIEWS: "ยอดวิวคลิป",
  STORY_VIEWS: "ยอดวิวสตอรี่",
  MARKETPLACE_LEADS: "ลูกค้า Marketplace",
  PROFILE_VISITS: "เข้าชมโปรไฟล์",
};

type CompareWinner = { value: number; campaignIds: string[] } | null;

type CompareResponse = {
  campaigns: AdsCampaignInsightsV2[];
  winners?: {
    ctr?: CompareWinner;
    cvr?: CompareWinner;
    outcomes?: CompareWinner;
    impressions?: CompareWinner;
    efficiency?: CompareWinner;
  } | null;
};

function isWinner(c: AdsCampaignInsightsV2, key: string) {
  return !!(c as AdsCampaignInsightsV2 & { compareFlags?: Record<string, boolean> }).compareFlags?.[
    `winner_${key}`
  ];
}

export const AdsCampaignCompare: React.FC = () => {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<AdsCampaignRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);

  useEffect(() => {
    setLoading(true);
    marketplaceAdsService
      .listCampaigns()
      .then((r) => setCampaigns(r.campaigns || []))
      .finally(() => setLoading(false));
  }, []);

  const titleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of campaigns) map[c.id] = c.title;
    return map;
  }, [campaigns]);

  const runCompare = useCallback(async () => {
    if (selected.length < 2) return;
    setComparing(true);
    try {
      const data = await marketplaceAdsService.compareCampaigns(selected);
      setCompare(data as CompareResponse);
    } catch {
      setCompare(null);
    } finally {
      setComparing(false);
    }
  }, [selected]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <button
          type="button"
          onClick={() => navigate("/settings/ads-marketplace")}
          className="flex items-center gap-1 text-sm text-slate-600 mb-3"
        >
          <ChevronLeft size={18} /> กลับ Ads
        </button>

        <h1 className="text-xl font-bold">เทียบแคมเปญ</h1>
        <p className="text-sm text-slate-500 mt-1">เลือก 2–5 แคมเปญ — ระบบ highlight ผู้ชนะ CTR / CVR / outcomes</p>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-emerald-600" size={28} />
          </div>
        ) : (
          <>
            <div className="mt-4 space-y-2">
              {campaigns.map((c) => {
                const checked = selected.includes(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
                      checked ? "border-emerald-400 bg-emerald-50/50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(c.id)}
                      className="rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{c.title}</p>
                      <p className="text-xs text-slate-500">
                        {OBJECTIVE_LABELS[c.objective || ""] || c.objective} · {c.lifecycleState}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            <button
              type="button"
              disabled={selected.length < 2 || comparing}
              onClick={runCompare}
              className="mt-4 w-full py-3 rounded-2xl bg-emerald-600 text-white font-bold disabled:opacity-50"
            >
              {comparing ? "กำลังเทียบ..." : `เทียบ ${selected.length} แคมเปญ`}
            </button>

            {compare?.campaigns?.length ? (
              <div className="mt-6 space-y-3">
                {compare.winners ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="font-semibold flex items-center gap-1">
                      <Trophy size={14} /> Winners
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {(["ctr", "cvr", "outcomes", "efficiency"] as const).map((k) => {
                        const w = compare.winners?.[k];
                        if (!w?.campaignIds?.length) return null;
                        return (
                          <li key={k}>
                            {k.toUpperCase()}: {w.value}
                            {k === "efficiency" ? " outcomes/฿" : k === "ctr" || k === "cvr" ? "%" : ""} —{" "}
                            {w.campaignIds.map((id) => titleById[id] || id.slice(0, 8)).join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {compare.campaigns.map((row) => {
                  const id = row.campaignId;
                  const ctr = row.periodCtr ?? row.ctr ?? 0;
                  const cvr = row.periodCvr ?? row.funnel?.clickToOutcomeRate ?? 0;
                  const outcomes = row.periodOutcomes ?? row.conversions ?? 0;
                  return (
                    <div key={id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="font-bold">{titleById[id] || id}</p>
                      <div className="grid grid-cols-3 gap-2 mt-3 text-center text-sm">
                        <div className={isWinner(row, "ctr") ? "rounded-lg bg-emerald-50 border border-emerald-200 p-2" : "p-2 bg-slate-50 rounded-lg"}>
                          <p className="text-[10px] text-slate-500">CTR</p>
                          <p className="font-bold">{Number(ctr).toFixed(2)}%</p>
                        </div>
                        <div className={isWinner(row, "cvr") ? "rounded-lg bg-emerald-50 border border-emerald-200 p-2" : "p-2 bg-slate-50 rounded-lg"}>
                          <p className="text-[10px] text-slate-500">CVR</p>
                          <p className="font-bold">{Number(cvr).toFixed(2)}%</p>
                        </div>
                        <div className={isWinner(row, "outcomes") ? "rounded-lg bg-emerald-50 border border-emerald-200 p-2" : "p-2 bg-slate-50 rounded-lg"}>
                          <p className="text-[10px] text-slate-500">Outcomes</p>
                          <p className="font-bold">{outcomes}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default AdsCampaignCompare;
