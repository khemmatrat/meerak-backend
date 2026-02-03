
import React, { useState } from 'react';
import { Shield, Lock, Globe, AlertTriangle, Zap, MinusCircle, Plus, Search, Power } from 'lucide-react';
import { MOCK_BLOCKED_IPS, MOCK_SECURITY_RULES } from '../constants';
import { IpBlockEntry, SecurityRule } from '../types';

export const SecurityCenterView: React.FC = () => {
  const [blockedIps, setBlockedIps] = useState<IpBlockEntry[]>(MOCK_BLOCKED_IPS);
  const [rules, setRules] = useState<SecurityRule[]>(MOCK_SECURITY_RULES);
  const [panicMode, setPanicMode] = useState(false);
  const [newIp, setNewIp] = useState('');

  const handleAddIp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp) return;
    const newEntry: IpBlockEntry = {
      id: `BLK-${Date.now()}`,
      ip: newIp,
      reason: 'Manual Block via Security Center',
      blockedAt: new Date().toLocaleString(),
      expiresAt: 'Permanent',
      blockedBy: 'AdminMaster',
      status: 'Active'
    };
    setBlockedIps([newEntry, ...blockedIps]);
    setNewIp('');
  };

  const handleUnblock = (id: string) => {
    if(confirm('Are you sure you want to unblock this IP?')) {
      setBlockedIps(blockedIps.filter(ip => ip.id !== id));
    }
  };

  const toggleRule = (id: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, isEnabled: !r.isEnabled } : r));
  };

  return (
    <div className="space-y-8">
      
      {/* Panic Button Section */}
      <div className={`p-6 rounded-xl border-2 flex items-center justify-between transition-all ${
        panicMode 
          ? 'bg-rose-950 border-rose-600 shadow-xl shadow-rose-900/50' 
          : 'bg-white border-slate-200'
      }`}>
         <div className="flex items-center gap-4">
            <div className={`p-4 rounded-full ${panicMode ? 'bg-rose-600 animate-pulse' : 'bg-slate-100'}`}>
              <Shield size={32} className={panicMode ? 'text-white' : 'text-slate-500'} />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${panicMode ? 'text-white' : 'text-slate-800'}`}>
                {panicMode ? 'UNDER ATTACK MODE ACTIVATED' : 'DDoS Protection Status: Normal'}
              </h2>
              <p className={`text-sm ${panicMode ? 'text-rose-200' : 'text-slate-500'}`}>
                {panicMode 
                  ? 'System is aggressively challenging all requests. CAPTCHA enabled. Rate limits tightened.' 
                  : 'Traffic is flowing normally. Standard WAF rules applied.'}
              </p>
            </div>
         </div>
         <button 
          onClick={() => setPanicMode(!panicMode)}
          className={`px-6 py-3 rounded-lg font-bold text-sm tracking-wider transition-all flex items-center gap-2 ${
            panicMode 
              ? 'bg-white text-rose-700 hover:bg-rose-50' 
              : 'bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-200'
          }`}
         >
           <Zap size={18} fill="currentColor" />
           {panicMode ? 'DEACTIVATE PANIC MODE' : 'ENABLE PANIC MODE'}
         </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Rules & Geo-Blocking */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Rules */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Lock size={18} className="text-indigo-600" />
                <h3 className="font-bold text-slate-800">Active Firewall Rules (WAF)</h3>
             </div>
             <div className="divide-y divide-slate-50">
                {rules.map((rule) => (
                  <div key={rule.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                     <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${rule.isEnabled ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                           {rule.type === 'Geo-Block' && <Globe size={20} />}
                           {rule.type === 'Rate-Limit' && <Zap size={20} />}
                           {rule.type === 'Signature' && <Shield size={20} />}
                           {rule.type === 'Bot-Protection' && <AlertTriangle size={20} />}
                        </div>
                        <div>
                           <p className={`font-bold text-sm ${rule.isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>{rule.name}</p>
                           <p className="text-xs text-slate-500">Target: {rule.target} • Action: <span className="font-mono text-indigo-600">{rule.action}</span></p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <div className="text-right">
                           <p className="text-xs text-slate-400">Hits (24h)</p>
                           <p className="text-sm font-mono font-bold text-slate-700">{rule.hits.toLocaleString()}</p>
                        </div>
                        <button 
                          onClick={() => toggleRule(rule.id)}
                          className={`w-12 h-6 rounded-full p-1 transition-colors ${rule.isEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                          <div className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${rule.isEnabled ? 'translate-x-6' : 'translate-x-0'}`}></div>
                        </button>
                     </div>
                  </div>
                ))}
             </div>
          </div>

          {/* IP Blacklist Manager */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
             <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <MinusCircle size={18} className="text-rose-600" />
                  <h3 className="font-bold text-slate-800">IP Blacklist Manager</h3>
                </div>
                <div className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-xs font-bold">
                   {blockedIps.length} Active Bans
                </div>
             </div>
             
             {/* Add IP Form */}
             <div className="p-4 border-b border-slate-100 bg-slate-50/30">
               <form onSubmit={handleAddIp} className="flex gap-2">
                 <input 
                    type="text" 
                    placeholder="Enter Malicious IP (e.g. 192.168.1.1)"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                    className="flex-1 px-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                 />
                 <button type="submit" className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 flex items-center gap-2">
                    <Plus size={16} /> Block IP
                 </button>
               </form>
             </div>

             {/* Block List */}
             <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-left text-sm">
                   <thead className="bg-slate-50 text-slate-600 sticky top-0">
                      <tr>
                         <th className="px-4 py-2">IP Address</th>
                         <th className="px-4 py-2">Reason</th>
                         <th className="px-4 py-2">Expires</th>
                         <th className="px-4 py-2 text-right">Action</th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {blockedIps.map((entry) => (
                        <tr key={entry.id} className="hover:bg-rose-50/10">
                           <td className="px-4 py-3 font-mono font-bold text-slate-700">{entry.ip}</td>
                           <td className="px-4 py-3 text-slate-500 text-xs">{entry.reason}</td>
                           <td className="px-4 py-3 text-slate-500 text-xs">{entry.expiresAt}</td>
                           <td className="px-4 py-3 text-right">
                              <button 
                                onClick={() => handleUnblock(entry.id)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium hover:underline"
                              >
                                Unblock
                              </button>
                           </td>
                        </tr>
                      ))}
                   </tbody>
                </table>
             </div>
          </div>
        </div>

        {/* Right Column: Insights & Stats */}
        <div className="space-y-6">
           <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                 <Shield size={20} className="text-emerald-400" />
                 Defense Overview
              </h3>
              <div className="space-y-4">
                 <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Threats Blocked (24h)</span>
                    <span className="font-bold text-xl">12,450</span>
                 </div>
                 <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-[70%]"></div>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-slate-400 text-sm">Bandwidth Saved</span>
                    <span className="font-bold text-xl">45.2 GB</span>
                 </div>
              </div>
              <div className="mt-6 pt-6 border-t border-slate-700">
                 <h4 className="text-sm font-semibold text-slate-300 mb-3">Top Attack Types</h4>
                 <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                       <span className="text-rose-400">SQL Injection</span>
                       <span className="text-slate-400">45%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                       <span className="text-amber-400">Bot Scraping</span>
                       <span className="text-slate-400">30%</span>
                    </div>
                    <div className="flex justify-between text-xs">
                       <span className="text-blue-400">DDoS (L7)</span>
                       <span className="text-slate-400">25%</span>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Globe size={18} /> Attack Map (Top Sources)
              </h3>
              <div className="space-y-3">
                 {[
                    { country: 'Russia', code: 'RU', hits: 5400, risk: 'High' },
                    { country: 'China', code: 'CN', hits: 3200, risk: 'High' },
                    { country: 'Unknown Proxy', code: '??', hits: 1200, risk: 'Medium' },
                 ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded hover:bg-slate-100 cursor-pointer">
                       <div className="flex items-center gap-3">
                          <span className="font-mono text-xs font-bold text-slate-500 bg-slate-200 px-1.5 rounded">{c.code}</span>
                          <span className="text-sm text-slate-700">{c.country}</span>
                       </div>
                       <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-600">{c.hits}</span>
                          <span className={`w-2 h-2 rounded-full ${c.risk === 'High' ? 'bg-rose-500' : 'bg-amber-500'}`}></span>
                       </div>
                    </div>
                 ))}
              </div>
              <button className="w-full mt-4 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                 View Full Attack Map
              </button>
           </div>
        </div>

      </div>
    </div>
  );
};
