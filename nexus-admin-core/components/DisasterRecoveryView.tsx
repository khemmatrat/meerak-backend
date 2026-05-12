
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Globe,
  Database,
  RefreshCw,
  AlertTriangle,
  Play,
  HardDrive,
  CheckCircle,
  XCircle,
  Zap,
  Activity,
  Lock,
} from 'lucide-react';
import { getDRStats, logDRView, simulateDRFailover, activateDRFailover, DRStatusResponse } from '../services/adminApi';

const FAILOVER_CONFIRM_TEXT = 'FAILOVER-CONFIRM';
const POLL_INTERVAL_MS = 20000;

export const DisasterRecoveryView: React.FC = () => {
  const [drStatus, setDrStatus] = useState<DRStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFailingOver, setIsFailingOver] = useState(false);
  const [failoverStage, setFailoverStage] = useState(0);
  const [showFailoverModal, setShowFailoverModal] = useState(false);
  const [masterPin, setMasterPin] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [failoverError, setFailoverError] = useState<string | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillResult, setDrillResult] = useState<{
    standbyReachable: boolean;
    ledgerChainAccessible: boolean;
    taxDocumentsAccessible: boolean;
  } | null>(null);
  const [safetySwitchChecked, setSafetySwitchChecked] = useState(false);
  const logViewSent = useRef(false);

  const fetchStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getDRStats();
      setDrStatus(res);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Failed to load DR status');
      setDrStatus(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!logViewSent.current) {
      logViewSent.current = true;
      logDRView().catch(() => {});
    }
    fetchStatus();
    const t = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const handleSimulateFailover = async () => {
    setDrillLoading(true);
    setDrillResult(null);
    try {
      const res = await simulateDRFailover();
      setDrillResult(res.results);
    } catch (e: unknown) {
      setDrillResult({
        standbyReachable: false,
        ledgerChainAccessible: false,
        taxDocumentsAccessible: false,
      });
    } finally {
      setDrillLoading(false);
    }
  };

  const handleOpenFailoverModal = () => {
    setShowFailoverModal(true);
    setMasterPin('');
    setConfirmText('');
    setFailoverError(null);
  };

  const handleActivateFailover = async () => {
    if (!masterPin.trim()) {
      setFailoverError('กรุณาใส่ Master PIN');
      return;
    }
    if (confirmText !== FAILOVER_CONFIRM_TEXT) {
      setFailoverError(`กรุณาพิมพ์ "${FAILOVER_CONFIRM_TEXT}" เพื่อยืนยัน`);
      return;
    }
    setIsFailingOver(true);
    setFailoverError(null);
    try {
      await activateDRFailover(masterPin.trim(), confirmText);
      setShowFailoverModal(false);
      setFailoverStage(1);
      setTimeout(() => setFailoverStage(2), 8000);
      setTimeout(() => setFailoverStage(3), 20000);
      setTimeout(() => {
        setIsFailingOver(false);
        setFailoverStage(0);
        fetchStatus();
      }, 45000);
    } catch (e: unknown) {
      setFailoverError((e as Error)?.message || 'Failover request failed');
    } finally {
      setIsFailingOver(false);
    }
  };

  const data = drStatus;
  const preFlight = data?.preFlight;
  const allPreFlightOk = preFlight?.resourcePrep && preFlight?.dnsReadiness && preFlight?.masterPinConfigured;

  if (loading && !data) {
    return (
      <div className="space-y-8">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <ShieldAlert size={28} className="text-indigo-600" />
          Disaster Recovery Center
        </h2>
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw size={24} className="animate-spin mr-2" />
          Loading DR status...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* DR Header Status */}
      <div
        className={`p-8 rounded-2xl shadow-lg border text-white flex justify-between items-center ${
          data?.activeRegion === 'Primary'
            ? 'bg-gradient-to-r from-slate-900 to-indigo-900 border-indigo-900'
            : 'bg-gradient-to-r from-rose-900 to-slate-900 border-rose-900'
        }`}
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert
              size={32}
              className={data?.activeRegion === 'Primary' ? 'text-emerald-400' : 'text-rose-400 animate-pulse'}
            />
            <h2 className="text-2xl font-bold">Disaster Recovery Center</h2>
            <button
              onClick={fetchStatus}
              disabled={loading}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          {error && (
            <p className="text-rose-300 text-sm mb-2">{error}</p>
          )}
          <p className="text-indigo-200">
            Current Active Region:{' '}
            <span className="font-mono font-bold text-white">
              {data?.activeRegion === 'Primary' ? data?.primaryRegion : data?.drRegion}
            </span>
          </p>
          <div className="flex items-center gap-4 mt-4 text-sm flex-wrap">
            <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
              <RefreshCw
                size={14}
                className={
                  data?.syncStatus === 'Synced' ? 'text-emerald-400' : data?.syncStatus === 'Lagging' ? 'text-amber-400' : 'text-rose-400'
                }
              />
              <span>
                {data?.replicationLagSeconds != null && data.replicationLagSeconds < 1
                  ? `${(data.replicationLagSeconds * 1000).toFixed(0)}ms Lag`
                  : data?.replicationLagSeconds != null
                    ? `${data.replicationLagSeconds.toFixed(2)}s Lag`
                    : `Data Sync: ${data?.syncStatus}`}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
              <Database size={14} className="text-blue-400" />
              <span>RPO: {data?.rpoSeconds ?? '—'}s</span>
            </div>
            {data?.replicationLagMs != null && (
              <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
                <Activity size={14} className="text-cyan-400" />
                <span>{data.replicationLagMs}ms</span>
              </div>
            )}
            {data?.syncThroughputMbps != null && data.syncThroughputMbps > 0 && (
              <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
                <Zap size={14} className="text-yellow-400" />
                <span>~{data.syncThroughputMbps} Mbps</span>
              </div>
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Estimated Recovery Time</p>
          <p className="text-3xl font-bold font-mono">~{data?.estimatedRecoveryMinutes ?? 45} Mins</p>
          <p className="text-xs text-emerald-400 mt-1">Within SLA (Target &lt; 8 Hours)</p>
        </div>
      </div>

      {/* Sync Health Bar (ท่อส่งข้อมูล) */}
      {data?.replicationLagSeconds != null && (
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Zap size={18} className="text-amber-500" />
            Replication Pipeline (Bangkok → Singapore)
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-500">Sync Health</span>
                <span
                  className={
                    data.replicationLagSeconds <= 30
                      ? 'text-emerald-600'
                      : data.replicationLagSeconds <= 120
                        ? 'text-amber-600'
                        : 'text-rose-600'
                  }
                >
                  {data.replicationLagSeconds <= 30 ? 'Healthy' : data.replicationLagSeconds <= 120 ? 'Lagging' : 'Degraded'}
                </span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    data.replicationLagSeconds <= 30 ? 'bg-emerald-500' : data.replicationLagSeconds <= 120 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, 100 - data.replicationLagSeconds))}%`,
                  }}
                />
              </div>
            </div>
            <div className="text-sm font-mono text-slate-600">
              Lag: <strong>{data.replicationLagSeconds.toFixed(1)}s</strong>
            </div>
          </div>
        </div>
      )}

      {/* Region Map: Bangkok ↔ Singapore with animated data flow */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
        <div className="hidden lg:flex absolute top-1/2 left-0 right-0 -translate-y-1/2 z-10 items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-4">
            <div className="w-32 h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500/80 transition-all"
                style={{
                  width: data?.syncThroughputMbps && data.syncThroughputMbps > 0 ? `${Math.min(100, data.syncThroughputMbps * 10)}%` : '50%',
                }}
              />
            </div>
            <div className="flex items-center gap-1 text-slate-500">
              <div
                className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"
                style={{ animationDuration: data?.replicationLagSeconds != null && data.replicationLagSeconds < 1 ? '0.5s' : '2s' }}
              />
              <span className="text-[10px] uppercase">Data flow</span>
            </div>
            <div className="w-32 h-1 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full w-1/2 bg-indigo-400 rounded-full animate-pulse" />
            </div>
          </div>
        </div>

        {/* Primary Region */}
        <div
          className={`bg-white p-6 rounded-xl border-2 transition-all ${
            data?.activeRegion === 'Primary' ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-slate-200 opacity-60'
          }`}
        >
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-lg ${
                  data?.activeRegion === 'Primary' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Globe size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Primary Region</h3>
                <p className="text-sm text-slate-500">{data?.primaryRegion}</p>
              </div>
            </div>
            {data?.activeRegion === 'Primary' && (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">ACTIVE</span>
            )}
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Status</span>
              <span className="text-emerald-600 font-medium">Operational</span>
            </div>
          </div>
        </div>

        {/* DR Region */}
        <div
          className={`bg-white p-6 rounded-xl border-2 transition-all ${
            data?.activeRegion === 'DR' ? 'border-rose-500 shadow-lg shadow-rose-500/10' : 'border-slate-200'
          }`}
        >
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-lg ${
                  data?.activeRegion === 'DR' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">DR Region (Standby)</h3>
                <p className="text-sm text-slate-500">{data?.drRegion}</p>
              </div>
            </div>
            {data?.activeRegion === 'DR' && (
              <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">ACTIVE</span>
            )}
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Replication</span>
              <span className="text-indigo-600 font-medium">{data?.syncStatus}</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Standby API</span>
              <span className={data?.standbyHealthy ? 'text-emerald-600 font-medium' : 'text-rose-600 font-medium'}>
                {data?.standbyHealthy ? `OK (${data?.standbyLatencyMs ?? '—'}ms)` : 'Unreachable'}
              </span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Storage Sync</span>
              <span className={data?.storageSyncOk ? 'text-emerald-600 font-medium' : 'text-slate-500'}>
                {data?.storageSyncOk ? `OK (${data?.storageFileCount} files)` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pre-Flight Checklist */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-amber-50 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          <h3 className="font-bold text-slate-800">Pre-Flight Checklist (ก่อนกด ACTIVATE FAILOVER)</h3>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            {preFlight?.resourcePrep ? (
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-slate-800">Step 1: Resource Prep</p>
              <p className="text-xs text-slate-500">{preFlight?.resourcePrepNote ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            {preFlight?.dnsReadiness ? (
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-slate-800">Step 2: DNS Readiness</p>
              <p className="text-xs text-slate-500">TTL: {preFlight?.dnsTtlSeconds ?? 300}s • {preFlight?.dnsNote ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            {preFlight?.masterPinConfigured ? (
              <CheckCircle size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <XCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-slate-800">Step 3: Verification</p>
              <p className="text-xs text-slate-500">
                {preFlight?.masterPinConfigured ? 'Master PIN configured' : 'DR_MASTER_PIN not set'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Failover Progress Bar (เมื่อกำลัง failover) */}
      {isFailingOver && failoverStage > 0 && (
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Failover Progress</h3>
          <div className="space-y-4">
            {[
              { id: 1, name: 'DNS Update', est: 5 },
              { id: 2, name: 'DB Promotion', est: 15 },
              { id: 3, name: 'App Relaunch', est: 25 },
            ].map((s) => (
              <div key={s.id} className="flex items-center gap-4">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    failoverStage >= s.id ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {failoverStage > s.id ? <CheckCircle size={16} /> : s.id}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{s.name}</p>
                  <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: failoverStage >= s.id ? '100%' : '0%' }}
                    />
                  </div>
                </div>
                <span className="text-xs text-slate-500">~{s.est} min</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Backup & Drill Mode */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <HardDrive size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-800">Backup & Drill Mode</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1">
                <p className="text-sm text-slate-500">Last Successful Backup</p>
                <p className="font-bold text-slate-800 text-lg">{data?.lastBackup ?? '—'}</p>
                {data?.backupSource && data.backupSource !== 'none' && (
                  <p className="text-xs text-slate-400 mt-1">Source: {data.backupSource}</p>
                )}
              </div>
            </div>
            <div className="border-t border-slate-100 pt-6">
              <p className="text-sm font-medium text-slate-700 mb-2">Simulate Failover (Drill Mode)</p>
              <p className="text-xs text-slate-500 mb-4">
                ทดสอบ Read-Only traffic ไป Singapore โดยไม่กระทบ Write ใน Bangkok — ตรวจสอบ Ledger Chain และ Tax Docs
              </p>
              <button
                onClick={handleSimulateFailover}
                disabled={drillLoading}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {drillLoading ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
                {drillLoading ? 'Testing...' : 'Simulate Failover'}
              </button>
              {drillResult && (
                <div className="mt-4 p-4 bg-slate-50 rounded-lg text-sm space-y-2">
                  <p className="font-medium text-slate-700">Drill Results:</p>
                  <div className="flex gap-4">
                    <span className={drillResult.standbyReachable ? 'text-emerald-600' : 'text-rose-600'}>
                      Standby: {drillResult.standbyReachable ? 'OK' : 'Fail'}
                    </span>
                    <span className={drillResult.ledgerChainAccessible ? 'text-emerald-600' : 'text-rose-600'}>
                      Ledger: {drillResult.ledgerChainAccessible ? 'OK' : 'Fail'}
                    </span>
                    <span className={drillResult.taxDocumentsAccessible ? 'text-emerald-600' : 'text-rose-600'}>
                      Tax Docs: {drillResult.taxDocumentsAccessible ? 'OK' : 'Fail'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Emergency Zone */}
        <div className="bg-rose-50 rounded-xl border border-rose-100 overflow-hidden">
          <div className="p-4 border-b border-rose-200 bg-rose-100 flex items-center gap-2 text-rose-800">
            <AlertTriangle size={18} />
            <h3 className="font-bold">Emergency Failover Control</h3>
          </div>
          <div className="p-6 flex flex-col justify-center">
            <p className="text-sm text-rose-700 mb-4 leading-relaxed">
              <strong>Warning:</strong> Initiating failover will redirect all traffic to DR. Active sessions may drop. Use only when Primary is unreachable.
            </p>
            <label className="flex items-start gap-3 mb-4 cursor-pointer group">
              <input
                type="checkbox"
                checked={safetySwitchChecked}
                onChange={(e) => setSafetySwitchChecked(e.target.checked)}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
              />
              <span className="text-sm text-slate-700 group-hover:text-slate-900">
                I understand the consequences. Failover will redirect all traffic to Singapore and may cause service interruption.
              </span>
            </label>
            {!allPreFlightOk && (
              <p className="text-amber-700 text-sm mb-4 flex items-center gap-2">
                <AlertTriangle size={16} />
                Pre-Flight checklist incomplete. Resolve before failover.
              </p>
            )}
            {allPreFlightOk && !safetySwitchChecked && (
              <p className="text-slate-500 text-sm mb-4 flex items-center gap-2">
                <Lock size={16} />
                Check the safety switch above to unlock.
              </p>
            )}
            <button
              onClick={handleOpenFailoverModal}
              disabled={isFailingOver || !allPreFlightOk || !safetySwitchChecked}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 ${
                isFailingOver || !allPreFlightOk || !safetySwitchChecked
                  ? 'bg-slate-400 cursor-not-allowed text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white hover:shadow-rose-900/20'
              }`}
            >
              {isFailingOver ? (
                <>
                  <RefreshCw className="animate-spin" />
                  INITIATING FAILOVER...
                </>
              ) : (
                <>
                  <Play size={24} fill="currentColor" />
                  ACTIVATE FAILOVER
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Failover Modal (Double Confirmation + Master PIN) */}
      {showFailoverModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-rose-700 mb-4 flex items-center gap-2">
              <AlertTriangle size={24} />
              Confirm Failover
            </h3>
            <p className="text-slate-600 text-sm mb-6">
              กรุณาใส่ Master PIN และพิมพ์ <code className="bg-slate-100 px-1 rounded">{FAILOVER_CONFIRM_TEXT}</code> เพื่อยืนยัน
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Master PIN</label>
                <input
                  type="password"
                  value={masterPin}
                  onChange={(e) => setMasterPin(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirmation Text</label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={FAILOVER_CONFIRM_TEXT}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-mono"
                />
              </div>
            </div>
            {failoverError && (
              <p className="mt-4 text-rose-600 text-sm">{failoverError}</p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowFailoverModal(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleActivateFailover}
                disabled={isFailingOver}
                className="flex-1 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50"
              >
                {isFailingOver ? 'Processing...' : 'Confirm Failover'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
