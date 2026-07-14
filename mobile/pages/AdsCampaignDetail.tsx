import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  Eye,
  MousePointerClick,
  Percent,
  Wallet,
  Target,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Sparkles,
  Download,
  Scale,
} from "lucide-react";
import {
  marketplaceAdsService,
  type AdsCampaignInsightsV2,
  type AdsOutcomeRow,
  type AdsOptimizationReport,
} from "../services/marketplaceAdsService";
import { AdsCampaignAnalytics } from "./AdsCampaignAnalytics";

function mediaStatusLabel(meta: Record<string, unknown> | undefined): { label: string; tone: "ok" | "warn" | "error" } | null {
  if (!meta) return null;
  const processing = String(meta.processingStatus || "");
  const preflight = String(meta.renderPreflightStatus || "");
  if (processing === "PROCESSING") return { label: "กำลังประมวลผลสื่อ", tone: "warn" };
  if (processing === "FAILED" || preflight === "FAIL") {
    const reason = meta.processingReason || meta.renderPreflightReason;
    return {
      label: reason ? `สื่อใช้ไม่ได้: ${reason}` : "สื่อใช้ไม่ได้ — อัปโหลดไฟล์ใหม่",
      tone: "error",
    };
  }
  if (processing === "READY" && preflight === "PASS") return { label: "สื่อพร้อมแสดง", tone: "ok" };
  return null;
}

type TabId = "overview" | "where" | "budget" | "outcomes" | "optimize";

function outcomeStatusLabel(status?: string) {
  const map: Record<string, { label: string; className: string }> = {
    billed: { label: "หักเงินแล้ว", className: "bg-emerald-100 text-emerald-800" },
    disputed: { label: "รอตรวจสอบ", className: "bg-amber-100 text-amber-800" },
    reversed: { label: "คืนเงินแล้ว", className: "bg-slate-100 text-slate-600" },
  };
  return map[status || "billed"] || map.billed;
}

function conversionKindLabel(kind: string) {
  const map: Record<string, string> = {
    BOOKING_CONFIRMED: "จองยืนยัน",
    ORDER_PAID: "สั่งซื้อ/ชำระ",
    JOB_HIRED: "จ้างงาน",
  };
  return map[kind] || kind;
}

export const AdsCampaignDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<AdsCampaignInsightsV2 | null>(null);
  const [title, setTitle] = useState("");
  const [mediaMeta, setMediaMeta] = useState<Record<string, unknown> | undefined>();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("7d");
  const [tab, setTab] = useState<TabId>("overview");
  const [outcomes, setOutcomes] = useState<AdsOutcomeRow[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const [disputeId, setDisputeId] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [optimization, setOptimization] = useState<AdsOptimizationReport | null>(null);
  const [optimizationLoading, setOptimizationLoading] = useState(false);
  const [variantUploading, setVariantUploading] = useState(false);
  const [abPreview, setAbPreview] = useState<Record<string, number> | null>(null);
  const [realtime, setRealtime] = useState<{ impressions: number; clicks: number; outcomes: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      marketplaceAdsService.getCampaign(id),
      marketplaceAdsService.getInsightsV2(id, range).catch(() => null),
    ])
      .then(([camp, ins]) => {
        setTitle(camp?.campaign?.title || "แคมเปญ");
        setInsights(ins);
        const creativeMeta = camp?.creatives?.[0]?.metadata as Record<string, unknown> | undefined;
        const campaignMeta = camp?.campaign?.metadata as Record<string, unknown> | undefined;
        setMediaMeta(creativeMeta || campaignMeta);
      })
      .finally(() => setLoading(false));
  }, [id, range]);

  useEffect(() => {
    if (!id || tab !== "outcomes") return;
    setOutcomesLoading(true);
    marketplaceAdsService
      .listOutcomes(id, 50)
      .then((r) => setOutcomes(r.outcomes || []))
      .catch(() => setOutcomes([]))
      .finally(() => setOutcomesLoading(false));
  }, [id, tab]);

  useEffect(() => {
    if (!id || tab !== "optimize") return;
    setOptimizationLoading(true);
    marketplaceAdsService
      .getOptimization(id, range)
      .then(setOptimization)
      .catch(() => setOptimization(null))
      .finally(() => setOptimizationLoading(false));
  }, [id, tab, range]);

  useEffect(() => {
    if (!id || tab !== "overview") return;
    const poll = () => {
      marketplaceAdsService.getRealtime(id).then((r) => setRealtime(r)).catch(() => null);
    };
    poll();
    const t = setInterval(poll, 30000);
    return () => clearInterval(t);
  }, [id, tab]);

  const handleRegisterVariantB = async (file: File) => {
    if (!id) return;
    setVariantUploading(true);
    try {
      const uploaded = await marketplaceAdsService.uploadCreative(file);
      if (uploaded.processingStatus === "PROCESSING") {
        alert("วิดีโอยังประมวลผลไม่เสร็จ — รอ READY แล้วลองอีกครั้ง");
        return;
      }
      await marketplaceAdsService.registerVariant(
        id,
        "",
        "B",
        {
          contentKind: uploaded.contentKind,
          playbackUrl: uploaded.playbackUrl,
          imageUrl: uploaded.imageUrl,
          thumbnailUrl: uploaded.thumbnailUrl,
          posterUrl: uploaded.posterUrl,
          processingStatus: uploaded.processingStatus,
          renderPreflightStatus: uploaded.renderPreflightStatus,
        },
        title,
      );
      const opt = await marketplaceAdsService.getOptimization(id, range);
      setOptimization(opt);
      alert("ลงทะเบียน Variant B แล้ว — A/B split เปิดใน feed");
    } catch (e) {
      alert((e as Error).message || "ลงทะเบียน variant ไม่สำเร็จ");
    } finally {
      setVariantUploading(false);
    }
  };

  const handlePreviewAbSplit = async () => {
    if (!id) return;
    try {
      const r = await marketplaceAdsService.previewAbSplit(id, 50);
      setAbPreview(r.distribution);
    } catch {
      setAbPreview(null);
    }
  };

  const handleExport = async () => {
    if (!id) return;
    setExporting(true);
    try {
      const blob = await marketplaceAdsService.exportCampaign(id, range, "csv");
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ads-${id}-${range}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert((e as Error).message || "export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDispute = async () => {
    if (!disputeId || !disputeReason.trim()) return;
    setDisputing(true);
    try {
      await marketplaceAdsService.disputeOutcome(disputeId, disputeReason.trim());
      setDisputeId(null);
      setDisputeReason("");
      if (id) {
        const r = await marketplaceAdsService.listOutcomes(id, 50);
        setOutcomes(r.outcomes || []);
      }
    } catch (e) {
      alert((e as Error).message || "ไม่สามารถยื่น dispute ได้");
    } finally {
      setDisputing(false);
    }
  };

  const spendThb = insights ? Number(insights.spendMicro) / 1_000_000 : 0;
  const mediaStatus = mediaStatusLabel(mediaMeta);
  const renderCounts = (mediaMeta?.renderHealth as { counts?: Record<string, number> } | undefined)?.counts;
  const viewableCount = renderCounts?.ad_viewable_1s ?? 0;
  const video2sCount = renderCounts?.ad_video_view_2s ?? 0;
  const failedCount = (renderCounts?.ad_media_failed ?? 0) + (renderCounts?.ad_media_failed_timeout ?? 0);
  const escrowRemaining = insights?.escrow
    ? Number(insights.escrow.remainingMicro) / 1_000_000
    : null;

  const stats = insights
    ? [
        { label: "การแสดงผล", value: (insights.periodImpressions ?? insights.impressions).toLocaleString(), icon: Eye, color: "text-blue-600 bg-blue-50" },
        { label: "คลิก", value: (insights.periodClicks ?? insights.clicks).toLocaleString(), icon: MousePointerClick, color: "text-violet-600 bg-violet-50" },
        { label: "Outcome", value: (insights.periodOutcomes ?? insights.conversions).toLocaleString(), icon: Target, color: "text-rose-600 bg-rose-50" },
        { label: "CTR", value: `${insights.periodCtr ?? insights.ctr}%`, icon: Percent, color: "text-emerald-600 bg-emerald-50" },
        { label: "CVR", value: `${insights.periodCvr ?? 0}%`, icon: TrendingUp, color: "text-teal-600 bg-teal-50" },
        { label: "ใช้จ่าย", value: `${spendThb.toLocaleString()} บาท`, icon: Wallet, color: "text-amber-600 bg-amber-50" },
        ...(escrowRemaining != null
          ? [{ label: "Escrow เหลือ", value: `${escrowRemaining.toLocaleString()} บาท`, icon: Wallet, color: "text-lime-600 bg-lime-50" }]
          : []),
        ...(failedCount > 0
          ? [{ label: "Render fail", value: failedCount.toLocaleString(), icon: AlertTriangle, color: "text-rose-600 bg-rose-50" }]
          : []),
      ]
    : [];

  const analyticsTab =
    tab === "overview" || tab === "where" || tab === "budget" ? tab : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="px-4 py-5 max-w-lg mx-auto">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-slate-600 mb-3">
          <ChevronLeft size={18} /> กลับ
        </button>
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500 mt-1">สถิติแคมเปญ — จ่ายเฉพาะเมื่อมีลูกค้าจอง/สั่งซื้อจริง (0.05 บาท/outcome)</p>

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 disabled:opacity-50"
          >
            <Download size={14} /> {exporting ? "กำลังส่งออก..." : "Export CSV"}
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {(["7d", "30d", "90d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${range === r ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {r}
            </button>
          ))}
        </div>

        {mediaStatus && (
          <div
            className={`mt-4 rounded-xl px-3 py-2 text-sm ${
              mediaStatus.tone === "ok"
                ? "bg-emerald-50 text-emerald-800"
                : mediaStatus.tone === "warn"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-rose-50 text-rose-800"
            }`}
          >
            {mediaStatus.label}
          </div>
        )}

        <div className="flex gap-2 mt-4 border-b border-slate-200">
          {([
            ["overview", "ภาพรวม"],
            ["where", "ที่ไหน"],
            ["budget", "งบประมาณ"],
            ["outcomes", "Outcomes"],
            ["optimize", "แนะนำ"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === k ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "outcomes" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600 flex items-center gap-1">
              <Scale size={14} /> รายการ outcome ที่หักเงิน — ยื่น dispute ได้ภายใน 7 วันหากไม่ตรงกับ conversion จริง
            </p>
            {outcomesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-emerald-600" size={28} />
              </div>
            ) : outcomes.length === 0 ? (
              <p className="text-center text-slate-500 py-10">ยังไม่มี outcome ที่ bill แล้ว</p>
            ) : (
              <ul className="space-y-2">
                {outcomes.map((o) => {
                  const st = outcomeStatusLabel(o.status);
                  return (
                    <li key={o.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-medium text-sm">{conversionKindLabel(o.conversion_kind)}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(o.created_at).toLocaleString("th-TH")}
                          </p>
                          <p className="text-xs text-slate-400 font-mono mt-1 truncate max-w-[200px]">
                            {o.outcome_key}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm">
                            {(Number(o.cost_micro) / 1_000_000).toFixed(2)} ฿
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${st.className}`}>
                            {st.label}
                          </span>
                        </div>
                      </div>
                      {o.dispute_reason ? (
                        <p className="text-xs text-amber-700 mt-2">เหตุผล: {o.dispute_reason}</p>
                      ) : null}
                      {o.status === "billed" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDisputeId(o.id);
                            setDisputeReason("");
                          }}
                          className="mt-3 text-xs px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-800"
                        >
                          ยื่น dispute
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {disputeId ? (
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4">
                <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
                  <h3 className="font-semibold text-slate-900">ยื่น dispute</h3>
                  <p className="text-xs text-slate-500 mt-1">อธิบายว่าทำไม outcome นี้ไม่ถูกต้อง</p>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="เช่น ลูกค้ายกเลิกจอง / ไม่ใช่ conversion จากโฆษณานี้"
                    className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm min-h-[100px]"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      type="button"
                      disabled={disputing || !disputeReason.trim()}
                      onClick={handleDispute}
                      className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {disputing ? "กำลังส่ง..." : "ส่ง dispute"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisputeId(null)}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-sm"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : tab === "optimize" ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600 flex items-center gap-1">
              <Sparkles size={14} /> คำแนะนำปรับแคมเปญจากข้อมูลจริง
            </p>
            {optimizationLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-emerald-600" size={28} />
              </div>
            ) : !optimization ? (
              <p className="text-center text-slate-500 py-10">ยังไม่มีข้อมูลแนะนำ — รอ impressions เพิ่ม</p>
            ) : (
              <>
                <div className="rounded-2xl border bg-gradient-to-br from-indigo-50 to-white p-4">
                  <p className="text-xs text-indigo-600 font-medium">Creative Quality Score</p>
                  <div className="flex items-end gap-2 mt-1">
                    <p className="text-3xl font-bold text-indigo-900">{optimization.qualityScore}</p>
                    <p className="text-sm text-indigo-700 mb-1">/ 100 · {optimization.qualityLabel}</p>
                  </div>
                  <div className="h-2 rounded-full bg-indigo-100 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${optimization.qualityScore}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    คะแนนสูง = ได้รับการแสดงมากขึ้นใน ranking
                  </p>
                </div>

                {optimization.alerts?.lowCvrWarningAt ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    ระบบเตือน CVR ต่ำเมื่อ {new Date(optimization.alerts.lowCvrWarningAt).toLocaleString("th-TH")}
                    — ปรับ creative/CTA ก่อนถูกหยุดอัตโนมัติ
                  </div>
                ) : null}

                {optimization.budgetRecommendation ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="font-semibold text-emerald-900 text-sm">Budget recommender</p>
                    <p className="text-emerald-800 mt-1">
                      เพิ่มอีก {optimization.budgetRecommendation.addThb} บาท คาดได้ ~
                      {optimization.budgetRecommendation.projectedAdditionalOutcomes} outcomes เพิ่ม
                    </p>
                    <p className="text-xs text-emerald-700 mt-1">
                      Escrow เหลือ {optimization.budgetRecommendation.remainingEscrowThb} บาท
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {optimization.budgetRecommendation.disclaimer}
                    </p>
                  </div>
                ) : null}

                {optimization.recommendations.length > 0 ? (
                  <ul className="space-y-2">
                    {optimization.recommendations.map((r, i) => (
                      <li
                        key={`${r.type}-${i}`}
                        className={`rounded-xl border p-3 text-sm ${
                          r.severity === "critical"
                            ? "border-rose-200 bg-rose-50"
                            : r.severity === "high"
                              ? "border-amber-200 bg-amber-50"
                              : "border-slate-200 bg-white"
                        }`}
                      >
                        <p className="font-medium">{r.title}</p>
                        <p className="text-slate-600 mt-0.5 text-xs">{r.message}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">แคมเปญทำงานดี — ไม่มีคำแนะนำเร่งด่วน</p>
                )}

                {optimization.abTestNote ? (
                  <p className="text-xs text-slate-400 text-center">{optimization.abTestNote}</p>
                ) : null}
                {optimization.variants && optimization.variants.length > 0 ? (
                  <div className="rounded-xl border bg-white p-3 text-xs space-y-1">
                    <p className="font-medium text-slate-700">A/B variants</p>
                    {optimization.variants.map((v) => (
                      <p key={v.variantKey} className="text-slate-600">
                        {v.variantKey}: {v.impressions} imp · score {v.qualityScore ?? "—"}
                      </p>
                    ))}
                  </div>
                ) : null}

                <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 space-y-2">
                  <p className="text-sm font-medium text-indigo-900">ทด A/B จริง</p>
                  <p className="text-xs text-indigo-800">
                    อัปโหลด creative ชุด B — ระบบสลับใน feed ตาม impressions (explore/exploit)
                  </p>
                  <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white border border-indigo-200 text-sm font-medium text-indigo-800 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={variantUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleRegisterVariantB(f);
                        e.target.value = "";
                      }}
                    />
                    {variantUploading ? "กำลังอัปโหลด..." : "อัปโหลด Variant B"}
                  </label>
                  <button
                    type="button"
                    onClick={handlePreviewAbSplit}
                    className="w-full py-2 rounded-xl border border-indigo-200 bg-white text-xs text-indigo-700"
                  >
                    จำลอง split 50 ครั้ง (ดู distribution)
                  </button>
                  {abPreview ? (
                    <p className="text-xs text-slate-600 font-mono">
                      {Object.entries(abPreview)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-emerald-600" size={32} />
          </div>
        ) : !insights ? (
          <p className="text-center text-slate-500 py-12">ยังไม่มีข้อมูลสถิติ</p>
        ) : analyticsTab ? (
          <AdsCampaignAnalytics
            tab={analyticsTab}
            insights={insights}
            stats={stats}
            escrowRemaining={escrowRemaining}
            viewableCount={viewableCount}
            video2sCount={video2sCount}
            realtime={realtime}
          />
        ) : null}
      </div>
    </div>
  );
};
