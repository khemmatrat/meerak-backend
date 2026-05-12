import React, { useState, useEffect } from 'react';
import { Shield, Lock, Globe, AlertTriangle, Zap, MinusCircle, Plus, Search, Power, Loader2, RefreshCw } from 'lucide-react';
import { MOCK_SECURITY_RULES } from '../constants';
import { SecurityRule } from '../types';
import {
  getSecurityStats,
  verifySecurityAll,
  getBlockedIps,
  blockIp,
  unblockIp,
  getAdminUsers,
  getHighRiskUsers,
  suspendAdminUser,
  walletFreezeAdminUser,
  forceLogoutAdminUser,
  getReconcileAlerts,
  resolveReconcileAlert,
  type SecurityStatsResponse,
  type HighRiskUser,
} from '../services/adminApi';
import { useToast } from '../context/ToastContext';

export const SecurityCenterView: React.FC = () => {
  const toast = useToast();
  const [blockedIps, setBlockedIps] = useState<Array<{ id: string; ip: string; reason?: string; blocked_at?: string; expires_at?: string }>>([]);
  const [rules, setRules] = useState<SecurityRule[]>(MOCK_SECURITY_RULES);
  const [panicMode, setPanicMode] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [stats, setStats] = useState<SecurityStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [killSwitchUserId, setKillSwitchUserId] = useState('');
  const [killSwitchSearch, setKillSwitchSearch] = useState('');
  const [killSwitchSearchResults, setKillSwitchSearchResults] = useState<Array<{ id: string; email?: string; full_name?: string; phone?: string }>>([]);
  const [killSwitchAction, setKillSwitchAction] = useState<'freeze' | 'suspend' | 'revoke'>('revoke');
  const [killSwitchBusy, setKillSwitchBusy] = useState(false);
  const [blockIpBusy, setBlockIpBusy] = useState(false);
  const [highRiskUsers, setHighRiskUsers] = useState<HighRiskUser[]>([]);
  const [reconcileAlerts, setReconcileAlerts] = useState<Array<{ id: string; omise_balance_thb: number; platform_balance_thb: number; diff_thb: number; created_at: string | null }>>([]);

  const fetchBlockedIps = async () => {
    try {
      const { blockedIps: ips } = await getBlockedIps();
      setBlockedIps(ips || []);
    } catch {
      setBlockedIps([]);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const data = await getSecurityStats();
      setStats(data);
    } catch (e) {
      console.warn('Security stats fetch failed:', e);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchHighRiskUsers = async () => {
    try {
      const { users } = await getHighRiskUsers({ limit: 20 });
      setHighRiskUsers(users || []);
    } catch {
      setHighRiskUsers([]);
    }
  };

  const fetchReconcileAlerts = async () => {
    try {
      const { alerts } = await getReconcileAlerts();
      setReconcileAlerts(alerts || []);
    } catch {
      setReconcileAlerts([]);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchBlockedIps();
    fetchHighRiskUsers();
    fetchReconcileAlerts();
  }, []);

  const handleSearchUser = async () => {
    if (!killSwitchSearch.trim()) return;
    try {
      const { users } = await getAdminUsers({ search: killSwitchSearch.trim(), limit: 10 });
      setKillSwitchSearchResults(users || []);
    } catch {
      setKillSwitchSearchResults([]);
    }
  };

  const handleVerifyAll = async () => {
    setVerifying(true);
    try {
      await verifySecurityAll();
      await fetchStats();
      toast.success('Ledger integrity verified');
    } catch (e: any) {
      toast.error(e?.message ?? 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleKillSwitch = async () => {
    if (!killSwitchUserId.trim()) return;
    if (!confirm(`Are you sure you want to ${killSwitchAction} user ${killSwitchUserId}?`)) return;
    setKillSwitchBusy(true);
    try {
      if (killSwitchAction === 'suspend') await suspendAdminUser(killSwitchUserId.trim(), 'Security Center: Suspended by admin');
      else if (killSwitchAction === 'freeze') await walletFreezeAdminUser(killSwitchUserId.trim(), true);
      else await forceLogoutAdminUser(killSwitchUserId.trim(), 'Security Center: Revoke sessions');
      setKillSwitchUserId('');
      setKillSwitchSearchResults([]);
      await fetchStats();
      toast.success(`Kill Switch: ${killSwitchAction === 'revoke' ? 'Sessions revoked' : killSwitchAction === 'freeze' ? 'Wallet frozen' : 'Account suspended'}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Kill Switch failed');
    } finally {
      setKillSwitchBusy(false);
    }
  };

  const handleAddIp = async (e: React.FormEvent) => {
    e.preventDefault();
    const ip = newIp.trim();
    if (!ip) return;
    setBlockIpBusy(true);
    try {
      await blockIp(ip, 'Manual block via Security Center');
      setNewIp('');
      await fetchBlockedIps();
      toast.success(`Blocked IP ${ip}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Block IP failed');
    } finally {
      setBlockIpBusy(false);
    }
  };

  const handleUnblock = async (ip: string) => {
    if (!confirm(`Unblock ${ip}?`)) return;
    try {
      await unblockIp(ip);
      await fetchBlockedIps();
      toast.success(`Unblocked ${ip}`);
    } catch (err: any) {
      toast.error(err?.message ?? 'Unblock failed');
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
                 <button type="submit" disabled={blockIpBusy} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 flex items-center gap-2 disabled:opacity-50">
                    {blockIpBusy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Block IP
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
                           <td className="px-4 py-3 text-slate-500 text-xs">{entry.expires_at ? new Date(entry.expires_at).toLocaleDateString() : '—'}</td>
                           <td className="px-4 py-3 text-right">
                              <button 
                                onClick={() => handleUnblock(entry.ip)}
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

        {/* Right Column: Security Pulse (Real Data) */}
        <div className="space-y-6">
           <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg">
              <div className="flex justify-between items-center mb-4">
                 <h3 className="font-bold text-lg flex items-center gap-2">
                    <Shield size={20} className="text-emerald-400" />
                    Security Pulse
                 </h3>
                 <button onClick={fetchStats} disabled={loading} className="p-1.5 rounded hover:bg-slate-700">
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                 </button>
              </div>
              {loading ? (
                 <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin" /></div>
              ) : stats ? (
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400 text-sm">Failed Logins (24h)</span>
                       <span className={`font-bold text-xl ${(stats.failedLogins24h || 0) >= 10 ? 'text-rose-400' : 'text-white'}`}>{stats.failedLogins24h ?? 0}</span>
                    </div>
                    {stats.bruteForceIps?.length ? (
                    <div className="p-2 bg-rose-900/50 rounded">
                       <span className="text-rose-300 text-xs">Brute-force IPs (≥5 fails)</span>
                       <div className="mt-1 space-y-0.5">
                         {stats.bruteForceIps.slice(0, 5).map((b, i) => (
                           <div key={i} className="flex justify-between text-xs">
                             <span className="font-mono">{b.ip}</span>
                             <span className="text-rose-400">{b.count} attempts</span>
                           </div>
                         ))}
                       </div>
                    </div>
                    ) : null}
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400 text-sm">Ledger Integrity</span>
                       <span className={`font-bold text-sm ${stats.ledgerIntegrity?.valid === true ? 'text-emerald-400' : stats.ledgerIntegrity?.valid === false ? 'text-rose-400' : 'text-slate-400'}`}>
                          {stats.ledgerIntegrity?.valid === true ? '✓ Valid' : stats.ledgerIntegrity?.valid === false ? '✗ Broken' : stats.ledgerIntegrity?.note || '—'}
                       </span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-slate-400 text-sm">Rate Limit Entries</span>
                       <span className="font-bold text-xl">{stats.rateLimitEntries ?? 0}</span>
                    </div>
                    <button onClick={handleVerifyAll} disabled={verifying} className="w-full mt-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                       {verifying ? <Loader2 size={16} className="animate-spin" /> : <Shield size={16} />} Run Deep Scan
                    </button>
                 </div>
              ) : (
                 <p className="text-slate-400 text-sm">Unable to load stats</p>
              )}
           </div>

           {/* Live Threat Map — Recent Security Events */}
           <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <AlertTriangle size={18} /> Recent Security Events
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-2">
                 {stats?.recentEvents?.length ? stats.recentEvents.slice(0, 15).map((ev, i) => (
                    <div key={i} className="p-2 bg-slate-50 rounded text-xs">
                       <span className="font-medium text-slate-700">{(ev as any).label || ev.action}</span>
                       {ev.ipAddress && <span className="text-slate-500 ml-1">({ev.ipAddress})</span>}
                       <span className="text-slate-400 ml-1 block mt-0.5">{ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}</span>
                    </div>
                 )) : (
                    <p className="text-slate-500 text-sm">No recent events</p>
                 )}
              </div>
           </div>

           {/* High-Risk Users (5 ธงแดง) */}
           {highRiskUsers.length > 0 ? (
             <div className="bg-amber-50 p-6 rounded-xl border-2 border-amber-200 shadow-sm">
               <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
                 <AlertTriangle size={18} /> High-Risk Users ({highRiskUsers.length})
               </h3>
               <div className="max-h-48 overflow-y-auto space-y-2">
                 {highRiskUsers.map((u) => (
                   <div key={u.user_id} className="p-3 bg-white rounded border border-amber-100 flex justify-between items-center">
                     <div className="min-w-0">
                       <p className="font-medium text-slate-800 truncate">{u.full_name || u.email || u.phone || u.user_id.slice(0, 8)}</p>
                       <p className="text-xs text-slate-500">Score: {u.total_score} • {u.flag_count} flag(s) • {u.anomaly_types?.join(', ') || '—'}</p>
                     </div>
                     <span className={`text-xs font-bold px-2 py-1 rounded ${u.total_score >= 80 ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}`}>
                       {u.account_status === 'suspended' ? 'SUSPENDED' : u.total_score}
                     </span>
                   </div>
                 ))}
               </div>
               <button onClick={fetchHighRiskUsers} className="mt-3 w-full py-2 text-sm text-amber-700 hover:bg-amber-100 rounded-lg font-medium">
                 Refresh
               </button>
             </div>
           ) : null}

           {/* Kill Switch */}
           <div className="bg-white p-6 rounded-xl border-2 border-rose-200 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                 <Power size={18} className="text-rose-600" /> Kill Switch
              </h3>
              <p className="text-sm text-slate-600 mb-4">Freeze account, suspend, or revoke sessions for a user.</p>
              <div className="space-y-3">
                 <div className="flex gap-2">
                   <input
                      type="text"
                      placeholder="ค้นหาด้วย email หรือเบอร์โทร"
                      value={killSwitchSearch}
                      onChange={(e) => setKillSwitchSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearchUser()}
                      className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm"
                   />
                   <button type="button" onClick={handleSearchUser} className="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-300 flex items-center gap-1">
                     <Search size={16} /> ค้นหา
                   </button>
                 </div>
                 {killSwitchSearchResults.length > 0 && (
                   <div className="max-h-24 overflow-y-auto border border-slate-200 rounded-lg divide-y">
                     {killSwitchSearchResults.map((u) => (
                       <button key={u.id} type="button" onClick={() => { setKillSwitchUserId(u.id); setKillSwitchSearchResults([]); setKillSwitchSearch(u.email || u.phone || u.id); }} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50">
                         {u.full_name || u.email || u.phone} <span className="text-slate-400 text-xs">({u.id.slice(0, 8)}...)</span>
                       </button>
                     ))}
                   </div>
                 )}
                 <input
                    type="text"
                    placeholder="หรือวาง User ID (UUID) โดยตรง"
                    value={killSwitchUserId}
                    onChange={(e) => setKillSwitchUserId(e.target.value)}
                    className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm"
                 />
                 <select value={killSwitchAction} onChange={(e) => setKillSwitchAction(e.target.value as any)} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="revoke">Revoke All Sessions</option>
                    <option value="freeze">Freeze Wallet</option>
                    <option value="suspend">Suspend Account</option>
                 </select>
                 <button onClick={handleKillSwitch} disabled={killSwitchBusy || !killSwitchUserId.trim()} className="w-full py-2 bg-rose-600 text-white rounded-lg font-medium text-sm hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {killSwitchBusy ? <Loader2 size={16} className="animate-spin" /> : <Power size={16} />} Execute
                 </button>
              </div>
           </div>

           {/* Reconcile Alerts — เงินรั่ว (Omise vs Platform) */}
           {reconcileAlerts.length > 0 ? (
             <div className="bg-rose-50 p-6 rounded-xl border-2 border-rose-200 shadow-sm">
               <h3 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
                 <AlertTriangle size={18} /> Reconcile Alerts ({reconcileAlerts.length})
               </h3>
               <p className="text-sm text-rose-700 mb-3">ยอด Omise กับ Platform ต่างกันเกินกำหนด — ตรวจสอบด่วน</p>
               <div className="max-h-40 overflow-y-auto space-y-2">
                 {reconcileAlerts.map((a) => (
                   <div key={a.id} className="p-3 bg-white rounded border border-rose-200 flex justify-between items-center">
                     <div>
                       <p className="text-sm font-medium text-slate-800">Diff ฿{a.diff_thb.toLocaleString()}</p>
                       <p className="text-xs text-slate-500">Omise ฿{a.omise_balance_thb?.toLocaleString()} | Platform ฿{a.platform_balance_thb?.toLocaleString()}</p>
                       <p className="text-xs text-slate-400">{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</p>
                     </div>
                     <button
                       onClick={async () => {
                         try {
                           await resolveReconcileAlert(a.id);
                           await fetchReconcileAlerts();
                           toast.success('Marked as resolved');
                         } catch (e: any) {
                           toast.error(e?.message ?? 'Failed');
                         }
                       }}
                       className="text-xs px-2 py-1 bg-rose-600 text-white rounded hover:bg-rose-700"
                     >
                       Resolve
                     </button>
                   </div>
                 ))}
               </div>
               <button onClick={fetchReconcileAlerts} className="mt-3 w-full py-2 text-sm text-rose-700 hover:bg-rose-100 rounded-lg font-medium">
                 Refresh
               </button>
             </div>
           ) : null}

           {/* Suspicious Payouts */}
           {stats?.suspiciousPayouts?.length ? (
              <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
                 <h3 className="font-bold text-slate-800 mb-4">Suspicious Payouts (≥50k or recent)</h3>
                 <div className="space-y-2 max-h-32 overflow-y-auto">
                    {stats.suspiciousPayouts.slice(0, 5).map((p) => (
                       <div key={p.id} className="flex justify-between text-sm p-2 bg-amber-50 rounded">
                          <span>{p.userName || p.userId}</span>
                          <span className="font-mono">฿{(p.amount || 0).toLocaleString()}</span>
                       </div>
                    ))}
                 </div>
              </div>
           ) : null}
        </div>

      </div>
    </div>
  );
};
