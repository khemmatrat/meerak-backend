import React from "react";
import {
  Eye,
  MousePointerClick,
  Percent,
  Wallet,
  Target,
  AlertTriangle,
  Play,
  MapPin,
  TrendingUp,
  LucideIcon,
} from "lucide-react";
import {
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import type { AdsCampaignInsightsV2 } from "../services/marketplaceAdsService";

export type AdsAnalyticsTab = "overview" | "where" | "budget";

export type AdsStatCard = {
  label: string;
  value: string;
  icon: LucideIcon;
  color: string;
};

function conversionKindLabel(kind: string) {
  const map: Record<string, string> = {
    BOOKING_CONFIRMED: "จองยืนยัน",
    ORDER_PAID: "สั่งซื้อ/ชำระ",
    JOB_HIRED: "จ้างงาน",
  };
  return map[kind] || kind;
}

type Props = {
  tab: AdsAnalyticsTab;
  insights: AdsCampaignInsightsV2;
  stats: AdsStatCard[];
  escrowRemaining: number | null;
  viewableCount: number;
  video2sCount: number;
  realtime?: { impressions: number; clicks: number; outcomes: number } | null;
};

export const AdsCampaignAnalytics: React.FC<Props> = ({
  tab,
  insights,
  stats,
  escrowRemaining,
  viewableCount,
  video2sCount,
  realtime,
}) => {
  const surfaceData = Object.entries(insights.surfaceBreakdown || {}).map(([k, v]) => ({
    name: k.replace("_", " "),
    value: v,
  }));

  const geoData = (insights.geoBreakdown || []).map((g) => ({
    name: g.province,
    clicks: g.clicks,
  }));

  const dailyChartData = (insights.dailySeries || []).map((d) => ({
    ...d,
    escrowRemainingThb:
      d.escrowRemainingMicro != null
        ? Number(d.escrowRemainingMicro) / 1_000_000
        : null,
  }));
  const hasEscrowSeries = dailyChartData.some((d) => d.escrowRemainingThb != null);

  if (tab === "overview") {
    return (
      <div className="mt-4 space-y-4">
        {realtime ? (
          <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
            Real-time (~30s): {realtime.impressions} imp · {realtime.clicks} คลิก · {realtime.outcomes} outcomes
          </div>
        ) : null}

        {insights.cohortRetention ? (
          <div className="rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-2 text-sm">
            <p className="font-medium text-violet-900">Cohort retention</p>
            <p className="text-violet-800 text-xs mt-0.5">
              {insights.cohortRetention.retentionRatePct}% กลับมา outcome ซ้ำ ({insights.cohortRetention.repeatOutcomeUsers}/
              {insights.cohortRetention.adAttributedConverters} คน)
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl p-3 ${s.color}`}>
              <s.icon size={18} className="mb-1 opacity-70" />
              <p className="text-xs opacity-80">{s.label}</p>
              <p className="text-lg font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {insights.funnel ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-sm mb-3">Funnel</h3>
            <div className="flex justify-between text-xs text-slate-600 mb-2">
              <span>แสดงผล → คลิก: {insights.funnel.impressionToClickRate}%</span>
              <span>คลิก → Outcome: {insights.funnel.clickToOutcomeRate}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex">
              <div className="bg-blue-400 h-full" style={{ width: "100%" }} />
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex mt-2">
              <div
                className="bg-violet-500 h-full"
                style={{ width: `${Math.min(100, insights.funnel.impressionToClickRate)}%` }}
              />
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden flex mt-2">
              <div
                className="bg-rose-500 h-full"
                style={{ width: `${Math.min(100, insights.funnel.clickToOutcomeRate)}%` }}
              />
            </div>
          </div>
        ) : null}

        {insights.benchmark && insights.benchmark.sampleSize > 0 ? (
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-sm">
            <p className="font-semibold text-indigo-900">เทียบกับแพลตฟอร์ม</p>
            <p className="text-indigo-800 mt-1">
              CTR คุณ {insights.periodCtr ?? insights.ctr}% vs กลาง {insights.benchmark.medianCtr}%
            </p>
            <p className="text-indigo-800">
              CVR คุณ {insights.periodCvr ?? 0}% vs กลาง {insights.benchmark.medianCvr}%
            </p>
          </div>
        ) : null}

        {dailyChartData.length > 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 h-56">
            <p className="text-xs font-semibold text-slate-600 mb-1">แนวโน้มรายวัน</p>
            {hasEscrowSeries ? (
              <p className="text-[10px] text-lime-700 mb-2">เส้นเขียว = Escrow เหลือ (meerak จริง)</p>
            ) : null}
            <ResponsiveContainer width="100%" height="82%">
              <ComposedChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                {hasEscrowSeries ? (
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} unit="฿" />
                ) : null}
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="clicks" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="outcomes" stroke="#f43f5e" strokeWidth={2} dot={false} />
                {hasEscrowSeries ? (
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="escrowRemainingThb"
                    name="Escrow ฿"
                    stroke="#84cc16"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : null}

        <div className="text-xs text-slate-500 flex gap-4">
          <span className="flex items-center gap-1">
            <Play size={12} /> Viewable 1s: {viewableCount}
          </span>
          <span>Video 2s: {video2sCount}</span>
        </div>
      </div>
    );
  }

  if (tab === "where") {
    return (
      <div className="mt-4 space-y-4">
        {surfaceData.length > 0 ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
              <MapPin size={14} /> Surface
            </h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={surfaceData}>
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}
        {geoData.length > 0 ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2">จังหวัด (คลิก)</h3>
            <ul className="space-y-2 text-sm">
              {geoData.map((g) => (
                <li key={g.name} className="flex justify-between">
                  <span>{g.name}</span>
                  <span className="font-medium">{g.clicks}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-slate-500">ยังไม่มีข้อมูลภูมิศาสตร์ — รอผู้ใช้คลิกโฆษณาเพิ่ม</p>
        )}
        {(insights.audienceEngagement || []).length > 0 ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2">กลุ่มผู้ engage</h3>
            <ul className="space-y-1 text-sm">
              {insights.audienceEngagement!.map((a) => (
                <li key={a.role} className="flex justify-between">
                  <span>{a.role}</span>
                  <span>{a.clicks} คลิก</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {insights.audienceEngagementV2?.ageBuckets?.length ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2">กลุ่มอายุ (คลิก)</h3>
            <ul className="space-y-1 text-sm">
              {insights.audienceEngagementV2.ageBuckets.map((a) => (
                <li key={a.bucket} className="flex justify-between">
                  <span>{a.label}</span>
                  <span>{a.clicks}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {insights.audienceEngagementV2?.clickHeatmap?.length ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2">เวลาที่คลิกมาก (ชม.)</h3>
            <div className="grid grid-cols-6 gap-1">
              {insights.audienceEngagementV2.clickHeatmap
                .filter((h) => h.clicks > 0)
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 6)
                .map((h) => (
                  <div key={h.hour} className="text-center text-xs bg-emerald-50 rounded p-1">
                    <p className="font-bold">{h.hour}:00</p>
                    <p>{h.clicks}</p>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
        {insights.audienceEngagementV2?.outcomesByKind?.length ? (
          <div className="rounded-2xl border bg-white p-4">
            <h3 className="font-semibold text-sm mb-2">Outcome ตามประเภท</h3>
            <ul className="space-y-1 text-sm">
              {insights.audienceEngagementV2.outcomesByKind.map((o) => (
                <li key={o.conversion_kind} className="flex justify-between">
                  <span>{conversionKindLabel(o.conversion_kind)}</span>
                  <span>{o.cnt}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {insights.escrow ? (
        <>
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-slate-600">Escrow ทั้งหมด</p>
            <p className="text-2xl font-bold">
              {(Number(insights.escrow.escrowMicro) / 1_000_000).toLocaleString()} บาท
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-sm text-slate-600">ใช้ไปแล้ว (outcome)</p>
            <p className="text-2xl font-bold text-amber-700">
              {(Number(insights.escrow.spentMicro) / 1_000_000).toLocaleString()} บาท
            </p>
          </div>
          <div className="rounded-2xl border bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">คงเหลือใน Escrow (meerak)</p>
            <p className="text-2xl font-bold text-emerald-900">{escrowRemaining?.toLocaleString()} บาท</p>
          </div>
          <p className="text-xs text-slate-500">
            ค่า outcome ครั้งละ {(Number(insights.escrow.outcomeCostMicro) / 1_000_000).toFixed(2)} บาท
            {insights.efficiency?.projectedOutcomesRemaining != null &&
              ` · เหลืออีก ~${insights.efficiency.projectedOutcomesRemaining} outcomes`}
          </p>
        </>
      ) : (
        <p className="text-sm text-slate-500">แคมเปญนี้ใช้โมเดล CPM (legacy) — ไม่มี escrow</p>
      )}
    </div>
  );
};

export default AdsCampaignAnalytics;
