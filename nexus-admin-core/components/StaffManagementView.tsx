import React, { useState, useEffect, useCallback } from 'react';
import { UserCog, Plus, Shield, Key, Ban, CheckCircle, Search, Mail, X, Loader2, User, UserRound } from 'lucide-react';
import { AdminRole } from '../types';
import { getStaff, createStaff, updateStaffStatus, updateStaffPermissions, StaffMember } from '../services/adminApi';
import { PermissionModal } from './PermissionModal';

const ROLE_BADGE_STYLES: Record<string, string> = {
  super_admin: 'bg-slate-800 text-white border-slate-700',
  admin: 'bg-violet-100 text-violet-900 border-violet-200',
  moderator: 'bg-blue-100 text-blue-800 border-blue-200',
  support: 'bg-slate-100 text-slate-700 border-slate-200',
};

function formatLastLogin(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}

function getRoleLabel(role: string): string {
  const map: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    moderator: 'Moderator',
    support: 'Support',
  };
  return map[role] || role.replace(/_/g, ' ');
}

type StaffRoleOption = 'super_admin' | 'admin' | 'moderator' | 'support';

export const StaffManagementView: React.FC = () => {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [permissionStaff, setPermissionStaff] = useState<StaffMember | null>(null);
  const [permissionSaving, setPermissionSaving] = useState(false);
  const [statusActioning, setStatusActioning] = useState<string | null>(null);
  const [addStaffing, setAddStaffing] = useState(false);
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    contactEmail: '',
    role: 'support' as StaffRoleOption,
    password: '',
  });

  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getStaff(search || undefined);
      setStaffList(res.staff || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load staff');
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const getRoleColor = (role: AdminRole | string) => {
    const r = String(role).toLowerCase();
    return ROLE_BADGE_STYLES[r] || 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStaffing(true);
    setError(null);
    try {
      const payload: Parameters<typeof createStaff>[0] = {
        full_name: newStaff.name.trim(),
        email: newStaff.email.trim().toLowerCase(),
        role: newStaff.role,
        department: 'General',
      };
      const ce = newStaff.contactEmail.trim();
      if (ce) payload.contact_email = ce.toLowerCase();
      if (
        (newStaff.role === 'super_admin' || newStaff.role === 'admin') &&
        newStaff.password.trim().length >= 6
      ) {
        payload.password = newStaff.password.trim();
      }
      const created = await createStaff(payload);
      setStaffList((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewStaff({ name: '', email: '', contactEmail: '', role: 'support', password: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add staff member');
    } finally {
      setAddStaffing(false);
    }
  };

  const handleDeactivate = async (staff: StaffMember) => {
    if (!confirm(`Are you sure you want to ${staff.status === 'active' ? 'deactivate' : 'activate'} ${staff.full_name}?`)) return;
    setStatusActioning(staff.id);
    try {
      const newStatus = staff.status === 'active' ? 'inactive' : 'active';
      await updateStaffStatus(staff.id, newStatus);
      setStaffList((prev) => prev.map((s) => (s.id === staff.id ? { ...s, status: newStatus } : s)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setStatusActioning(null);
    }
  };

  const handleSavePermissions = async (permissions: string[]) => {
    if (!permissionStaff) return;
    setPermissionSaving(true);
    try {
      await updateStaffPermissions(permissionStaff.id, permissions);
      setStaffList((prev) => prev.map((s) => (s.id === permissionStaff.id ? { ...s, permissions } : s)));
      setPermissionStaff(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save permissions');
    } finally {
      setPermissionSaving(false);
    }
  };

  const displayList = staffList;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserCog size={20} className="text-indigo-600" />
            Staff & Access Control
          </h2>
          <p className="text-slate-500 text-sm">Manage internal team members and their permission levels.</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 shadow-md shrink-0"
        >
          <Plus size={16} /> Add Team Member
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-600">
              All Staff ({displayList.length})
            </span>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 size={24} className="animate-spin" /> Loading staff...
          </div>
        ) : displayList.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-slate-500">
            <UserCog size={48} className="text-slate-300" />
            <p className="text-sm font-medium">No staff members yet</p>
            <p className="text-xs text-slate-400">Add your first team member to get started.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700"
            >
              <Plus size={16} /> Add Team Member
            </button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4">Member</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Last Login</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayList.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                        <User size={18} className="text-slate-500" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-800">{staff.full_name}</div>
                        <div className="text-slate-500 text-xs flex items-center gap-1 mt-0.5">
                          <Mail size={12} /> <span title="อีเมลล็อกอิน">{staff.email}</span>
                        </div>
                        {staff.contact_email && staff.contact_email !== staff.email && (
                          <div className="text-indigo-600 text-xs mt-0.5" title="อีเมลติดต่อ">
                            ติดต่อ: {staff.contact_email}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-bold border ${getRoleColor(staff.role)}`}>
                      {getRoleLabel(staff.role)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">{staff.department || 'General'}</td>
                  <td className="px-6 py-4">
                    {staff.status === 'active' ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-bold">
                        <CheckCircle size={14} /> Active
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-rose-600 text-xs font-bold">
                        <Ban size={14} /> Inactive
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500 text-xs">
                    {formatLastLogin(staff.last_login)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setPermissionStaff(staff)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                      >
                        <Key size={12} /> Manage Permissions
                      </button>
                      <button
                        onClick={() => handleDeactivate(staff)}
                        disabled={statusActioning === staff.id}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-50 ${
                          staff.status === 'active'
                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                            : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {statusActioning === staff.id ? (
                          <Loader2 size={12} className="animate-spin inline" />
                        ) : staff.status === 'active' ? (
                          'Deactivate'
                        ) : (
                          'Activate'
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-bold text-slate-800">Add New Staff Member</h3>
              <button onClick={() => setShowAddModal(false)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <form onSubmit={handleAddStaff} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">ชื่อเต็ม</label>
                <input
                  type="text"
                  required
                  value={newStaff.name}
                  onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  อีเมลสำหรับล็อกอิน Admin Panel <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={newStaff.email}
                  onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                  placeholder="ใช้ล็อกอินและอ้างอิงบัญชีในระบบ"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  อีเมลติดต่อ / รับการแจ้งเตือน <span className="text-slate-400 font-normal">(ไม่บังคับ)</span>
                </label>
                <input
                  type="email"
                  value={newStaff.contactEmail}
                  onChange={(e) => setNewStaff({ ...newStaff, contactEmail: e.target.value })}
                  placeholder="ถ้าว่าง จะใช้อีเมลล็อกอินด้านบนเมื่อต้องส่งข้อความติดต่อ"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-slate-400 mt-1">สำหรับแยกอีเมลงาน vs อีเมลส่วนตัว — หรือใช้เมื่อล็อกอินเป็นอีเมลองค์กร</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">บทบาท</label>
                <p className="text-[11px] text-slate-500 mb-2 font-medium">ผู้ดูแลระบบ (สร้างบัญชีล็อกอิน + สิทธิ์ใน user_roles)</p>
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {[
                    {
                      val: 'super_admin' as const,
                      label: 'Super Admin',
                      hint: 'สิทธิ์สูงสุด — ตั้งค่าระบบ sensitive, ทีมงาน, การเงินตามที่ RBAC อนุญาต',
                      Icon: Shield,
                    },
                    {
                      val: 'admin' as const,
                      label: 'Admin',
                      hint: 'ปฏิบัติการทั่วไป — ต่างจาก Super Admin ตามสิทธิ์ในระบบ (เช่น ไม่กระทบบางเมนูของ Super Admin)',
                      Icon: UserRound,
                    },
                  ].map((roleOption) => {
                    const RoleIcon = roleOption.Icon;
                    return (
                      <label
                        key={roleOption.val}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          newStaff.role === roleOption.val ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={roleOption.val}
                          checked={newStaff.role === roleOption.val}
                          onChange={() => setNewStaff({ ...newStaff, role: roleOption.val })}
                          className="accent-indigo-600 mt-1"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <RoleIcon size={16} className="text-slate-600 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800">{roleOption.label}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{roleOption.hint}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 mb-2 font-medium">ทีมงาน (บันทึกใน Staff — ไม่สร้างบัญชีล็อกอินแอดมินจากฟอร์มนี้)</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { val: 'moderator' as const, label: 'Moderator', hint: 'รายงาน & คอนเทนต์', Icon: Key },
                    { val: 'support' as const, label: 'Support', hint: 'ผู้ใช้ & ตั๋วซัพพอร์ต', Icon: UserCog },
                  ].map((roleOption) => {
                    const RoleIcon = roleOption.Icon;
                    return (
                      <label
                        key={roleOption.val}
                        className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          newStaff.role === roleOption.val ? 'bg-indigo-50 border-indigo-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={roleOption.val}
                          checked={newStaff.role === roleOption.val}
                          onChange={() => setNewStaff({ ...newStaff, role: roleOption.val })}
                          className="accent-indigo-600 mt-1"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <RoleIcon size={16} className="text-slate-600 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800">{roleOption.label}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{roleOption.hint}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
              {(newStaff.role === 'super_admin' || newStaff.role === 'admin') && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                    รหัสผ่านเริ่มต้น (ล็อกอินแอดมิน) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required={newStaff.role === 'super_admin' || newStaff.role === 'admin'}
                    minLength={6}
                    value={newStaff.password}
                    onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                    placeholder="อย่างน้อย 6 ตัวอักษร — สร้าง users + user_roles"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Super Admin → สิทธิ์ SUPER_ADMIN; Admin → สิทธิ์ ADMIN ในระบบ
                  </p>
                </div>
              )}
              <button
                type="submit"
                disabled={addStaffing}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addStaffing ? (
                  <>
                    <Loader2 size={16} className="animate-spin inline mr-2" />
                    Adding...
                  </>
                ) : (
                  'Create Account & Send Invite'
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {permissionStaff && (
        <PermissionModal
          staffName={permissionStaff.full_name}
          permissions={permissionStaff.permissions || []}
          onSave={handleSavePermissions}
          onClose={() => setPermissionStaff(null)}
          saving={permissionSaving}
        />
      )}
    </div>
  );
};
