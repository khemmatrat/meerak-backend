import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Network, Server, Database, Globe, AlertOctagon, RefreshCw, Loader2, History, Pause, Play, Trash2, ExternalLink } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getClusterHealth, getAdminToken, pauseJobs, resumeJobs, clearJobsCache } from '../services/adminApi';
import type { ClusterHealthResponse, ClusterHealthNode } from '../services/adminApi';
import { MOCK_CLUSTER_NODES } from '../constants';

const CLUSTER_HISTORY_KEY = 'cluster_health_history';
const CLUSTER_HISTORY_MAX = 100;
const AUTO_REFRESH_MS = 45000; // 45 seconds

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

interface HistoryPoint {
  timestamp: string;
  time: string;
  healthyNodes: number;
  totalNodes: number;
  healthyPct: number;
  uptime_seconds: number;
  memoryPercent: number;
  activeUsers: number;
}

function loadHistory(): HistoryPoint[] {
  try {
    const raw = localStorage.getItem(CLUSTER_HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-CLUSTER_HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryPoint[]) {
  try {
    localStorage.setItem(CLUSTER_HISTORY_KEY, JSON.stringify(history.slice(-CLUSTER_HISTORY_MAX)));
  } catch {}
}

export const ClusterHealthView: React.FC = () => {
  const [data, setData] = useState<ClusterHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>(loadHistory);
  const [criticalAlertDismissed, setCriticalAlertDismissed] = useState(false);
  const [browserNotificationShown, setBrowserNotificationShown] = useState(false);
  const [jobsActionLoading, setJobsActionLoading] = useState(false);
  const useBackend = !!getAdminToken();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!useBackend) {
      setData({
        timestamp: new Date().toISOString(),
        activeUsers: 1024592,
        activeWorkerNodes: '12 / 12',
        healthyNodes: 10,
        totalNodes: 12,
        dbConnections: 25,
        dbReplicationLagMs: 15,
        services: { postgresql: 'healthy', redis: 'healthy', cloudinary: 'healthy' },
        memory: { heapUsed_mb: 120, heapTotal_mb: 180, rss_mb: 200, usagePercent: 67 },
        uptime_seconds: 86400,
        nodes: MOCK_CLUSTER_NODES,
        env: { node_env: 'development', region: 'Asia-SE1', render: false },
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getClusterHealth();
      setData(res);

      // Append to history
      if (res) {
        const total = res.totalNodes || 1;
        const point: HistoryPoint = {
          timestamp: res.timestamp,
          time: new Date(res.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          healthyNodes: res.healthyNodes,
          totalNodes: total,
          healthyPct: Math.round((res.healthyNodes / total) * 100),
          uptime_seconds: res.uptime_seconds,
          memoryPercent: res.memory?.usagePercent ?? 0,
          activeUsers: res.activeUsers ?? 0,
        };
        setHistory((prev) => {
          const next = [...prev, point].slice(-CLUSTER_HISTORY_MAX);
          saveHistory(next);
          return next;
        });
      }
    } catch (e) {
      setError((e as Error).message || 'Failed to load cluster health');
      setData({
        timestamp: new Date().toISOString(),
        activeUsers: 0,
        activeWorkerNodes: '0 / 4',
        healthyNodes: 0,
        totalNodes: 4,
        dbConnections: 0,
        dbReplicationLagMs: null,
        services: { postgresql: 'unhealthy', redis: 'unhealthy', cloudinary: 'unhealthy' },
        memory: { heapUsed_mb: 0, heapTotal_mb: 0, rss_mb: 0, usagePercent: 0 },
        uptime_seconds: 0,
        nodes: [],
        env: { node_env: 'unknown', region: null, render: false },
      });
    } finally {
      setLoading(false);
    }
  }, [useBackend]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Auto-refresh every 45 seconds
  useEffect(() => {
    if (!useBackend) return;
    intervalRef.current = setInterval(fetchHealth, AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [useBackend, fetchHealth]);

  // Critical alert: show banner + browser notification (once per session)
  const criticalNodes = data?.nodes?.filter((n) => n.status === 'Critical') ?? [];
  const hasCritical = criticalNodes.length > 0;

  useEffect(() => {
    if (!hasCritical || !useBackend) return;
    setCriticalAlertDismissed(false);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && !browserNotificationShown) {
      try {
        new Notification('Cluster Health Alert', {
          body: `${criticalNodes.map((n) => n.service || n.id).join(', ')} — Critical`,
          icon: '/favicon.ico',
        });
        setBrowserNotificationShown(true);
      } catch {}
    }
  }, [hasCritical, criticalNodes, useBackend, browserNotificationShown]);

  const nodes: ClusterHealthNode[] = data?.nodes ?? [];
  const capacityPct = data?.activeUsers ? Math.min(100, Math.round((data.activeUsers / 1200000) * 100)) : 85;
  const jobsPaused = data?.jobsPaused ?? false;

  const handlePauseJobs = async () => {
    if (!useBackend || jobsActionLoading) return;
    setJobsActionLoading(true);
    try {
      await pauseJobs();
      fetchHealth();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setJobsActionLoading(false);
    }
  };

  const handleResumeJobs = async () => {
    if (!useBackend || jobsActionLoading) return;
    setJobsActionLoading(true);
    try {
      await resumeJobs();
      fetchHealth();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setJobsActionLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!useBackend || jobsActionLoading) return;
    if (!confirm('เคลียร์ Rate Limit Cache? (ผู้ใช้ที่โดน rate limit จะ reset)')) return;
    setJobsActionLoading(true);
    try {
      const res = await clearJobsCache();
      alert(res.message);
      fetchHealth();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setJobsActionLoading(false);
    }
  };

  const cloudName = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_CLOUDINARY_CLOUD_NAME) || '';
  const cloudinaryConsoleUrl = cloudName
    ? `https://console.cloudinary.com/console/c-${cloudName}/media_library`
    : 'https://console.cloudinary.com/';

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 rounded-lg text-sm">
          {error} — แสดงข้อมูล fallback
        </div>
      )}

      {/* Critical Alert */}
      {hasCritical && !criticalAlertDismissed && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 flex items-start gap-3">
          <AlertOctagon className="text-rose-600 shrink-0 mt-0.5" size={24} />
          <div className="flex-1">
            <h4 className="font-bold text-rose-800">แจ้งเตือน: บริการ Critical</h4>
            <p className="text-sm text-rose-700 mt-1">
              {criticalNodes.map((n) => `${n.service || n.id}`).join(', ')}
            </p>
            <p className="text-xs text-rose-600 mt-2">กรุณาตรวจสอบและแก้ไขโดยเร็ว</p>
          </div>
          <button
            onClick={() => setCriticalAlertDismissed(true)}
            className="text-rose-600 hover:text-rose-800 text-sm font-medium"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Manage Jobs Dashboard */}
      {useBackend && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <History size={20} className="text-slate-500" />
            Dashboard ควบคุมจ็อบ
          </h3>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${jobsPaused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                {jobsPaused ? '⏸ Paused' : '▶ Running'}
              </span>
              {data?.cronLastRunAt && (
                <span className="text-xs text-slate-500">ล่าสุด: {new Date(data.cronLastRunAt).toLocaleString('th-TH')}</span>
              )}
              {data?.cronLastError && (
                <span className="text-xs text-rose-600">{data.cronLastError}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePauseJobs}
                disabled={jobsActionLoading || jobsPaused}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-800 rounded-lg text-sm font-medium hover:bg-amber-200 disabled:opacity-50"
              >
                <Pause size={16} /> Pause Jobs
              </button>
              <button
                onClick={handleResumeJobs}
                disabled={jobsActionLoading || !jobsPaused}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-sm font-medium hover:bg-emerald-200 disabled:opacity-50"
              >
                <Play size={16} /> Resume Jobs
              </button>
              <button
                onClick={handleClearCache}
                disabled={jobsActionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
              >
                <Trash2 size={16} /> Clear Cache
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Memory ≥85% จะหยุดจ็อบอัตโนมัติ • Cron รันแบบ Sequential (ทำเสร็จก่อนค่อยเริ่มรอบถัดไป)
          </p>
        </div>
      )}

      {/* Quick Links */}
      {useBackend && (
        <div className="flex flex-wrap gap-3">
          <a
            href="https://console.cloudinary.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-medium hover:bg-indigo-200"
          >
            <ExternalLink size={16} /> Check Cloudinary Status
          </a>
          <a
            href={cloudinaryConsoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200"
          >
            <ExternalLink size={16} /> Cloudinary Console (Usage)
          </a>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500">Auto-refresh ทุก {AUTO_REFRESH_MS / 1000} วินาที</span>
          {typeof Notification !== 'undefined' && (
            <button
              onClick={() => Notification.requestPermission()}
              className="text-xs text-indigo-600 hover:text-indigo-800"
            >
              {Notification.permission === 'granted' ? '✓ แจ้งเตือนเปิดแล้ว' : 'เปิดแจ้งเตือน Critical'}
            </button>
          )}
        </div>
        {useBackend && (
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Refresh
          </button>
        )}
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-indigo-500/20 rounded-lg">
              <Globe className="text-indigo-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Active Users</p>
              <h3 className="text-2xl font-bold">{data?.activeUsers?.toLocaleString() ?? '—'}</h3>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-full" style={{ width: `${capacityPct}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {capacityPct}% of capacity • {data?.env?.region || 'Asia-SE1'}
          </p>
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Server className="text-emerald-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">Healthy Services</p>
              <h3 className="text-2xl font-bold">{data?.activeWorkerNodes ?? '—'}</h3>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <span className={`px-2 py-1 text-xs rounded border ${
              (data?.healthyNodes ?? 0) === (data?.totalNodes ?? 0)
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
            }`}>
              {(data?.healthyNodes ?? 0) === (data?.totalNodes ?? 0) ? 'All Healthy' : 'Degraded'}
            </span>
            <span className="px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded">
              Uptime: {data ? formatUptime(data.uptime_seconds) : '—'}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <Database className="text-amber-400" size={24} />
            </div>
            <div>
              <p className="text-slate-400 text-sm">DB Connections</p>
              <h3 className="text-2xl font-bold">{data?.dbConnections ?? '—'}</h3>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-amber-400">
            {data?.dbReplicationLagMs != null ? (
              <>
                <AlertOctagon size={12} />
                <span>Replication Lag: {Math.round(data.dbReplicationLagMs)}ms</span>
              </>
            ) : (
              <span className="text-slate-500">Single instance</span>
            )}
          </div>
        </div>
      </div>

      {/* History Trend */}
      {history.length >= 2 && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <History size={20} className="text-slate-500" />
            Health Trend (ประวัติ {history.length} จุด)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip formatter={(v: number) => [v, '']} />
                <Legend />
                <Line type="monotone" dataKey="memoryPercent" name="Memory %" stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="healthyNodes" name="Healthy Nodes" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Node Grid */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Network size={20} className="text-slate-500" />
            Cluster Nodes (API Server / PostgreSQL / Redis / Cloudinary)
            {data?.env?.cpu_source && (
              <span className="text-xs font-normal text-slate-500">
                CPU: {data.env.cpu_source === 'os.loadavg' ? 'os.loadavg' : 'memory proxy'}
              </span>
            )}
          </h3>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-emerald-500 rounded-full"></span> Healthy</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-amber-500 rounded-full"></span> High Load</div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 bg-rose-500 rounded-full"></span> Critical</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`p-4 rounded-xl border transition-all hover:shadow-md cursor-pointer ${
                node.status === 'Healthy' ? 'bg-white border-slate-200' :
                node.status === 'High Load' ? 'bg-amber-50 border-amber-200' :
                'bg-rose-50 border-rose-200'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <Server size={18} className={
                  node.status === 'Healthy' ? 'text-slate-400' :
                  node.status === 'High Load' ? 'text-amber-500' : 'text-rose-500'
                } />
                <div className={`w-2 h-2 rounded-full ${
                  node.status === 'Healthy' ? 'bg-emerald-500' :
                  node.status === 'High Load' ? 'bg-amber-500' : 'bg-rose-500'
                }`}></div>
              </div>
              <p className="font-mono text-xs font-bold text-slate-700 truncate" title={node.id}>
                {node.service || node.id}
              </p>

              <div className="mt-3 space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>CPU</span>
                  <span>{node.cpuUsage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1">
                  <div
                    className={`h-1 rounded-full ${node.cpuUsage > 80 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(100, node.cpuUsage)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between text-[10px] text-slate-500 pt-1">
                  <span>MEM</span>
                  <span>{node.memoryUsage}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1">
                  <div
                    className="bg-cyan-500 h-1 rounded-full"
                    style={{ width: `${Math.min(100, node.memoryUsage)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}

          {nodes.length === 0 && !loading && (
            <div className="col-span-full flex items-center justify-center py-12 text-slate-500">
              ไม่มีข้อมูล nodes — กรุณา Login เพื่อดูค่าจริงจาก Backend
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
