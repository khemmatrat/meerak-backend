import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Link2,
  Users,
  TrendingUp,
  Gift,
  Copy,
  Check,
  Loader2,
  Trophy,
  Crown,
  BarChart3,
  Target,
  Calendar,
  Flame,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import axios from "axios";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useNotification } from "../context/NotificationContext";
import { copyPlainTextToClipboard } from "../utils/employerBidAcceptFeedback";
import { useSearchParams } from "react-router-dom";
import TalentReferralDashboard from "./TalentReferralDashboard";

interface ReferralEarningRow {
  jobId: string;
  refereeName: string;
  grossAmount: number;
  commissionAmount: number;
  createdAt: string;
}

interface ReferralStats {
  referralCode: string | null;
  referralLink: string | null;
  totalReferrals: number;
  activeWorkers: number;
  totalEarned: number;
  pendingCommission?: number;
  recentEarnings?: ReferralEarningRow[];
  effectiveCommissionRatePct?: number;
  campaignActive?: boolean;
  campaignName?: string | null;
}

interface LeaderboardEntry {
  userId: string;
  fullName: string;
  referralCode: string;
  referralCount: number;
  earnedThisWeek: number;
}

interface CampaignMilestone {
  target: number;
  label: string;
  prize: string;
}

interface TierBadge {
  id: string;
  min: number;
  label: string;
}

interface BaLeaderboardEntry {
  rank: number;
  userId: string;
  fullName: string;
  referralCode: string;
  qualifyingUsers: number;
  weekNew?: number;
  tierBadge?: TierBadge;
}

interface CampaignPublic {
  enabled: boolean;
  active: boolean;
  campaignName: string;
  startAt: string;
  endAt: string;
  minPurchaseThb: number;
  countdownSeconds: number;
  prizeModel: string;
  milestones: CampaignMilestone[];
  termsAndConditions: string[];
  rulesSummary: string;
  noteCashReferral: string;
  platform?: {
    totalQualifyingUsers: number;
    totalReferrers: number;
    projectedGmvMin: number;
    projectedGmvFromEvents: number;
    podium: BaLeaderboardEntry[];
  };
}

interface BaMeStats {
  qualifyingUsers: number;
  qualifyingThisWeek: number;
  nextMilestone: (CampaignMilestone & { remaining: number }) | null;
  highestReached: CampaignMilestone | null;
  growthSeries: { date: string; newUsers: number; totalUsers: number }[];
  tierBadge: TierBadge;
  rank: number | null;
  totalParticipants: number;
  percentile: number | null;
  gapToFirst: number | null;
  firstPlaceCount: number;
  campaign: CampaignPublic;
}

type BaBoard = "grand" | "week" | "velocity";
type BaTab = BaBoard | "growth";

function formatCount(n: number): string {
  return new Intl.NumberFormat("th-TH").format(n);
}

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatCountdown(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return `${d} วัน ${h} ชม.`;
}

function maskLeaderName(name: string): string {
  const t = String(name || "").trim();
  if (t.length <= 2) return t || "—";
  if (t.includes(" ")) {
    const [first, ...rest] = t.split(/\s+/);
    return `${first} ${rest[0]?.[0] || ""}.`.trim();
  }
  return `${t.slice(0, 2)}***`;
}

function PodiumCard({
  entry,
  place,
}: {
  entry: BaLeaderboardEntry | undefined;
  place: 1 | 2 | 3;
}) {
  const heights = { 1: "h-28", 2: "h-20", 3: "h-16" };
  const colors = {
    1: "from-amber-400 via-amber-500 to-amber-600 text-amber-950 shadow-amber-200/60",
    2: "from-slate-200 via-slate-300 to-slate-400 text-slate-800 shadow-slate-200/60",
    3: "from-amber-600 via-amber-700 to-amber-800 text-amber-50 shadow-amber-300/40",
  };
  if (!entry) {
    return (
      <div className="flex flex-col items-center flex-1 opacity-50">
        <div
          className={`w-full max-w-[100px] ${heights[place]} rounded-t-xl bg-gradient-to-b from-sky-100 to-blue-100 border border-blue-200/60 flex items-center justify-center text-sm font-bold text-blue-400`}
        >
          #{place}
        </div>
        <p className="mt-2 text-xs text-slate-400">ว่าง</p>
      </div>
    );
  }
  return (
    <div
      className={`flex flex-col items-center flex-1 ${place === 1 ? "order-2 -mt-2" : place === 2 ? "order-1" : "order-3"}`}
    >
      {place === 1 ? (
        <Crown
          size={22}
          className="text-amber-500 mb-1 drop-shadow-sm"
          aria-hidden
        />
      ) : null}
      <p className="text-xs font-semibold text-blue-900 truncate max-w-[90px] text-center">
        {maskLeaderName(entry.fullName)}
      </p>
      <p className="text-lg font-bold tabular-nums text-blue-700">
        {formatCount(entry.qualifyingUsers)}
      </p>
      <div
        className={`w-full max-w-[100px] ${heights[place]} rounded-t-xl bg-gradient-to-b ${colors[place]} flex items-end justify-center pb-2 text-sm font-bold shadow-lg`}
      >
        #{place}
      </div>
    </div>
  );
}

function ProgressToMilestone({
  current,
  milestones,
  next,
}: {
  current: number;
  milestones: CampaignMilestone[];
  next: (CampaignMilestone & { remaining: number }) | null;
}) {
  const maxTarget = milestones[milestones.length - 1]?.target || 500000;
  const pct = Math.min(100, (current / maxTarget) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-blue-600/80">
            User ที่เข้าเงื่อนไข
          </p>
          <p className="text-3xl font-bold tabular-nums text-blue-900">
            {formatCount(current)}
          </p>
        </div>
        {next ? (
          <div className="text-right text-sm text-slate-600">
            <p className="font-semibold text-blue-900">{next.label}</p>
            <p>อีก {formatCount(next.remaining)} คน</p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-amber-600">
            ถึงเป้าสูงสุดแล้ว
          </p>
        )}
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-blue-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] font-medium text-slate-500">
        {milestones.map((m) => (
          <span key={m.target} className="text-center">
            {formatCount(m.target)}
          </span>
        ))}
      </div>
    </div>
  );
}

export const Referral: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const { notify } = useNotification();
  const [searchParams, setSearchParams] = useSearchParams();
  const mainTab = searchParams.get("tab") === "ai" ? "ai" : "cash";
  const setMainTab = (tab: "ai" | "cash") => {
    setSearchParams(tab === "ai" ? { tab: "ai" } : {}, { replace: true });
  };
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [cashLeaderboard, setCashLeaderboard] = useState<LeaderboardEntry[]>(
    [],
  );
  const [baCampaign, setBaCampaign] = useState<CampaignPublic | null>(null);
  const [baLeaderboard, setBaLeaderboard] = useState<BaLeaderboardEntry[]>([]);
  const [baPodium, setBaPodium] = useState<BaLeaderboardEntry[]>([]);
  const [baMe, setBaMe] = useState<BaMeStats | null>(null);
  const [baTab, setBaTab] = useState<BaTab>("grand");
  const [showTerms, setShowTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [meAuthRequired, setMeAuthRequired] = useState(false);
  const [meStatsError, setMeStatsError] = useState(false);

  const loadBaBoard = async (board: BaBoard) => {
    try {
      const res = await api.get<{
        leaderboard: BaLeaderboardEntry[];
        podium: BaLeaderboardEntry[];
      }>(`/referral/brand-adviser/leaderboard?limit=20&board=${board}`);
      setBaLeaderboard(res.data?.leaderboard || []);
      if (board === "grand" && res.data?.podium?.length) {
        setBaPodium(res.data.podium);
      }
    } catch {
      setBaLeaderboard([]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setMeStatsError(false);
    const token = localStorage.getItem("meerak_token");

    try {
      const [campRes, leaderRes] = await Promise.all([
        api.get<CampaignPublic>("/referral/brand-adviser/campaign"),
        api.get<{ leaderboard: LeaderboardEntry[] }>(
          "/referral/leaderboard?limit=10",
        ),
      ]);
      setBaCampaign(campRes.data || null);
      setBaPodium(campRes.data?.platform?.podium || []);
      setCashLeaderboard(leaderRes.data?.leaderboard || []);
      await loadBaBoard("grand");
    } catch {
      setCashLeaderboard([]);
    }

    if (!token) {
      setMeAuthRequired(true);
      setStats(null);
      setBaMe(null);
      setLoading(false);
      return;
    }

    try {
      const [statsResult, baMeResult] = await Promise.allSettled([
        api.get<ReferralStats>("/referral/me"),
        api.get<BaMeStats>("/referral/brand-adviser/me"),
      ]);

      if (statsResult.status === "fulfilled") {
        setMeAuthRequired(false);
        setMeStatsError(false);
        setStats(statsResult.value.data);
      } else {
        setStats(null);
        const err = statsResult.reason;
        const status = axios.isAxiosError(err)
          ? err.response?.status
          : undefined;
        if (status === 401) {
          setMeAuthRequired(true);
          setMeStatsError(false);
        } else {
          setMeStatsError(true);
        }
      }

      if (baMeResult.status === "fulfilled") {
        setBaMe(baMeResult.value.data);
        if (baMeResult.value.data?.campaign) {
          setBaCampaign(baMeResult.value.data.campaign);
        }
      } else {
        setBaMe(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (baTab === "growth") return;
    void loadBaBoard(baTab);
  }, [baTab]);

  const handleCopyLink = useCallback(async () => {
    if (!stats?.referralLink) return;
    const ok = await copyPlainTextToClipboard(stats.referralLink);
    if (ok) {
      setCopied(true);
      notify("คัดลอกแล้ว", "success");
      setTimeout(() => setCopied(false), 2000);
    } else {
      notify("คัดลอกไม่สำเร็จ", "error");
    }
  }, [notify, stats?.referralLink]);

  const milestones = baCampaign?.milestones || [];
  const growthData = useMemo(
    () => baMe?.growthSeries || [],
    [baMe?.growthSeries],
  );
  const podiumOrdered: [
    BaLeaderboardEntry | undefined,
    BaLeaderboardEntry | undefined,
    BaLeaderboardEntry | undefined,
  ] = [
    baPodium.find((e) => e.rank === 2) || baLeaderboard[1],
    baPodium.find((e) => e.rank === 1) || baLeaderboard[0],
    baPodium.find((e) => e.rank === 3) || baLeaderboard[2],
  ];

  const pctFormatted =
    stats?.effectiveCommissionRatePct != null
      ? new Intl.NumberFormat("th-TH", {
          maximumFractionDigits: 2,
        }).format(stats.effectiveCommissionRatePct)
      : null;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px] bg-gradient-to-b from-sky-50 to-white">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6 pb-24 bg-gradient-to-b from-sky-50/80 via-white to-blue-50/50 min-h-screen">
      <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setMainTab("ai")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mainTab === "ai"
              ? "bg-violet-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          ปลด AI Resume (10/10)
        </button>
        <button
          type="button"
          onClick={() => setMainTab("cash")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mainTab === "cash"
              ? "bg-emerald-600 text-white"
              : "text-slate-600 hover:bg-slate-50"
          }`}
        >
          โบนัสเงินสด & แคมเปญ
        </button>
      </div>

      {mainTab === "ai" ? (
        <TalentReferralDashboard />
      ) : (
        <>
      {/* ลิงก์แนะนำของคุณ — คัดลอกไปวางที่ไหนก็ได้ */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <Link2 size={18} className="text-emerald-600 shrink-0" />
          ลิงก์แนะนำของคุณ
        </h2>

        {meAuthRequired || !isAuthenticated ? (
          <Link
            to="/login?next=%2Freferral"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            เข้าสู่ระบบเพื่อรับลิงก์
          </Link>
        ) : meStatsError ? (
          <div className="space-y-2">
            <p className="text-sm text-amber-700">โหลดลิงก์ไม่สำเร็จ</p>
            <button
              type="button"
              onClick={() => void fetchData()}
              className="text-sm font-semibold text-emerald-700 underline"
            >
              ลองใหม่
            </button>
          </div>
        ) : stats?.referralLink ? (
          <div className="flex gap-2">
            <input
              readOnly
              value={stats.referralLink}
              aria-label="ลิงก์แนะนำ"
              className="flex-1 min-w-0 px-4 py-2.5 border border-slate-200 rounded-lg bg-slate-50 text-sm font-mono text-slate-800"
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold flex items-center gap-2 hover:bg-emerald-700 shrink-0"
            >
              {copied ? <Check size={18} /> : <Copy size={18} />}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        ) : (
          <p className="text-slate-500 text-sm">รอระบบสร้างรหัสแนะนำ</p>
        )}

        {baCampaign?.termsAndConditions?.length ? (
          <div className="border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowTerms((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
            >
              ข้อกำหนดแคมเปญ (T&amp;C)
              {showTerms ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showTerms ? (
              <ul className="mt-3 space-y-2 text-xs text-slate-600 list-disc pl-4">
                {baCampaign.termsAndConditions.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* โบนัสเงินสด 1.5% */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Gift size={20} className="text-amber-500" />
            {pctFormatted
              ? `โบนัสเงินสด ${pctFormatted}%`
              : "โบนัสเงินสดจากงานเพื่อน"}
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            โปรแยกจากแคมเปญรางวัลใหญ่ — จ่ายเมื่อเพื่อนทำงาน (provider) ภายใน 7
            วันแรกจากงานแรก
          </p>
        </div>
        {meAuthRequired ? (
          <p className="text-sm text-slate-500">
            เข้าสู่ระบบเพื่อดูสถิติเพื่อนและรายได้สะสม
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-lg p-4 border border-slate-100">
              <Users size={20} className="text-indigo-500 mb-1" />
              <p className="text-xs text-slate-500">เพื่อนที่สมัคร</p>
              <p className="text-xl font-bold tabular-nums">
                {stats?.totalReferrals ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-slate-100">
              <TrendingUp size={20} className="text-emerald-500 mb-1" />
              <p className="text-xs text-slate-500">เพื่อนที่มีงานจ้างแล้ว</p>
              <p className="text-xl font-bold tabular-nums">
                {stats?.activeWorkers ?? 0}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-slate-100">
              <Gift size={20} className="text-amber-600 mb-1" />
              <p className="text-xs text-slate-500">รายได้สะสม</p>
              <p className="text-xl font-bold text-amber-700 tabular-nums">
                ฿{(stats?.totalEarned ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        )}
        {!meAuthRequired && (stats?.pendingCommission ?? 0) > 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
            รอจ่ายค่าคอม ฿{(stats?.pendingCommission ?? 0).toLocaleString()} —
            อยู่ในคิว (งบการตลาด)
          </p>
        ) : null}
        {!meAuthRequired ? (
          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 mb-2">
              ประวัติค่าคอมจากงานเพื่อน
            </h3>
            <div className="space-y-1.5">
              {!stats?.recentEarnings?.length ? (
                <p className="text-slate-500 text-xs">
                  ยังไม่มี — เมื่อเพื่อนที่แนะนำทำงานจบภายใน 7 วันจากงานแรก
                  จะแสดงที่นี่
                </p>
              ) : (
                stats.recentEarnings.map((row) => (
                  <div
                    key={`${row.jobId}-${row.createdAt}`}
                    className="flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">
                        {maskLeaderName(row.refereeName)}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        งาน ฿{row.grossAmount.toLocaleString()} ·{" "}
                        {formatShortDate(row.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold text-emerald-700 tabular-nums">
                      +฿{row.commissionAmount.toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
        <div className="pt-2 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-700 mb-2">
            อันดับรายได้เงินสดประจำสัปดาห์
          </h3>
          <div className="space-y-1">
            {cashLeaderboard.length === 0 ? (
              <p className="text-slate-500 text-xs">ยังไม่มีข้อมูล</p>
            ) : (
              cashLeaderboard.slice(0, 5).map((entry, idx) => (
                <div
                  key={entry.userId}
                  className="flex justify-between text-sm py-1.5 px-2 rounded bg-slate-50"
                >
                  <span>
                    {idx + 1}. {maskLeaderName(entry.fullName)}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    ฿{entry.earnedThisWeek.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Hero — premium light blue theme (AQOND profile style) */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-200/70 bg-gradient-to-br from-sky-100 via-white to-blue-50 shadow-[0_8px_40px_rgba(37,99,235,0.12)]">
        {/* Decorative glow */}
        <div className="pointer-events-none absolute inset-0 -z-10 opacity-40 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(56,189,248,0.35),transparent)]" />

        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 shadow-lg shadow-blue-500/25 ring-2 ring-white">
              <Crown size={24} className="text-amber-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 mb-1">
                Grand Prize Campaign
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold leading-tight text-blue-950 tracking-tight">
                {baCampaign?.campaignName || "Brand Adviser Grand Prize"}
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                แจกใหญ่กว่านี้ไม่มีอีกแล้ว — ผู้ชนะ{" "}
                <span className="font-semibold text-blue-800">
                  อันดับ 1 สูงสุด
                </span>{" "}
                จบแคมเปญได้รางวัลตาม tier ที่ถึง
              </p>
            </div>
          </div>

          {baCampaign ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 font-medium text-blue-800 shadow-sm ring-1 ring-blue-100">
                <Calendar size={12} className="text-blue-500" />
                {formatShortDate(baCampaign.startAt)} –{" "}
                {formatShortDate(baCampaign.endAt)}
              </span>
              <span className="inline-flex rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-3 py-1.5 font-bold text-amber-950 shadow-sm">
                เหลือ {formatCountdown(baCampaign.countdownSeconds || 0)}
              </span>
              <span className="inline-flex rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white shadow-sm">
                ขั้นต่ำ {formatCount(baCampaign.minPurchaseThb)} บาท/รายการ
              </span>
            </div>
          ) : null}

          {baCampaign?.platform ? (
            <div className="rounded-2xl bg-white/90 backdrop-blur-sm p-4 text-sm shadow-sm ring-1 ring-blue-100">
              <p className="text-slate-600">
                ทั้งแพลตฟอร์มมี{" "}
                <strong className="text-blue-800 text-base">
                  {formatCount(baCampaign.platform.totalQualifyingUsers)}
                </strong>{" "}
                user เข้าเงื่อนไขจาก{" "}
                <strong className="text-blue-800">
                  {formatCount(baCampaign.platform.totalReferrers)}
                </strong>{" "}
                ผู้แนะนำ
              </p>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-3">
            {[...milestones].reverse().map((m, idx) => (
              <div
                key={m.target}
                className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-md ring-1 ring-blue-100/80 transition hover:shadow-lg"
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${
                    idx === 0
                      ? "bg-gradient-to-b from-amber-400 to-amber-600"
                      : idx === 1
                        ? "bg-gradient-to-b from-blue-400 to-blue-600"
                        : "bg-gradient-to-b from-sky-400 to-cyan-500"
                  }`}
                />
                <p className="pl-2 text-[11px] font-bold uppercase tracking-wide text-amber-600">
                  {m.label}
                </p>
                <p className="pl-2 mt-1 text-xl font-extrabold tabular-nums text-blue-950">
                  {formatCount(m.target)}{" "}
                  <span className="text-sm font-semibold text-slate-500">
                    user
                  </span>
                </p>
                <p className="pl-2 mt-2 text-[11px] leading-snug text-slate-600 line-clamp-3">
                  {m.prize}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Podium */}
        <div className="border-t border-blue-100 bg-gradient-to-b from-white to-sky-50/80 px-4 py-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-blue-600 mb-4">
            Podium — Grand Race
          </p>
          <div className="flex items-end justify-center gap-3 max-w-md mx-auto">
            <PodiumCard entry={podiumOrdered[0]} place={2} />
            <PodiumCard entry={podiumOrdered[1]} place={1} />
            <PodiumCard entry={podiumOrdered[2]} place={3} />
          </div>
        </div>

        {/* My progress */}
        <div className="border-t border-blue-100 bg-white p-5 sm:p-6">
          <h2 className="font-bold text-blue-950 flex items-center gap-2 mb-4">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Target size={16} className="text-blue-700" />
            </span>
            ความคืบหน้ารหัสของคุณ
          </h2>
          {meAuthRequired ? (
            <p className="text-sm text-slate-600">
              เข้าสู่ระบบเพื่อดูยอดสะสม อันดับ และ gap ถึง #1
            </p>
          ) : baMe ? (
            <div className="space-y-4">
              <ProgressToMilestone
                current={baMe.qualifyingUsers}
                milestones={milestones}
                next={baMe.nextMilestone}
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {baMe.rank ? (
                  <div className="rounded-xl bg-blue-50 p-2 ring-1 ring-blue-100">
                    <p className="text-[10px] text-blue-600/70">อันดับ</p>
                    <p className="text-lg font-bold text-blue-800">
                      #{baMe.rank}
                    </p>
                  </div>
                ) : null}
                {baMe.percentile ? (
                  <div className="rounded-xl bg-blue-50 p-2 ring-1 ring-blue-100">
                    <p className="text-[10px] text-blue-600/70">เปอร์เซไทล์</p>
                    <p className="text-lg font-bold text-blue-900">
                      Top {baMe.percentile}%
                    </p>
                  </div>
                ) : null}
                <div className="rounded-xl bg-amber-50 p-2 ring-1 ring-amber-100">
                  <p className="text-[10px] text-amber-700/70">ตาม #1 อีก</p>
                  <p className="text-lg font-bold tabular-nums text-amber-700">
                    {formatCount(baMe.gapToFirst ?? 0)}
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
                  <p className="text-[10px] text-slate-500">Tier</p>
                  <p className="text-sm font-bold text-blue-900">
                    {baMe.tierBadge?.label}
                  </p>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                +{formatCount(baMe.qualifyingThisWeek)} คนในสัปดาห์นี้
                {baMe.firstPlaceCount > 0
                  ? ` · อันดับ 1 มี ${formatCount(baMe.firstPlaceCount)} user`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
          )}
        </div>
      </section>

      {/* Board tabs */}
      <section className="rounded-2xl border border-blue-100 bg-white shadow-[0_4px_24px_rgba(37,99,235,0.08)] overflow-hidden">
        <div className="flex border-b border-blue-50 overflow-x-auto">
          {(
            [
              { id: "grand" as const, label: "Grand Race", icon: Trophy },
              { id: "week" as const, label: "Hot Week", icon: Flame },
              { id: "velocity" as const, label: "Velocity", icon: Zap },
              { id: "growth" as const, label: "กราฟของฉัน", icon: BarChart3 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setBaTab(id)}
              className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-semibold transition whitespace-nowrap px-2 ${
                baTab === id
                  ? "bg-blue-50 text-blue-900 border-b-2 border-blue-600"
                  : "text-slate-500 hover:bg-sky-50/50"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {baTab !== "growth" ? (
            <>
              <p className="text-xs text-slate-500 mb-4">
                {baTab === "grand" &&
                  "อันดับสะสม user ที่เข้าเงื่อนไข — ตัดสินผู้ชนะ Top 1"}
                {baTab === "week" && "user ใหม่ที่ qualify ใน 7 วันล่าสุด"}
                {baTab === "velocity" &&
                  "อัตราเติบโตสัปดาห์นี้เทียบยอดสะสม — มือใหม่มีโอกาสเด่น"}
              </p>
              <div className="space-y-2">
                {baLeaderboard.length === 0 ? (
                  <p className="text-slate-500 text-sm py-6 text-center">
                    ยังไม่มีผู้เข้าร่วม — เป็นคนแรกเลย!
                  </p>
                ) : (
                  baLeaderboard.map((entry) => (
                    <div
                      key={entry.userId}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        entry.rank <= 3
                          ? "bg-gradient-to-r from-amber-50 via-white to-sky-50 border border-amber-100/80 shadow-sm"
                          : "bg-slate-50/80 ring-1 ring-slate-100"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${
                            entry.rank === 1
                              ? "bg-amber-400 text-amber-950"
                              : entry.rank === 2
                                ? "bg-slate-300 text-slate-800"
                                : entry.rank === 3
                                  ? "bg-amber-700 text-amber-50"
                                  : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {entry.rank}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">
                            {maskLeaderName(entry.fullName)}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {entry.referralCode}
                            {entry.tierBadge
                              ? ` · ${entry.tierBadge.label}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 pl-2">
                        <p className="text-lg font-bold tabular-nums text-blue-700">
                          {baTab === "week"
                            ? formatCount(entry.weekNew || 0)
                            : formatCount(entry.qualifyingUsers)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {baTab === "week" ? "ใหม่ 7 วัน" : "user"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : meAuthRequired ? (
            <p className="text-sm text-slate-600 py-8 text-center">
              เข้าสู่ระบบเพื่อดูกราฟของคุณ
            </p>
          ) : growthData.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              ยังไม่มีข้อมูล — แชร์รหัสแล้วรอเพื่อนจัดซื้อบริการครบเงื่อนไข
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                กราฟสะสม user ที่เข้าเงื่อนไข (แนวดูหุ้น)
              </p>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={growthData}>
                    <defs>
                      <linearGradient id="baGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#2563eb"
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor="#2563eb"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => String(v).slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} width={36} />
                    <Tooltip
                      formatter={(value, name) => [
                        formatCount(Number(value ?? 0)),
                        name === "totalUsers" ? "สะสม" : "ใหม่วันนั้น",
                      ]}
                      labelFormatter={(l) => formatShortDate(String(l))}
                    />
                    <Area
                      type="monotone"
                      dataKey="totalUsers"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fill="url(#baGrowth)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </section>
        </>
      )}
    </div>
  );
};
