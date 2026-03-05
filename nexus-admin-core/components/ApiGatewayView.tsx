import React, { useState, useEffect, useMemo } from 'react';
import { Activity, Database, Server, Cloud, RefreshCw, Copy, Check, Search, AlertTriangle, History } from 'lucide-react';
import { getGatewayStatus, type GatewayStatusResponse } from '../services/adminApi';
import { getAdminToken } from '../services/adminApi';
import { firebaseConfig } from '../firebaseConfig';

const ADMIN_API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_ADMIN_API_URL) || 'http://localhost:3001';
const DOWNTIME_STORAGE_KEY = 'api_gateway_downtime';
const DOWNTIME_MAX = 20;

function loadDowntimeHistory(): number[] {
  try {
    const raw = localStorage.getItem(DOWNTIME_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-DOWNTIME_MAX) : [];
  } catch {
    return [];
  }
}

function saveDowntimeHistory(list: number[]) {
  try {
    localStorage.setItem(DOWNTIME_STORAGE_KEY, JSON.stringify(list.slice(-DOWNTIME_MAX)));
  } catch {}
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const ApiGatewayView: React.FC = () => {
  const [gateway, setGateway] = useState<GatewayStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<number | null>(null);
  const [endpointSearch, setEndpointSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [downtimeHistory, setDowntimeHistory] = useState<number[]>(() => loadDowntimeHistory());

  const fetchStatus = async () => {
    if (!getAdminToken()) {
      setError('กรุณา Login เพื่อดูค่าจริงจาก Backend');
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const data = await getGatewayStatus();
      setGateway(data);
      setLastFetchAt(Date.now());
    } catch (e: any) {
      setError(e?.message || 'โหลดสถานะไม่สำเร็จ');
      setGateway(null);
      const at = Date.now();
      setDowntimeHistory((prev) => {
        const next = [...prev, at].slice(-DOWNTIME_MAX);
        saveDowntimeHistory(next);
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 20000);
    return () => clearInterval(interval);
  }, []);

  const endpointRows = gateway?.endpoints ?? [];
  const filteredRows = useMemo(() => {
    if (!endpointSearch.trim()) return endpointRows;
    const q = endpointSearch.trim().toLowerCase();
    return endpointRows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)
    );
  }, [endpointRows, endpointSearch]);

  const summary = useMemo(() => {
    const ok = endpointRows.filter((e) => e.status === 'operational').length;
    const bad = endpointRows.filter((e) => e.status === 'degraded').length;
    return { operational: ok, degraded: bad };
  }, [endpointRows]);

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(`${ADMIN_API_BASE}${path}`).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    });
  };

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!lastFetchAt) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [lastFetchAt]);

  const lastUpdatedText = lastFetchAt
    ? (() => {
        const sec = Math.floor((Date.now() - lastFetchAt) / 1000);
        if (sec < 60) return `อัปเดตเมื่อ ${sec} วินาทีที่แล้ว`;
        const min = Math.floor(sec / 60);
        return `อัปเดตเมื่อ ${min} นาทีที่แล้ว`;
      })()
    : null;

  const hasDegraded = (gateway?.endpoints?.filter((e) => e.status === 'degraded').length ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* แจ้งเตือนเมื่อมี endpoint สถานะล้มเหลว/ลดลง */}
      {hasDegraded && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <AlertTriangle size={24} className="flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">มี {summary.degraded} endpoints สถานะลดลงหรือล้มเหลว</p>
            <p className="text-sm text-amber-700 mt-0.5">
              กรุณาตรวจสอบ PostgreSQL, Cloudinary หรือเครือข่าย — Endpoints ที่ขึ้นกับ DB หรือ Cloudinary อาจใช้การไม่ได้ชั่วคราว
            </p>
          </div>
        </div>
      )}

      {/* สรุปสถานะ + Backend URL + อัปเดตล่าสุด */}
      {gateway && (
        <div className="flex flex-wrap items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-600">สรุป Endpoints:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
              {summary.operational} ออนไลน์
            </span>
            {summary.degraded > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                {summary.degraded} ล้มเหลว/ลดลง
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-mono bg-white px-2 py-1 rounded border border-slate-200">{ADMIN_API_BASE}</span>
          </div>
          {lastUpdatedText && (
            <span className="text-xs text-slate-400">{lastUpdatedText}</span>
          )}
        </div>
      )}

      {/* Backend Realtime (จาก server.js) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-20 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-10 -mt-10" />
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-indigo-500/20 rounded-lg">
                <Server className="text-indigo-300" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-xl">Backend Realtime</h3>
                <p className="text-indigo-200 text-sm">ค่าจริงจาก Backend (Render / Node)</p>
              </div>
            </div>
            {gateway?.env?.render && (
              <div className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded text-xs font-bold border border-emerald-500/30">
                RENDER
              </div>
            )}
          </div>
          {loading && !gateway && (
            <div className="text-indigo-200 animate-pulse">กำลังโหลด...</div>
          )}
          {error && !gateway && (
            <div className="text-amber-300 text-sm">{error}</div>
          )}
          {gateway && (
            <>
              <div className="text-4xl font-bold mb-2">
                {formatUptime(gateway.uptime_seconds)} <span className="text-lg font-normal text-indigo-300">uptime</span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-indigo-200">
                <span>Heap: {gateway.memory.heapUsed_mb} / {gateway.memory.heapTotal_mb} MB</span>
                <span>•</span>
                <span>RSS: {gateway.memory.rss_mb} MB</span>
                <span>•</span>
                <span>{gateway.env.node_env}</span>
                {gateway.env.port && <span>• Port {gateway.env.port}</span>}
                {gateway.env.render_service && <span>• {gateway.env.render_service}</span>}
              </div>
              <p className="text-indigo-300/80 text-xs mt-2">{gateway.timestamp}</p>
            </>
          )}
        </div>

        {/* Services (PostgreSQL, Redis/Upstash, Cloudinary) — ค่าจริงจาก backend */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Database size={20} className="text-slate-600" />
            Services (ค่าจริงจาก Backend)
          </h3>
          {loading && !gateway && (
            <div className="text-slate-500 text-sm animate-pulse">กำลังโหลด...</div>
          )}
          {gateway?.services && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="font-medium text-slate-700">PostgreSQL</span>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  gateway.services.postgresql === 'healthy' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {gateway.services.postgresql}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div>
                  <span className="font-medium text-slate-700">Redis</span>
                  {gateway.env.redis_provider && (
                    <span className="ml-2 text-xs text-slate-500">({gateway.env.redis_provider})</span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  gateway.services.redis === 'healthy' ? 'bg-emerald-100 text-emerald-700' :
                  gateway.services.redis === 'not_configured' ? 'bg-slate-200 text-slate-600' : 'bg-rose-100 text-rose-700'
                }`}>
                  {gateway.services.redis}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                <div>
                  <span className="font-medium text-slate-700">Cloudinary</span>
                  {gateway.env.cloud_name && (
                    <span className="ml-2 text-xs text-slate-500">({gateway.env.cloud_name})</span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  gateway.services.cloudinary === 'healthy' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                }`}>
                  {gateway.services.cloudinary}
                </span>
              </div>
            </div>
          )}
          {error && !gateway && (
            <p className="text-sm text-rose-600">{error}</p>
          )}
        </div>
      </div>

      {/* Firebase Config (จาก firebaseConfig.ts) */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
          <Cloud size={18} className="text-slate-500" />
          <h3 className="font-bold text-slate-800">Firebase Config (จาก nexus-admin-core)</h3>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">projectId</span>
            <span className="font-mono text-sm text-slate-800">{firebaseConfig.projectId}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">authDomain</span>
            <span className="font-mono text-sm text-slate-800">{firebaseConfig.authDomain}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">storageBucket</span>
            <span className="font-mono text-sm text-slate-800">{firebaseConfig.storageBucket}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">apiKey</span>
            <span className="font-mono text-sm text-slate-800">{maskApiKey(firebaseConfig.apiKey)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">appId</span>
            <span className="font-mono text-sm text-slate-800">{firebaseConfig.appId}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-500">messagingSenderId</span>
            <span className="font-mono text-sm text-slate-800">{firebaseConfig.messagingSenderId}</span>
          </div>
        </div>
      </div>

      {/* ประวัติการเชื่อมต่อล้มเหลว (Downtime) — เก็บเมื่อดึง gateway-status ไม่ได้ */}
      {downtimeHistory.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <History size={18} className="text-slate-500" />
              ประวัติการเชื่อมต่อล้มเหลว
            </h3>
            <button
              type="button"
              onClick={() => {
                setDowntimeHistory([]);
                saveDowntimeHistory([]);
              }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              ล้างประวัติ
            </button>
          </div>
          <div className="p-4">
            <p className="text-sm text-slate-600 mb-3">
              ช่วงที่ดึงข้อมูลจาก Backend ไม่สำเร็จ (เก็บในเบราว์เซอร์ ล่าสุด {DOWNTIME_MAX} รายการ)
            </p>
            <ul className="space-y-2 max-h-40 overflow-y-auto">
              {[...downtimeHistory].reverse().map((ts, i) => (
                <li key={ts} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                  <span className="font-mono text-slate-600">
                    {new Date(ts).toLocaleString('th-TH')}
                  </span>
                  <span className="text-slate-400">
                    ({(() => {
                      const sec = Math.floor((Date.now() - ts) / 1000);
                      if (sec < 60) return `${sec} วินาทีที่แล้ว`;
                      const min = Math.floor(sec / 60);
                      if (min < 60) return `${min} นาทีที่แล้ว`;
                      const h = Math.floor(min / 60);
                      return `${h} ชม. ที่แล้ว`;
                    })()})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Critical API Endpoints — รายการจริงจาก Backend */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-800">API Endpoints (จาก Backend)</h3>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="ค้นหา endpoint หรือ path..."
                value={endpointSearch}
                onChange={(e) => setEndpointSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-sm w-56 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => { setLoading(true); fetchStatus(); }}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              รีเฟรช
            </button>
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Endpoint</th>
              <th className="px-6 py-3 font-semibold">Path</th>
              <th className="px-6 py-3 font-semibold">Method</th>
              <th className="px-6 py-3 font-semibold text-right">สถานะ</th>
              <th className="px-6 py-3 font-semibold w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && endpointRows.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">กำลังโหลด...</td></tr>
            )}
            {!loading && endpointRows.length === 0 && !gateway && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">ไม่มีข้อมูล (Login Backend เพื่อดึงค่าจริง)</td></tr>
            )}
            {!loading && gateway && filteredRows.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">ไม่พบ endpoint ที่ตรงกับ &quot;{endpointSearch}&quot;</td></tr>
            )}
            {filteredRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="px-6 py-4 font-medium text-slate-700">{row.name}</td>
                <td className="px-6 py-4 font-mono text-slate-600">{row.path}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    row.method === 'GET' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{row.method}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    row.status === 'operational'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    {row.status === 'operational' ? 'ออนไลน์' : 'ล้มเหลว/ลดลง'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => copyPath(row.path)}
                    className="p-1.5 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="คัดลอก URL เต็ม"
                  >
                    {copiedPath === row.path ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
