import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Briefcase,
  ArrowUpRight,
  Clock,
  AlertTriangle,
  PauseCircle,
  Activity,
  Zap,
  ZapOff,
  RotateCcw,
  Loader2,
  RefreshCw,
  ExternalLink,
  X,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { MOCK_JOB_STATS, MOCK_TRANSACTIONS } from "../constants";
import { CircuitBreaker } from "../types";
import {
  getJobOperationsStats,
  getCircuitBreakersStatus,
  tripCircuitBreaker,
  resetCircuitBreaker,
  getJobOperationsQueueBacklog,
  getAdminJobGraphDetail,
  type JobQueueBacklogItem,
} from "../services/adminApi";

const SERVICE_KEY_TO_LABEL: Record<string, string> = {
  payment_gateway: "Payment Gateway",
  map_location_api: "Map/Location API",
  sms_provider: "SMS Provider",
  image_processing: "Image Processing",
};

interface JobOperationsViewProps {
  focusJobId?: string | null;
  onFocusConsumed?: () => void;
}

export const JobOperationsView: React.FC<JobOperationsViewProps> = ({
  focusJobId = null,
  onFocusConsumed,
}) => {
  const [stats, setStats] = useState<{
    total_posts_today: number;
    total_accepted_today: number;
    queue_backlog: number;
    failed_transactions_today: number;
    failed_transactions_total: number;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [breakers, setBreakers] = useState<CircuitBreaker[]>([]);
  const [breakersLoading, setBreakersLoading] = useState(true);
  const [breakerActioning, setBreakerActioning] = useState<string | null>(null);
  const [queueItems, setQueueItems] = useState<JobQueueBacklogItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [focusMeta, setFocusMeta] = useState<{
    title?: string | null;
    job_status?: string;
    is_stuck?: boolean;
    stuck_step?: string | null;
  } | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const data = await getJobOperationsStats();
      setStats(data);
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchBreakers = useCallback(async () => {
    try {
      const res = await getCircuitBreakersStatus();
      const items: CircuitBreaker[] = Object.entries(
        res.circuit_breakers || {},
      ).map(([key, status]) => ({
        service: SERVICE_KEY_TO_LABEL[key] || key,
        serviceKey: key,
        state: (status === "open" ? "OPEN" : "CLOSED") as
          | "CLOSED"
          | "OPEN"
          | "HALF-OPEN",
        failureRate: status === "open" ? 100 : 0,
        lastTripTime: status === "open" ? "-" : null,
      }));
      setBreakers(items);
    } catch {
      setBreakers([]);
    } finally {
      setBreakersLoading(false);
    }
  }, []);

  const fetchQueue = useCallback(async (jobId?: string | null) => {
    try {
      const data = await getJobOperationsQueueBacklog({
        job_type: "jobs",
        limit: 40,
        job_id: jobId || undefined,
      });
      setQueueItems(data.items || []);
    } catch {
      setQueueItems([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!focusJobId) return;
    let cancelled = false;
    (async () => {
      setQueueLoading(true);
      try {
        const [graphRes] = await Promise.all([
          getAdminJobGraphDetail(focusJobId).catch(() => null),
          fetchQueue(focusJobId),
        ]);
        if (cancelled) return;
        const g = graphRes?.graph;
        if (g) {
          setFocusMeta({
            title: g.title,
            job_status: g.job_status,
            is_stuck: g.is_stuck,
            stuck_step: g.stuck_step,
          });
        } else {
          setFocusMeta({ title: null, job_status: "unknown" });
        }
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [focusJobId, fetchQueue]);

  useEffect(() => {
    if (focusJobId) return;
    setFocusMeta(null);
    void fetchQueue(null);
    const t = setInterval(() => fetchQueue(null), 60000);
    return () => clearInterval(t);
  }, [fetchQueue, focusJobId]);

  useEffect(() => {
    if (!focusJobId || queueLoading) return;
    const t = window.setTimeout(() => {
      focusRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
    return () => window.clearTimeout(t);
  }, [focusJobId, queueLoading, queueItems.length]);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 45000);
    return () => clearInterval(t);
  }, [fetchStats]);

  useEffect(() => {
    fetchBreakers();
    const t = setInterval(fetchBreakers, 30000);
    return () => clearInterval(t);
  }, [fetchBreakers]);

  const handleBreakerAction = async (
    serviceKey: string,
    currentState: string,
  ) => {
    if (breakerActioning) return;
    setBreakerActioning(serviceKey);
    try {
      if (currentState === "OPEN") {
        await resetCircuitBreaker(serviceKey);
      } else {
        await tripCircuitBreaker(serviceKey);
      }
      await fetchBreakers();
    } catch {
      // keep UI state
    } finally {
      setBreakerActioning(null);
    }
  };

  const fillRatePct =
    stats && stats.total_posts_today > 0
      ? ((stats.total_accepted_today / stats.total_posts_today) * 100).toFixed(
          1,
        )
      : null;

  return (
    <div className="space-y-8">
      {/* Top Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-600" />
            Job Operations Center
          </h2>
          <p className="text-slate-500 text-sm">
            Real-time monitoring for Post/Accept job transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold text-emerald-700">
              Matching Engine: ACTIVE
            </span>
          </div>
          <button className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 rounded-lg text-sm font-medium transition-colors">
            <PauseCircle size={16} /> Emergency Stop
          </button>
        </div>
      </div>

      {focusJobId && (
        <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-indigo-900 flex items-center gap-1">
              <ExternalLink size={14} /> โฟกัสจาก Job Graph
            </p>
            <p className="font-semibold text-slate-900 text-sm mt-0.5">
              {focusMeta?.title || "กำลังโหลด..."}
            </p>
            <p className="text-[11px] font-mono text-slate-600">{focusJobId}</p>
            {focusMeta?.job_status && (
              <p className="text-xs text-slate-600 mt-1">
                Status: <strong>{focusMeta.job_status}</strong>
                {focusMeta.is_stuck && focusMeta.stuck_step ? (
                  <span className="ml-2 text-amber-800 font-bold">
                    · ติดขั้น {focusMeta.stuck_step}
                  </span>
                ) : null}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onFocusConsumed?.()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-100"
          >
            <X size={14} /> ปิดโฟกัส
          </button>
        </div>
      )}

      {/* Open jobs — Transport job kind (from payment_details) */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm">
            Open jobs (sample)
          </h3>
          <button
            type="button"
            onClick={() => void fetchQueue(focusJobId)}
            className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {queueLoading ? (
          <div className="p-8 flex justify-center text-slate-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : queueItems.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No open jobs or API unavailable.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 font-semibold">Job</th>
                  <th className="px-4 py-2 font-semibold">Category</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Job kind</th>
                  <th className="px-4 py-2 font-semibold">Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queueItems.map((row) => {
                  const isFocus = focusJobId && String(row.id) === focusJobId;
                  return (
                    <tr
                      key={String(row.id)}
                      ref={isFocus ? focusRowRef : undefined}
                      className={`hover:bg-slate-50/80 ${
                        isFocus
                          ? "bg-indigo-50 ring-2 ring-inset ring-indigo-400"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2 max-w-[220px]">
                        <span className="font-medium text-slate-800 line-clamp-2">
                          {row.title}
                        </span>
                        <span className="block text-[10px] text-slate-400 font-mono truncate">
                          {row.id}
                        </span>
                        {row.focused && (
                          <span className="text-[9px] text-indigo-700 font-bold">
                            (นอก open queue)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-slate-600">
                        {row.category}
                      </td>
                      <td className="px-4 py-2 text-slate-600 text-xs">
                        {row.status || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            row.transport_job_kind === "intercity_charter"
                              ? "bg-amber-100 text-amber-900"
                              : row.transport_job_kind === "relay_leg"
                                ? "bg-violet-100 text-violet-900"
                                : row.transport_job_kind === "local_on_demand"
                                  ? "bg-emerald-100 text-emerald-900"
                                  : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.transport_job_kind || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-500 whitespace-nowrap text-xs">
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Card 1 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Posts (Today)</p>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-slate-800">
                {stats ? stats.total_posts_today.toLocaleString() : "-"}
              </h3>
              <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                Live from backend
              </div>
            </>
          )}
        </div>

        {/* Card 2 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Total Accepted (Today)</p>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-slate-800">
                {stats ? stats.total_accepted_today.toLocaleString() : "-"}
              </h3>
              <div className="flex items-center gap-1 text-emerald-600 text-xs mt-2">
                {fillRatePct != null ? (
                  <>
                    <ArrowUpRight size={14} /> {fillRatePct}% Fill Rate
                  </>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Card 3 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Queue Backlog</p>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-amber-600">
                {stats ? stats.queue_backlog.toLocaleString() : "-"}
              </h3>
              <div className="flex items-center gap-1 text-amber-600 text-xs mt-2">
                <Clock size={14} /> Open jobs waiting
              </div>
            </>
          )}
        </div>

        {/* Card 4 */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <p className="text-sm text-slate-500 mb-1">Failed Transactions</p>
          {statsLoading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <h3 className="text-2xl font-bold text-rose-600">
                {stats ? stats.failed_transactions_total.toLocaleString() : "-"}
              </h3>
              <div className="flex items-center gap-1 text-slate-400 text-xs mt-2">
                <Activity size={14} />{" "}
                {stats ? `${stats.failed_transactions_today} today` : "-"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Circuit Breakers Section */}
      <div className="bg-slate-900 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Zap size={20} className="text-yellow-400" />
            Circuit Breakers Status
          </h3>
          <span className="text-xs text-slate-400">
            Protects system from cascading failures
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
          {breakersLoading ? (
            <div className="col-span-4 p-8 flex items-center justify-center gap-2 text-slate-400">
              <Loader2 size={20} className="animate-spin" /> Loading circuit
              breakers...
            </div>
          ) : breakers.length === 0 ? (
            <div className="col-span-4 p-8 text-center text-slate-400 text-sm">
              No circuit breakers (check API connection)
            </div>
          ) : (
            <>
              {breakers.map((cb, idx) => (
                <div key={idx} className="p-6 relative group">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-slate-300 font-medium text-sm">
                      {cb.service}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        cb.state === "CLOSED"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : cb.state === "OPEN"
                            ? "bg-rose-500/20 text-rose-400"
                            : "bg-amber-500/20 text-amber-400"
                      }`}
                    >
                      {cb.state}
                    </span>
                  </div>
                  <div className="text-2xl font-mono text-white mb-1">
                    {cb.failureRate}%{" "}
                    <span className="text-xs text-slate-500">err</span>
                  </div>
                  {cb.state !== "CLOSED" && (
                    <div className="text-xs text-rose-400 mb-3 flex items-center gap-1">
                      <AlertTriangle size={10} /> Tripped at {cb.lastTripTime}
                    </div>
                  )}
                  <button
                    onClick={() =>
                      handleBreakerAction(
                        (cb as CircuitBreaker & { serviceKey?: string })
                          .serviceKey || cb.service,
                        cb.state,
                      )
                    }
                    className={`w-full mt-2 py-2 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      cb.state === "OPEN"
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                        : "bg-rose-900/50 hover:bg-rose-600 text-rose-200 hover:text-white"
                    }`}
                  >
                    {cb.state === "OPEN" ? (
                      <>
                        <RotateCcw size={12} /> RESET
                      </>
                    ) : (
                      <>
                        <ZapOff size={12} /> TRIP
                      </>
                    )}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Real-time Throughput Chart — fixed pixel height so Recharts never measures -1 on mobile */}
        <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
          <h3 className="mb-4 font-bold text-slate-800 sm:mb-6">
            Transaction Throughput (TPS)
          </h3>
          <div className="w-full" style={{ height: 320, minHeight: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={MOCK_JOB_STATS}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="postsPerSec"
                  name="Post Jobs/Sec"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="acceptsPerSec"
                  name="Accept Jobs/Sec"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Queue Health & Failures */}
        <div className="space-y-6">
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">
            <h3 className="mb-4 font-bold text-slate-800">
              Message Queue Depth
            </h3>
            <div className="w-full" style={{ height: 160, minHeight: 140 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_JOB_STATS}>
                  <defs>
                    <linearGradient id="colorQueue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="queueBacklog"
                    stroke="#f59e0b"
                    fill="url(#colorQueue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 p-3 bg-amber-50 rounded-lg text-xs text-amber-800 flex gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>
                Queue depth spiked at 10:02 AM. Auto-scaling workers triggered.
              </span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Live Transactions</h3>
            <div className="space-y-3">
              {MOCK_TRANSACTIONS.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        tx.status === "SUCCESS"
                          ? "bg-emerald-500"
                          : tx.status === "FAILED"
                            ? "bg-rose-500"
                            : "bg-blue-500 animate-pulse"
                      }`}
                    ></span>
                    <div>
                      <p className="font-medium text-slate-700">
                        {tx.type} {tx.jobId}
                      </p>
                      <p className="text-xs text-slate-400">
                        {tx.userId} • {tx.processingTimeMs}ms
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {tx.timestamp}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
