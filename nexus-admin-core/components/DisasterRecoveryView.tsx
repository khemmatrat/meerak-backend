
import React, { useState } from 'react';
import { ShieldAlert, Globe, Database, RefreshCw, AlertTriangle, Play, HardDrive, CheckCircle } from 'lucide-react';
import { MOCK_DR_STATUS } from '../constants';
import { DRStatus } from '../types';

export const DisasterRecoveryView: React.FC = () => {
  const [drStatus, setDrStatus] = useState<DRStatus>(MOCK_DR_STATUS);
  const [isFailingOver, setIsFailingOver] = useState(false);

  const handleFailover = () => {
    const confirmText = "FAILOVER-CONFIRM";
    const input = prompt(`DANGER ZONE: You are about to switch the active region to ${drStatus.drRegion}. This is a major operation.\n\nPlease type "${confirmText}" to confirm.`);
    
    if (input === confirmText) {
      setIsFailingOver(true);
      setTimeout(() => {
        setDrStatus(prev => ({
          ...prev,
          activeRegion: 'DR',
          syncStatus: 'Lagging'
        }));
        setIsFailingOver(false);
        alert('System Failover Initiated. Traffic is rerouting to DR Region.');
      }, 5000);
    }
  };

  return (
    <div className="space-y-8">
      
      {/* DR Header Status */}
      <div className={`p-8 rounded-2xl shadow-lg border text-white flex justify-between items-center ${
        drStatus.activeRegion === 'Primary' 
          ? 'bg-gradient-to-r from-slate-900 to-indigo-900 border-indigo-900' 
          : 'bg-gradient-to-r from-rose-900 to-slate-900 border-rose-900'
      }`}>
        <div>
          <div className="flex items-center gap-3 mb-2">
            <ShieldAlert size={32} className={drStatus.activeRegion === 'Primary' ? 'text-emerald-400' : 'text-rose-400 animate-pulse'} />
            <h2 className="text-2xl font-bold">Disaster Recovery Center</h2>
          </div>
          <p className="text-indigo-200">Current Active Region: <span className="font-mono font-bold text-white">{drStatus.activeRegion === 'Primary' ? drStatus.primaryRegion : drStatus.drRegion}</span></p>
          <div className="flex items-center gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
              <RefreshCw size={14} className={drStatus.syncStatus === 'Synced' ? 'text-emerald-400' : 'text-amber-400'} />
              <span>Data Sync: {drStatus.syncStatus}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 px-3 py-1 rounded">
              <Database size={14} className="text-blue-400" />
              <span>RPO: {drStatus.rpoSeconds} seconds</span>
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Estimated Recovery Time</p>
          <p className="text-3xl font-bold font-mono">~45 Mins</p>
          <p className="text-xs text-emerald-400 mt-1">Within SLA (Target &lt; 8 Hours)</p>
        </div>
      </div>

      {/* Region Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative">
        {/* Connector Line */}
        <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="w-16 h-1 bg-slate-200 rounded-full overflow-hidden">
             <div className="w-full h-full bg-indigo-500 animate-progress"></div>
          </div>
        </div>

        {/* Primary Region */}
        <div className={`bg-white p-6 rounded-xl border-2 transition-all ${
          drStatus.activeRegion === 'Primary' ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-slate-200 opacity-60'
        }`}>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${drStatus.activeRegion === 'Primary' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                <Globe size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Primary Region</h3>
                <p className="text-sm text-slate-500">{drStatus.primaryRegion}</p>
              </div>
            </div>
            {drStatus.activeRegion === 'Primary' && <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">ACTIVE</span>}
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Status</span>
              <span className="text-emerald-600 font-medium">Operational</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Latency</span>
              <span className="text-slate-900 font-medium">24ms</span>
            </div>
          </div>
        </div>

        {/* DR Region */}
        <div className={`bg-white p-6 rounded-xl border-2 transition-all ${
          drStatus.activeRegion === 'DR' ? 'border-rose-500 shadow-lg shadow-rose-500/10' : 'border-slate-200'
        }`}>
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-lg ${drStatus.activeRegion === 'DR' ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                <ShieldAlert size={24} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800">DR Region (Standby)</h3>
                <p className="text-sm text-slate-500">{drStatus.drRegion}</p>
              </div>
            </div>
            {drStatus.activeRegion === 'DR' && <span className="px-3 py-1 bg-rose-100 text-rose-700 text-xs font-bold rounded-full">ACTIVE</span>}
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Replication Status</span>
              <span className="text-indigo-600 font-medium">{drStatus.syncStatus}</span>
            </div>
            <div className="flex justify-between p-3 bg-slate-50 rounded">
              <span className="text-slate-600">Ready for Traffic</span>
              <span className="text-slate-900 font-medium">Yes</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Backup & Restore */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <HardDrive size={18} className="text-slate-500" />
            <h3 className="font-bold text-slate-800">Backup & Restore Points</h3>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
               <div className="flex-1">
                 <p className="text-sm text-slate-500">Last Successful Backup</p>
                 <p className="font-bold text-slate-800 text-lg">{drStatus.lastBackup}</p>
               </div>
               <button className="px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 text-sm font-medium">
                 Create Snapshot
               </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase">Available Restore Points</p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 border border-slate-100 rounded-lg hover:border-indigo-200 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <CheckCircle size={16} className="text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-700">Full Backup - {i} hours ago</p>
                      <p className="text-xs text-slate-400">Size: 4.2 TB • Integrity Verified</p>
                    </div>
                  </div>
                  <button className="text-xs bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Emergency Zone */}
        <div className="bg-rose-50 rounded-xl border border-rose-100 overflow-hidden">
          <div className="p-4 border-b border-rose-200 bg-rose-100 flex items-center gap-2 text-rose-800">
            <AlertTriangle size={18} />
            <h3 className="font-bold">Emergency Failover Control</h3>
          </div>
          <div className="p-6 flex flex-col justify-center h-full">
            <p className="text-sm text-rose-700 mb-6 leading-relaxed">
              <strong>Warning:</strong> Initiating a failover will forcibly redirect all user traffic to the Disaster Recovery region. 
              Active sessions may be dropped. Use this only when the Primary Region is completely unreachable.
            </p>
            
            <button 
              onClick={handleFailover}
              disabled={isFailingOver}
              className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transform transition-all active:scale-95 flex items-center justify-center gap-3 ${
                isFailingOver 
                  ? 'bg-slate-400 cursor-not-allowed' 
                  : 'bg-rose-600 hover:bg-rose-700 text-white hover:shadow-rose-900/20'
              }`}
            >
              {isFailingOver ? (
                <>
                  <RefreshCw className="animate-spin" />
                  INITIATING FAILOVER SEQUENCE...
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
    </div>
  );
};
