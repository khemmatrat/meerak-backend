import React, { useState, useEffect, useCallback } from 'react';
import { Users, DollarSign, Smartphone, Zap, Sparkles, Loader2, Database, RefreshCw, AlertCircle, TrendingUp, TrendingDown, Shield, LayoutDashboard, Headphones } from 'lucide-react';
import { StatsCard } from './StatsCard';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getDashboardOverview, fetchDashboardInsight, getAdminToken, getStabilityFund, getSupportSentimentTrend, type DashboardRange, type SupportSentimentTrendResponse } from '../services/adminApi';
import { SupportTicketView } from './SupportTicketView';
import { GatewayInternalHealthStrip } from './GatewayInternalHealthStrip';

const QUEUE_BACKLOG_THRESHOLD = 50;
const AUTO_REFRESH_MS = 90 * 1000;

type DashboardMainTab = 'overview' | 'support-admin';

export const DashboardView: React.FC = () => {
  const [mainTab, setMainTab] = useState<DashboardMainTab>('overview');
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getDashboardOverview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string>('');
  const [loadingInsight, setLoadingInsight] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [range, setRange] = useState<DashboardRange>('month');
  const [stabilityFund, setStabilityFund] = useState<{ total_reserve_cash: number; projected_monthly_interest: number } | null>(null);
  const [sentimentTrend, setSentimentTrend] = useState<SupportSentimentTrendResponse | null>(null);
  const [sentimentLoading, setSentimentLoading] = useState(false);

  const hasToken = !!getAdminToken();

  const fetchSentimentTrend = useCallback(async () => {
    if (!getAdminToken()) {
      setSentimentTrend(null);
      return;
    }
    setSentimentLoading(true);
    try {
      const d = await getSupportSentimentTrend(24);
      setSentimentTrend(d);
    } catch {
      setSentimentTrend(null);
    } finally {
      setSentimentLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async (silent = false) => {
    if (!hasToken) {
      setOverview(null);
      setLoading(false);
      setError('กรุณา Login Admin ก่อน');
      return;
    }
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const data = await getDashboardOverview(range);
      setOverview(data);
    } catch (e: unknown) {
      if (!silent) {
        setError((e as Error)?.message || 'โหลดข้อมูลไม่สำเร็จ');
        setOverview(null);
      }
    }
    if (!silent) setLoading(false);
  }, [hasToken, range]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    if (!hasToken) return;
    getStabilityFund().then((d) => setStabilityFund(d)).catch(() => setStabilityFund(null));
  }, [hasToken]);

  useEffect(() => {
    if (!hasToken) return;
    const t = setInterval(() => fetchOverview(true), AUTO_REFRESH_MS);
    return () => clearInterval(t);
  }, [hasToken, fetchOverview]);

  useEffect(() => {
    if (!hasToken || mainTab !== 'overview') return;
    fetchSentimentTrend();
    const t = setInterval(fetchSentimentTrend, 120 * 1000);
    return () => clearInterval(t);
  }, [hasToken, mainTab, fetchSentimentTrend]);

  const fetchInsight = async () => {
    setLoadingInsight(true);
    setInsightError(null);
    try {
      const result = await fetchDashboardInsight();
      setInsight(result.insight);
    } catch (e: unknown) {
      setInsightError((e as Error)?.message || 'ไม่สามารถเชื่อมต่อ AI ได้');
      setInsight('');
    }
    setLoadingInsight(false);
  };

  const chartData = overview?.chart_data ?? [];
  const formatRevenue = (n: number) => `฿${n.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <GatewayInternalHealthStrip />

      {/* Main tabs: Overview vs Support Admin (Minnie + queue) */}
      <div className="flex w-full max-w-full flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 sm:inline-flex sm:w-auto sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => setMainTab('overview')}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all sm:min-h-0 sm:py-2 ${
            mainTab === 'overview' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <LayoutDashboard size={18} /> ภาพรวมระบบ
        </button>
        <button
          type="button"
          onClick={() => setMainTab('support-admin')}
          className={`flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all sm:min-h-0 sm:py-2 ${
            mainTab === 'support-admin' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Headphones size={18} /> Support Admin
        </button>
      </div>

      {mainTab === 'support-admin' && (
        <div className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-white p-4 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800">Support Admin</h2>
          <p className="text-sm text-slate-600 mt-1">
            Minnie (AI) + Help Center KB รับแชทเบื้องต้น 24 ชม. — คิวเรียงตาม Priority และ Sentiment เพื่อให้ทีมเล็กรับมือลูกค้าได้เป็นวงกว้าง
          </p>
        </div>
      )}

      {mainTab === 'support-admin' ? (
        <div className="min-h-[calc(100vh-220px)] -mx-2">
          <SupportTicketView embeddedInDashboard />
        </div>
      ) : null}

      {mainTab === 'overview' && (
      <>
      {/* Backend Status */}
      <div className={`flex items-center justify-between px-4 py-2 rounded-lg text-sm font-medium ${hasToken ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
        <div className="flex items-center gap-2">
          <Database size={16} />
          <span>Backend: <strong>{hasToken ? 'เชื่อมต่อ API (Live)' : 'ยังไม่ได้ Login Admin'}</strong></span>
        </div>
        {hasToken && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">อัพเดตอัตโนมัติทุก 1.5 นาที</span>
            <button onClick={() => fetchOverview(false)} disabled={loading} className="flex items-center gap-1 text-emerald-600 hover:underline">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* แจ้งเตือน: queue_backlog สูง หรือมี failed transactions */}
      {overview && (overview.queue_backlog >= QUEUE_BACKLOG_THRESHOLD || overview.failed_transactions_today > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-medium text-amber-800">แจ้งเตือน</p>
              <ul className="text-sm text-amber-700 mt-1 space-y-1">
                {overview.queue_backlog >= QUEUE_BACKLOG_THRESHOLD && (
                  <li>• คิวงานรออยู่ <strong>{overview.queue_backlog}</strong> รายการ (เกินเกณฑ์ {QUEUE_BACKLOG_THRESHOLD})</li>
                )}
                {overview.failed_transactions_today > 0 && (
                  <li>• ธุรกรรมล้มเหลววันนี้ <strong>{overview.failed_transactions_today}</strong> รายการ</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Stability Reserve Summary Widget */}
      {stabilityFund && (
        <div className="bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-amber-800 mb-2 flex items-center gap-1">
            <Shield size={16} /> Stability Reserve
          </h4>
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-amber-700 text-xs">Total Reserve Cash</span>
              <p className="font-bold text-amber-900">฿{stabilityFund.total_reserve_cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <span className="text-amber-700 text-xs">Projected Monthly Interest (2%)</span>
              <p className="font-bold text-amber-800">฿{stabilityFund.projected_monthly_interest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>
      )}

      {/* เปรียบเทียบรายได้ สัปดาห์นี้ vs สัปดาห์ก่อน */}
      {overview && (overview.revenue_this_week > 0 || overview.revenue_previous_week > 0) && (
        <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">เปรียบเทียบรายได้ (7 วัน)</h4>
          <div className="flex flex-wrap gap-6">
            <div>
              <span className="text-slate-500 text-sm">สัปดาห์นี้</span>
              <p className="font-bold text-emerald-600">฿{overview.revenue_this_week.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <span className="text-slate-500 text-sm">สัปดาห์ก่อน</span>
              <p className="font-bold text-slate-700">฿{overview.revenue_previous_week.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <span className="text-slate-500 text-sm">การเปลี่ยนแปลง</span>
              {overview.revenue_previous_week > 0 ? (
                <p className={`font-bold flex items-center gap-1 ${overview.revenue_this_week >= overview.revenue_previous_week ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {overview.revenue_this_week >= overview.revenue_previous_week ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {(((overview.revenue_this_week - overview.revenue_previous_week) / overview.revenue_previous_week) * 100).toFixed(1)}%
                </p>
              ) : (
                <p className="font-bold text-emerald-600 flex items-center gap-1"><TrendingUp size={16} /> —</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard 
          title="ผู้ใช้งานทั้งหมด" 
          value={loading ? '—' : (overview?.total_users ?? 0).toLocaleString()} 
          trend={overview ? `${overview.posts_today} งานวันนี้` : '—'} 
          trendUp={true} 
          icon={Users} 
          color="bg-indigo-500" 
        />
        <StatsCard 
          title="รายได้รวม (เดือนนี้)" 
          value={loading ? '—' : formatRevenue(overview?.total_revenue ?? 0)} 
          trend={overview?.chart_data?.length ? '30 วันล่าสุด' : '—'} 
          trendUp={true} 
          icon={DollarSign} 
          color="bg-emerald-500" 
        />
        <StatsCard 
          title="งานที่รับวันนี้" 
          value={loading ? '—' : (overview?.accepted_today ?? 0).toString()} 
          trend={`คิวรอ ${overview?.queue_backlog ?? 0}`} 
          trendUp={true} 
          icon={Smartphone} 
          color="bg-blue-500" 
        />
        <StatsCard 
          title="Server Load" 
          value={loading ? '—' : `${overview?.server_load_percent ?? 0}%`} 
          trend={`Uptime ${Math.floor((overview?.uptime_seconds ?? 0) / 60)} นาที`} 
          trendUp={true} 
          icon={Zap} 
          color="bg-amber-500" 
        />
      </div>

      {/* Global Sentiment — เทรนด์รายชั่วโมง 24 ชม. (รวมกับ Crisis Alert เพื่อมองภาพมวลชน) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-800">Sentiment Trend (24 ชม.)</h3>
            <p className="text-xs text-slate-500">ค่าเฉลี่ย 0–1 สูง = ลูกค้าโอเคมากขึ้น — ข้อมูลจากตั๋ว + event ล่าสุด</p>
          </div>
          <button
            type="button"
            onClick={() => fetchSentimentTrend()}
            disabled={sentimentLoading}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} className={sentimentLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
        <div className="h-56">
          {sentimentTrend?.points?.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={sentimentTrend.points.map((p) => ({
                  name: p.label,
                  sentiment: p.avgSentiment != null ? Math.round(p.avgSentiment * 1000) / 1000 : 0.5,
                  samples: p.count,
                }))}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} tickFormatter={(v) => v.toFixed(1)} />
                <Tooltip
                  formatter={(value: number) => [`${value}`, 'ค่าเฉลี่ย sentiment (0–1)']}
                />
                <Legend />
                <Line type="monotone" dataKey="sentiment" name="Sentiment" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              {sentimentLoading ? <Loader2 className="animate-spin" size={28} /> : 'ไม่มีข้อมูล sentiment หรือยังไม่ได้เชื่อม API'}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3">
        {/* Main Chart */}
        <div className="order-1 bg-white p-4 rounded-xl shadow-sm border border-slate-100 sm:p-6 lg:col-span-2 lg:order-none">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h3 className="text-lg font-bold text-slate-800">Traffic & Revenue</h3>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as DashboardRange)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-700"
            >
              <option value="today">วันนี้</option>
              <option value="week">สัปดาห์นี้</option>
              <option value="month">เดือนนี้</option>
            </select>
          </div>
          <div className="h-64 sm:h-80">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 12}} />
                  <Tooltip 
                    contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: number, name: string) => [name === 'revenue' ? formatRevenue(value) : value, name === 'users' ? 'ผู้ใช้ใหม่' : 'รายได้']}
                  />
                  <Area type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorUsers)" />
                  <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400">
                {loading ? <Loader2 className="animate-spin" size={32} /> : 'ไม่มีข้อมูลกราฟ'}
              </div>
            )}
          </div>
        </div>

        {/* AI Insight Panel */}
        <div className="order-2 bg-gradient-to-br from-indigo-900 to-slate-900 p-4 sm:p-6 rounded-xl text-white shadow-xl relative overflow-hidden lg:order-none">
          <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>
          
          <div className="flex items-center gap-2 mb-4 relative z-10">
            <Sparkles className="text-yellow-400" />
            <h3 className="font-bold text-lg">AI Analytics</h3>
          </div>
          
          <div className="min-h-[200px] mb-4 relative z-10">
            {loadingInsight ? (
              <div className="flex flex-col items-center justify-center h-48 text-indigo-200">
                <Loader2 className="animate-spin mb-3" size={32} />
                <p>Gemini กำลังวิเคราะห์ข้อมูล...</p>
              </div>
            ) : insightError ? (
              <div className="flex flex-col items-center justify-center h-48 text-amber-300 text-center">
                <AlertCircle size={24} className="mb-2" />
                <p className="text-sm">{insightError}</p>
                <p className="text-xs mt-2 text-indigo-300">ตรวจสอบ GEMINI_API_KEY ใน Backend .env</p>
              </div>
            ) : insight ? (
              <div className="prose prose-invert prose-sm">
                <p className="whitespace-pre-line text-indigo-100 leading-relaxed text-sm">
                  {insight}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-indigo-300 text-center">
                <p className="mb-4">ให้ AI ช่วยวิเคราะห์ข้อมูลเชิงลึกและสรุปสถานการณ์ปัจจุบันของระบบ</p>
                <p className="text-xs text-indigo-400">ใช้ข้อมูลจริงจาก Backend (ผู้ใช้, รายได้, ล็อก)</p>
              </div>
            )}
          </div>

          <button 
            onClick={fetchInsight}
            disabled={loadingInsight}
            className="w-full py-3 bg-white/10 hover:bg-white/20 backdrop-blur-sm border border-white/10 rounded-lg font-medium transition-colors text-white flex justify-center items-center gap-2 relative z-10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingInsight ? 'กำลังประมวลผล...' : 'วิเคราะห์ข้อมูลด้วย Gemini'}
          </button>
        </div>
      </div>
      </>
      )}
    </div>
  );
};
