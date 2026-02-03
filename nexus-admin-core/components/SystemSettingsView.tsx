
import React, { useState } from 'react';
import { Server, Shield, Database, Wifi, Save, RotateCcw, Activity, Lock, Cpu } from 'lucide-react';
import { INITIAL_SYSTEM_CONFIG } from '../constants';
import { SystemConfig } from '../types';

export const SystemSettingsView: React.FC = () => {
  const [config, setConfig] = useState<SystemConfig>(INITIAL_SYSTEM_CONFIG);
  const [isSaving, setIsSaving] = useState(false);
  const [serverStatus, setServerStatus] = useState<'Running' | 'Restarting'>('Running');

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
      alert('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว');
    }, 1500);
  };

  const handleRestart = () => {
    if (confirm('คำเตือน: การรีสตาร์ทเซิร์ฟเวอร์จะทำให้การเชื่อมต่อของ Mobile App หลุดชั่วคราว ยืนยันที่จะทำต่อหรือไม่?')) {
      setServerStatus('Restarting');
      setTimeout(() => {
        setServerStatus('Running');
        alert('Server Restarted Successfully. Connections reset.');
      }, 3000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      
      {/* Header / Status Bar */}
      <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${serverStatus === 'Running' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400 animate-spin'}`}>
            <Server size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Backend Server Node 01</h2>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <span>Status: </span>
              <span className={serverStatus === 'Running' ? 'text-emerald-400' : 'text-amber-400'}>{serverStatus}</span>
              <span className="mx-2">•</span>
              <span>Uptime: 14d 2h 15m</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleRestart}
            disabled={serverStatus === 'Restarting'}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600"
          >
            <RotateCcw size={18} />
            {serverStatus === 'Restarting' ? 'Rebooting...' : 'Restart Server'}
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors font-medium shadow-lg shadow-indigo-900/50"
          >
            {isSaving ? <span className="animate-spin">⌛</span> : <Save size={18} />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Connectivity */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* API Connectivity Control */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Wifi className="text-indigo-600" size={20} />
              <h3 className="font-bold text-slate-800">Mobile App Connectivity (API Gateway)</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    API Rate Limiting (Requests/Min)
                  </label>
                  <input 
                    type="number" 
                    value={config.apiRateLimit}
                    onChange={(e) => setConfig({...config, apiRateLimit: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">ป้องกันการยิง Request ถล่ม Server จาก Mobile App</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Connection Timeout (ms)
                  </label>
                  <input 
                    type="number" 
                    value={config.connectionTimeout}
                    onChange={(e) => setConfig({...config, connectionTimeout: parseInt(e.target.value)})}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">เวลาสูงสุดที่ยอมให้ Mobile App รอการตอบกลับ</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Max Concurrent Connections
                </label>
                <div className="flex items-center gap-4">
                  <input 
                    type="range" 
                    min="1000" 
                    max="50000" 
                    step="1000"
                    value={config.maxConcurrentConnections}
                    onChange={(e) => setConfig({...config, maxConcurrentConnections: parseInt(e.target.value)})}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                  <span className="text-sm font-mono font-bold bg-slate-100 px-3 py-1 rounded w-24 text-center">
                    {config.maxConcurrentConnections.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Database Configuration */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Database className="text-emerald-600" size={20} />
              <h3 className="font-bold text-slate-800">Database & Caching</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-100 rounded-lg">
                <div>
                  <h4 className="font-semibold text-emerald-900">Redis Caching Layer</h4>
                  <p className="text-sm text-emerald-700">ช่วยลดภาระ Database โดยการเก็บข้อมูลที่เรียกบ่อยไว้ใน Cache</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.cacheEnabled}
                    onChange={(e) => setConfig({...config, cacheEnabled: e.target.checked})}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Database Connection Pool Size
                </label>
                <input 
                  type="number" 
                  value={config.databasePoolSize}
                  onChange={(e) => setConfig({...config, databasePoolSize: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Security & Environment */}
        <div className="space-y-6">
          
          {/* Environment Switcher */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Cpu className="text-amber-600" size={20} />
              <h3 className="font-bold text-slate-800">Environment</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Target Environment</label>
                <select 
                  value={config.environment}
                  onChange={(e) => setConfig({...config, environment: e.target.value as any})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Production">Production (Live)</option>
                  <option value="Staging">Staging (Test)</option>
                  <option value="Development">Development</option>
                </select>
                {config.environment === 'Production' && (
                  <p className="text-xs text-rose-500 mt-2 flex items-center gap-1">
                    <Activity size={12} /> Live Environment: Changes affect real users immediately.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-sm font-medium text-slate-700">Debug Mode</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={config.debugMode}
                    onChange={(e) => setConfig({...config, debugMode: e.target.checked})}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Security */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
              <Shield className="text-rose-600" size={20} />
              <h3 className="font-bold text-slate-800">Admin Access Control</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Admin IP Whitelist</label>
                <textarea 
                  rows={3}
                  value={config.ipWhitelist}
                  onChange={(e) => setConfig({...config, ipWhitelist: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-mono text-xs"
                  placeholder="192.168.1.1, 127.0.0.1"
                />
                <p className="text-xs text-slate-500 mt-1">Only these IPs can access this dashboard.</p>
              </div>
              
              <button className="w-full py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors">
                <Lock size={14} /> Reset Admin API Keys
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
