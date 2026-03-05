
import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, Smartphone, Wifi, WifiOff, Ban, Shield, Lock, LogOut, Globe, Loader2 } from 'lucide-react';
import { DataService } from '../services/realtimeService';
import { MobileUser } from '../types';

export const UserTableView: React.FC = () => {
  const [users, setUsers] = useState<MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      const data = await DataService.getUsers();
      setUsers(data);
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const handleAction = (action: string, username: string) => {
    if (confirm(`Are you sure you want to ${action} user ${username}?`)) {
      alert(`Action ${action} executed successfully for ${username}. (Syncing to Backend...)`);
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.lastIp && user.lastIp.includes(searchTerm))
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">ผู้ใช้งาน Mobile App</h2>
          <p className="text-slate-500 text-sm">จัดการข้อมูลและการเข้าถึงของผู้ใช้ (Real-time Sync)</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="ค้นหา Username, Email, IP..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      
      <div className="overflow-x-auto min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Loader2 size={32} className="animate-spin mb-2" />
            <p>กำลังโหลดข้อมูลจากฐานข้อมูล...</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-100">
                <th className="px-6 py-4 font-semibold">User Info</th>
                <th className="px-6 py-4 font-semibold">Security Info</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Last Active</th>
                <th className="px-6 py-4 font-semibold text-right">Total Spent</th>
                <th className="px-6 py-4 font-semibold text-right">Security Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-slate-50/80 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{user.username}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                       <div className="flex items-center gap-2 text-slate-600">
                          <Smartphone size={14} />
                          <span className="text-xs">{user.platform}</span>
                       </div>
                       <div className="flex items-center gap-2 text-slate-500">
                          <Globe size={14} />
                          <span className="text-xs font-mono">{user.lastIp || 'Unknown IP'}</span>
                       </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${
                      user.status === 'online' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      user.status === 'offline' ? 'bg-slate-100 text-slate-600 border-slate-200' :
                      user.status === 'frozen' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-rose-50 text-rose-700 border-rose-100'
                    }`}>
                      {user.status === 'online' && <Wifi size={12} />}
                      {user.status === 'offline' && <WifiOff size={12} />}
                      {user.status === 'banned' && <Ban size={12} />}
                      {user.status === 'frozen' && <Lock size={12} />}
                      {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {new Date(user.lastActive).toLocaleString('th-TH')}
                  </td>
                  <td className="px-6 py-4 text-right font-medium text-slate-900">
                    ฿{user.totalSpent.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleAction('FORCE LOGOUT', user.username)}
                        className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" 
                        title="Force Logout"
                      >
                        <LogOut size={16} />
                      </button>
                      <button 
                         onClick={() => handleAction('FREEZE ACCOUNT', user.username)}
                         className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                         title="Freeze Account"
                      >
                        <Lock size={16} />
                      </button>
                      <button 
                         onClick={() => handleAction('BAN USER', user.username)}
                         className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                         title="Ban Permanently"
                      >
                        <Ban size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                   <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                      ไม่พบข้อมูลผู้ใช้งานที่ค้นหา
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
