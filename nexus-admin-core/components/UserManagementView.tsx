// Phase 4A: User Management — backend RBAC (USER/ADMIN/AUDITOR). No balance mutation from admin.
import React, { useState, useEffect } from 'react';
import { 
  Search, UserCog, Ban, Unlock, Wallet, Eye, X, 
  Check, Loader2, Shield, Phone, Mail, DollarSign, Activity
} from 'lucide-react';
import { DataService } from '../services/realtimeService';
import { getAdminUsers, getAdminUser, updateAdminUserRole, getAdminToken } from '../services/adminApi';
import { MobileUser } from '../types';

type BackendRole = 'USER' | 'ADMIN' | 'AUDITOR';

export const UserManagementView: React.FC = () => {
  const [users, setUsers] = useState<MobileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [useBackend] = useState(!!getAdminToken());
  
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [newRole, setNewRole] = useState<BackendRole | 'USER' | 'PROVIDER'>('USER');
  const [newBalance, setNewBalance] = useState('');
  
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      if (useBackend) {
        const res = await getAdminUsers({ limit: 100 });
        setUsers(res.users.map((u: any) => ({
          id: u.id,
          username: u.full_name || u.email,
          email: u.email,
          role: u.role,
          status: u.account_status === 'banned' ? 'banned' : u.account_status === 'active' ? 'online' : 'offline',
          lastActive: u.created_at,
          platform: 'Mobile',
          totalSpent: 0,
          lastIp: '-',
          wallet_balance: undefined,
        })));
      } else {
        const data = await DataService.getUsers();
        setUsers(data);
      }
    } catch (error: any) {
      if (useBackend) setUsers([]);
      else {
        try { const data = await DataService.getUsers(); setUsers(data); } catch (_) {}
      }
      console.error('Failed to fetch users:', error);
    }
    setLoading(false);
  };

  const handleChangeRole = async () => {
    if (!selectedUser) return;
    
    setProcessing(true);
    try {
      if (useBackend && ['USER', 'ADMIN', 'AUDITOR'].includes(String(newRole))) {
        await updateAdminUserRole(selectedUser.id, newRole as BackendRole);
        alert(`✅ Role updated to ${newRole} (recorded in audit log)`);
      } else if (!useBackend) {
        await DataService.updateUserRole(selectedUser.id, newRole as 'USER' | 'PROVIDER');
        alert(`✅ Successfully updated ${selectedUser.username} to ${newRole}`);
      }
      setShowRoleModal(false);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to update role: ${error?.message || error}`);
    }
    setProcessing(false);
  };

  const handleUpdateBalance = async () => {
    if (!selectedUser || !newBalance || useBackend) return;
    setProcessing(true);
    try {
      await DataService.updateUserBalance(selectedUser.id, parseFloat(newBalance));
      alert(`✅ Successfully updated ${selectedUser.username} balance to ฿${newBalance}`);
      setShowBalanceModal(false);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to update balance: ${error?.message || error}`);
    }
    setProcessing(false);
  };

  const handleBanUser = async (user: any) => {
    if (useBackend) return;
    const isBanned = user.status === 'banned' || user.status === 'offline';
    const action = isBanned ? 'Unban' : 'Ban';
    if (!confirm(`Are you sure you want to ${action} ${user.username}?`)) return;
    try {
      await DataService.banUser(user.id, !isBanned);
      alert(`✅ Successfully ${action}ned ${user.username}`);
      fetchUsers();
    } catch (error: any) {
      alert(`❌ Failed to ${action}: ${error?.message}`);
    }
  };

  const handleViewDetails = async (user: any) => {
    try {
      if (useBackend) {
        const res = await getAdminUser(user.id);
        const u = res.user as any;
        setSelectedUser({
          id: u.id,
          name: u.full_name || u.email,
          email: u.email,
          phone: u.phone,
          role: u.role,
          wallet_balance: u.wallet_balance,
          kyc_level: u.kyc_level,
          created_at: u.created_at,
          updated_at: u.updated_at,
        });
      } else {
        const details = await DataService.getUserDetails(user.id);
        setSelectedUser(details);
      }
      setShowDetailsModal(true);
    } catch (error: any) {
      alert(`❌ Failed to load user details: ${error?.message || error}`);
    }
  };

  const openRoleModal = (user: any) => {
    setSelectedUser(user);
    if (useBackend) {
      setNewRole((user.role === 'ADMIN' || user.role === 'AUDITOR' ? user.role : 'USER') as BackendRole);
    } else {
      setNewRole((user.role === 'PROVIDER' || user.role === 'provider') ? 'USER' : 'PROVIDER');
    }
    setShowRoleModal(true);
  };

  const openBalanceModal = (user: any) => {
    if (useBackend) return;
    setSelectedUser(user);
    setNewBalance(user.wallet_balance?.toString() || '0');
    setShowBalanceModal(true);
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (user.lastIp && user.lastIp.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-2xl font-bold mb-2">👥 User Management</h2>
        <p className="text-indigo-100">จัดการผู้ใช้งาน Meerak ทั้งหมด (Connected to Firebase)</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Users</p>
              <p className="text-2xl font-bold text-slate-900">{users.length}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Activity className="text-blue-600" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Providers</p>
              <p className="text-2xl font-bold text-emerald-600">
                {users.filter(u => u.role === 'PROVIDER' || u.role === 'provider').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <Shield className="text-emerald-600" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Online</p>
              <p className="text-2xl font-bold text-green-600">
                {users.filter(u => u.status === 'online').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="text-green-600" size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Banned</p>
              <p className="text-2xl font-bold text-red-600">
                {users.filter(u => u.status === 'banned').length}
              </p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <Ban className="text-red-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Search & Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-800">All Users</h3>
            <p className="text-slate-500 text-sm">Manage roles, wallets, and permissions</p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search users..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <Loader2 size={32} className="animate-spin mb-2" />
              <p>Loading from Firebase...</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">Role</th>
                  {!useBackend && <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">Wallet</th>}
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-600 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-600 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center font-bold">
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{user.username}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                          {user.phone && (
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Phone size={10} /> {user.phone}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                        (user.role === 'ADMIN' || user.role === 'admin')
                          ? 'bg-rose-100 text-rose-700'
                          : (user.role === 'AUDITOR' || user.role === 'auditor')
                          ? 'bg-amber-100 text-amber-700'
                          : (user.role === 'PROVIDER' || user.role === 'provider')
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    {!useBackend && (
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className="text-emerald-600" />
                        <span className="font-bold text-emerald-600">
                          ฿{user.wallet_balance?.toLocaleString() || 0}
                        </span>
                      </div>
                    </td>
                    )}
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        user.status === 'online' ? 'bg-green-100 text-green-700' :
                        user.status === 'banned' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openRoleModal(user)}
                          className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Change Role"
                        >
                          <UserCog size={18} />
                        </button>
                        {!useBackend && (
                        <button
                          onClick={() => openBalanceModal(user)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Edit Wallet"
                        >
                          <Wallet size={18} />
                        </button>
                        )}
                        <button
                          onClick={() => handleViewDetails(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View Details"
                        >
                          <Eye size={18} />
                        </button>
                        {!useBackend && (
                        <button
                          onClick={() => handleBanUser(user)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.status === 'banned'
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                          title={user.status === 'banned' ? 'Unban' : 'Ban'}
                        >
                          {user.status === 'banned' ? <Unlock size={18} /> : <Ban size={18} />}
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={useBackend ? 4 : 5} className="px-6 py-12 text-center text-slate-400">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Role Change Modal */}
      {showRoleModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <UserCog className="text-purple-600 mr-2" size={24} />
                Change User Role
              </h3>
              <button onClick={() => setShowRoleModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-slate-500">User:</p>
              <p className="font-bold text-slate-900">{selectedUser.username}</p>
              <p className="text-xs text-slate-500">{selectedUser.email}</p>
            </div>

            <div className="space-y-3 mb-6">
              {useBackend ? (
                <>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input type="radio" name="role" value="USER" checked={newRole === 'USER'} onChange={() => setNewRole('USER')} className="mr-3" />
                    <div>
                      <div className="font-bold text-slate-900">USER</div>
                      <div className="text-xs text-slate-500">Wallet only (app user)</div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input type="radio" name="role" value="ADMIN" checked={newRole === 'ADMIN'} onChange={() => setNewRole('ADMIN')} className="mr-3" />
                    <div>
                      <div className="font-bold text-slate-900">ADMIN</div>
                      <div className="text-xs text-slate-500">Full admin + reconciliation</div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input type="radio" name="role" value="AUDITOR" checked={newRole === 'AUDITOR'} onChange={() => setNewRole('AUDITOR')} className="mr-3" />
                    <div>
                      <div className="font-bold text-slate-900">AUDITOR</div>
                      <div className="text-xs text-slate-500">Read-only audit access</div>
                    </div>
                  </label>
                </>
              ) : (
                <>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input type="radio" name="role" value="USER" checked={newRole === 'USER'} onChange={() => setNewRole('USER')} className="mr-3" />
                    <div>
                      <div className="font-bold text-slate-900">👤 USER (ผู้จ้าง)</div>
                      <div className="text-xs text-slate-500">Can create and post jobs</div>
                    </div>
                  </label>
                  <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition">
                    <input type="radio" name="role" value="PROVIDER" checked={newRole === 'PROVIDER'} onChange={() => setNewRole('PROVIDER')} className="mr-3" />
                    <div>
                      <div className="font-bold text-slate-900">⚡ PROVIDER (ผู้รับงาน)</div>
                      <div className="text-xs text-slate-500">Can accept and complete jobs</div>
                    </div>
                  </label>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleChangeRole}
                disabled={processing}
                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 flex items-center justify-center disabled:opacity-50"
              >
                {processing ? <Loader2 className="animate-spin" size={18} /> : <><Check className="mr-2" size={18} /> Update</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Balance Modal */}
      {showBalanceModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <Wallet className="text-emerald-600 mr-2" size={24} />
                Edit Wallet Balance
              </h3>
              <button onClick={() => setShowBalanceModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="bg-emerald-50 p-4 rounded-lg mb-6">
              <p className="text-sm text-emerald-700">User:</p>
              <p className="font-bold text-emerald-900">{selectedUser.username}</p>
              <p className="text-xs text-emerald-600">Current Balance: ฿{selectedUser.wallet_balance?.toLocaleString() || 0}</p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">New Balance (THB)</label>
              <input
                type="number"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowBalanceModal(false)}
                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBalance}
                disabled={processing || !newBalance}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 flex items-center justify-center disabled:opacity-50"
              >
                {processing ? <Loader2 className="animate-spin" size={18} /> : <><Check className="mr-2" size={18} /> Update</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 my-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <Eye className="text-blue-600 mr-2" size={24} />
                User Details
              </h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Name</p>
                <p className="font-bold text-slate-900">{selectedUser.name}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Email</p>
                <p className="font-bold text-slate-900">{selectedUser.email}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Phone</p>
                <p className="font-bold text-slate-900">{selectedUser.phone || 'N/A'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Role</p>
                <p className="font-bold text-slate-900">{selectedUser.role}</p>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg">
                <p className="text-xs text-emerald-700 mb-1">Wallet Balance</p>
                <p className="font-bold text-2xl text-emerald-900">฿{selectedUser.wallet_balance?.toLocaleString() || 0}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-xs text-blue-700 mb-1">KYC Level</p>
                <p className="font-bold text-blue-900">{selectedUser.kyc_level || 'Not verified'}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Created</p>
                <p className="font-bold text-slate-900">{new Date(selectedUser.created_at).toLocaleDateString()}</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg">
                <p className="text-xs text-slate-500 mb-1">Last Updated</p>
                <p className="font-bold text-slate-900">{new Date(selectedUser.updated_at || selectedUser.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <button
              onClick={() => setShowDetailsModal(false)}
              className="w-full mt-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
