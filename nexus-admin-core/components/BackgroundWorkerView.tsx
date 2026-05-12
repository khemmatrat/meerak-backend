import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Layers, Clock, AlertCircle, RefreshCw, Loader2, CheckCircle, Settings2, X, Pause, Play, RotateCcw, BarChart3, Bell } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  getWorkerQueues,
  scaleWorkerQueue,
  verifyWorkerQueue,
  pauseWorkerQueue,
  resumeWorkerQueue,
  retryPaymentFailed,
  getWorkerQueueMetrics,
  getWorkerQueueAlerts,
  setWorkerQueueAlertThresholds,
  type WorkerQueueItem,
  type WorkerQueuesResponse,
} from '../services/adminApi';

export const BackgroundWorkerView: React.FC<{ setView?: (view: string) => void }> = ({ setView }) => {
  const [data, setData] = useState<WorkerQueuesResponse | null>(null);
  const [metrics, setMetrics] = useState<{ daily: Array<{ date: string; jobsCompleted: number; payoutsProcessed: number; paymentFailed: number }>; days: number } | null>(null);
  const [alerts, setAlerts] = useState<{ alerts: Array<{ queue: string; type: string; count?: number }>; thresholds: { congested: number; stalled: number } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scaling, setScaling] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [pausing, setPausing] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [scaleModal, setScaleModal] = useState<WorkerQueueItem | null>(null);
  const [scaleWorkers, setScaleWorkers] = useState(1);
  const [alertModal, setAlertModal] = useState(false);
  const [alertThresholds, setAlertThresholds] = useState({ congested: 50, stalled: 10 });

  const FALLBACK_QUEUES: WorkerQueueItem[] = [
    { name: 'jobs-open', displayName: 'Jobs (Match)', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'งาน Match รอผู้รับงาน' },
    { name: 'advance-jobs-open', displayName: 'Advance Jobs', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'งาน Advance รอผู้รับงาน' },
    { name: 'payment-failed', displayName: 'Payment Failed', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'ธุรกรรมชำระเงินล้มเหลว' },
    { name: 'payout-pending', displayName: 'Payout Requests', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'คำขอถอนเงินรออนุมัติ' },
    { name: 'insurance-claims-pending', displayName: 'Insurance Claims', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'เคลมประกันรอพิจารณา' },
    { name: 'support-tickets-open', displayName: 'Support Tickets', pendingJobs: 0, activeJobs: 0, completedPerMin: 0, failedRate: 0, status: 'OPERATIONAL', description: 'ตั๋วสนับสนุนรอดำเนินการ' },
  ];

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkerQueues();
      setData(res);
      setError((res as any)._timeout ? 'โหลดข้อมูลบางส่วน (backend ช้า) — กด Retry เพื่อลองใหม่' : null);
    } catch (e) {
      setData({ queues: FALLBACK_QUEUES, scaleConfig: {}, timestamp: new Date().toISOString() });
      const msg = e instanceof Error ? e.message : '';
      const isAbort = e instanceof Error && e.name === 'AbortError';
      setError(isAbort ? 'API timeout — Restart backend หรือตรวจสอบ network' : (msg || 'API 404 — Restart backend to enable worker-queues'));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await getWorkerQueueMetrics(7);
      setMetrics(res);
    } catch (_) {}
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await getWorkerQueueAlerts();
      setAlerts(res);
      setAlertThresholds(res.thresholds);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchQueues();
    fetchMetrics();
    fetchAlerts();
    const timer = setInterval(() => {
      fetchQueues();
      fetchAlerts();
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchQueues, fetchMetrics, fetchAlerts]);

  const handleScale = async () => {
    if (!scaleModal) return;
    setScaling(scaleModal.name);
    try {
      await scaleWorkerQueue(scaleModal.name, scaleWorkers);
      setScaleModal(null);
      fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to scale');
    } finally {
      setScaling(null);
    }
  };

  const handleVerify = async (queue: WorkerQueueItem) => {
    setVerifying(queue.name);
    setError(null);
    try {
      const res = await verifyWorkerQueue(queue.name);
      if (res.hint && setView) {
        if (res.hint.includes('Failed Transactions')) setView('job-ops');
        else if (res.hint.includes('User Payouts')) setView('user-payouts');
        else if (res.hint.includes('Insurance Claims')) setView('insurance-claims');
        else if (res.hint.includes('Support')) setView('support-center');
      }
      fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verify failed');
    } finally {
      setVerifying(null);
    }
  };

  const handlePauseResume = async (queue: WorkerQueueItem) => {
    const paused = data?.pausedState?.[queue.name];
    setPausing(queue.name);
    try {
      if (paused) await resumeWorkerQueue(queue.name);
      else await pauseWorkerQueue(queue.name);
      fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setPausing(null);
    }
  };

  const handleRetryFailed = async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await retryPaymentFailed({ limit: 10 });
      setError(null);
      if (res.added > 0) fetchQueues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(false);
    }
  };

  const handleSaveAlertThresholds = async () => {
    try {
      await setWorkerQueueAlertThresholds(alertThresholds);
      fetchAlerts();
      setAlertModal(false);
    } catch (_) {}
  };

  const queues = data?.queues ?? [];
  const scaleConfig = data?.scaleConfig ?? {};
  const pausedState = data?.pausedState ?? {};
  const alertList = data?.alerts ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Cpu size={20} className="text-indigo-600" />
            Worker Queues
          </h2>
          <p className="text-slate-500 text-sm">Monitor, scale, pause, retry, and alert on async workloads.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAlertModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200"
          >
            <Bell size={16} /> Alerts ({alertList.length})
          </button>
          <button
            onClick={() => { fetchQueues(); fetchMetrics(); fetchAlerts(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-700 disabled:opacity-70"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>
      </div>

      {alertList.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
            <AlertCircle size={16} /> Alerts
          </p>
          <ul className="text-sm text-amber-700 space-y-1">
            {alertList.map((a, i) => (
              <li key={i}>{a.message || `${a.queue}: ${a.type}`}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>
      )}

      {metrics && metrics.daily.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 size={18} /> Throughput (Last {metrics.days} days)
          </h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Area type="monotone" dataKey="jobsCompleted" stackId="1" stroke="#6366f1" fill="#6366f1" fillOpacity={0.6} name="Jobs Completed" />
                <Area type="monotone" dataKey="payoutsProcessed" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Payouts" />
                <Area type="monotone" dataKey="paymentFailed" stackId="3" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Failed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading && queues.length === 0 ? (
        <div className="p-12 flex items-center justify-center gap-2 text-slate-500">
          <Loader2 size={24} className="animate-spin" /> Loading worker queues...
        </div>
      ) : queues.length === 0 ? (
        <div className="p-12 flex flex-col items-center justify-center gap-4 text-slate-500">
          <Cpu size={48} className="text-slate-300" />
          <p className="text-sm font-medium">No queue data</p>
          <button onClick={fetchQueues} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {queues.map((queue) => {
            const isPaused = pausedState[queue.name];
            return (
              <div
                key={queue.name}
                className={`bg-white rounded-xl border p-6 shadow-sm relative overflow-hidden ${
                  queue.status === 'CONGESTED' ? 'border-amber-200' : queue.status === 'STALLED' ? 'border-rose-200' : 'border-slate-200'
                } ${isPaused ? 'opacity-75' : ''}`}
              >
                {isPaused && (
                  <div className="absolute top-0 right-0 p-1.5 bg-slate-600 text-white text-[10px] font-bold rounded-bl-lg z-10">PAUSED</div>
                )}
                {queue.status === 'CONGESTED' && !isPaused && (
                  <div className="absolute top-0 right-0 p-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-bl-lg z-10">High Load</div>
                )}
                {queue.status === 'STALLED' && !isPaused && (
                  <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-bl-lg z-10">STALLED</div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                    <Layers size={20} />
                  </div>
                  <h3 className="font-bold text-slate-800">{queue.displayName}</h3>
                  {queue.isBull && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded">Bull</span>}
                </div>

                <p className="text-xs text-slate-500 mb-4">{queue.description}</p>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm text-slate-600 mb-1">
                      <span>Pending</span>
                      <span className="font-mono font-bold">{queue.pendingJobs.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          queue.pendingJobs > 50 ? 'bg-amber-500' : queue.pendingJobs > 10 ? 'bg-indigo-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min((queue.pendingJobs / 100) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> Active</p>
                      <p className="text-lg font-bold text-slate-800">{queue.activeJobs}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 flex items-center gap-1"><AlertCircle size={12} /> Failed</p>
                      <p className={`text-lg font-bold ${queue.failedRate > 1 ? 'text-rose-600' : 'text-emerald-600'}`}>{queue.failedRate}%</p>
                    </div>
                  </div>

                  {scaleConfig[queue.name] != null && (
                    <p className="text-xs text-slate-500">Scale: {scaleConfig[queue.name]} workers</p>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => { setScaleModal(queue); setScaleWorkers(scaleConfig[queue.name] || 1); }}
                      disabled={scaling !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 disabled:opacity-50"
                    >
                      <Settings2 size={12} /> Scale
                    </button>
                    <button
                      onClick={() => handlePauseResume(queue)}
                      disabled={pausing !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                    >
                      {pausing === queue.name ? <Loader2 size={12} className="animate-spin" /> : isPaused ? <Play size={12} /> : <Pause size={12} />}{' '}
                      {isPaused ? 'Resume' : 'Pause'}
                    </button>
                    {queue.name === 'payment-failed' && queue.pendingJobs > 0 && (
                      <button
                        onClick={handleRetryFailed}
                        disabled={retrying}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {retrying ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Retry
                      </button>
                    )}
                    <button
                      onClick={() => handleVerify(queue)}
                      disabled={verifying !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50"
                    >
                      {verifying === queue.name ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Verify
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scaleModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Scale: {scaleModal.displayName}</h3>
              <button onClick={() => setScaleModal(null)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desired Workers (1–10)</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={scaleWorkers}
                  onChange={(e) => setScaleWorkers(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button onClick={handleScale} disabled={scaling !== null} className="w-full py-2.5 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50">
                {scaling ? <Loader2 size={18} className="animate-spin inline" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Alert Thresholds</h3>
              <button onClick={() => setAlertModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">CONGESTED (pending ≥)</label>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={alertThresholds.congested}
                  onChange={(e) => setAlertThresholds((t) => ({ ...t, congested: parseInt(e.target.value, 10) || 50 }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">STALLED (failed ≥)</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={alertThresholds.stalled}
                  onChange={(e) => setAlertThresholds((t) => ({ ...t, stalled: parseInt(e.target.value, 10) || 10 }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button onClick={handleSaveAlertThresholds} className="w-full py-2.5 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
