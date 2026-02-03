
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminService } from '../../services/adminService';
import { UserProfile, Transaction, Dispute, Voucher, Job, CompanyLedgerItem, AdminRole, AdminLog, AdminUser, SystemBanner, ChatMessage } from '../../types';
import { 
    LayoutDashboard, Users, FileCheck, DollarSign, AlertTriangle, Settings, LogOut, 
    TrendingUp, ArrowUpRight, Search, Check, X, Ban, Unlock, Eye, Tag, Plus,
    Briefcase, Server, Megaphone, Home, Archive, ShieldCheck, ArrowDownLeft, User, ScrollText, UserCog, Download, Trash2, MessageSquare, Clock, MapPin, Bell, Key,
    LifeBuoy, Copy, Zap, Activity, Siren, Lock
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState<any>(null);
  const [kycList, setKycList] = useState<UserProfile[]>([]);
  const [withdrawals, setWithdrawals] = useState<Transaction[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [companyLedger, setCompanyLedger] = useState<CompanyLedgerItem[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [staffList, setStaffList] = useState<AdminUser[]>([]);
  const [banners, setBanners] = useState<SystemBanner[]>([]);
  
  // Admin Session Info
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('super_admin');

  // User Management State
  const [userSearch, setUserSearch] = useState('');
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null); // Full detail object
  const [showUserModal, setShowUserModal] = useState(false);
  
  // 🔧 Role Management State
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleEditUser, setRoleEditUser] = useState<UserProfile | null>(null);
  const [newRole, setNewRole] = useState<'USER' | 'PROVIDER'>('PROVIDER');

  // Job Management State
  const [jobSearch, setJobSearch] = useState('');
  const [jobsList, setJobsList] = useState<Job[]>([]);

  // Chat Evidence State
  const [chatLogs, setChatLogs] = useState<ChatMessage[]>([]);
  const [showChatModal, setShowChatModal] = useState(false);
  const [selectedDisputeJobId, setSelectedDisputeJobId] = useState('');

  // Notifications
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // System Config State
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState('');
  
  // Banner Form
  const [newBanner, setNewBanner] = useState({ title: '', message: '', type: 'info' });

  // Voucher Form
  const [newVoucher, setNewVoucher] = useState({ code: '', discount: 0, min: 0, desc: '' });

  // Employee Form
  const [newEmployee, setNewEmployee] = useState({ name: '', email: '', password: '', role: 'support' });

  // Admin Change Password Form
  const [adminPassForm, setAdminPassForm] = useState({ old: '', new: '', confirm: '' });

  // Accounting Forms
  const [expenseForm, setExpenseForm] = useState({
      category: 'personnel',
      amount: '',
      description: ''
  });
  const [withdrawForm, setWithdrawForm] = useState({
      amount: '',
      description: 'Owner Withdrawal'
  });

  useEffect(() => {
    // Auth Check
    const token = localStorage.getItem('meerak_admin_token');
    const email = localStorage.getItem('meerak_admin_email');
    const role = localStorage.getItem('meerak_admin_role') as AdminRole;

    if (!token || !email || !role) {
        navigate('/admin/login');
        return;
    }
    setAdminEmail(email);
    setAdminRole(role);
    
    loadData();
  }, []);

  const loadData = async () => {
      const s = await AdminService.getDashboardStats();
      setStats(s);
      
      const k = await AdminService.getPendingKYC();
      setKycList(k);

      const w = await AdminService.getPendingWithdrawals();
      setWithdrawals(w);

      const d = await AdminService.getDisputes();
      setDisputes(d);

      const v = await AdminService.getVouchers();
      setVouchers(v);

      const c = await AdminService.getCategories();
      setCategories(c);

      const l = await AdminService.getCompanyLedger();
      setCompanyLedger(l);

      const logs = await AdminService.getAdminLogs();
      setLogs(logs);

      const staff = await AdminService.getEmployees();
      setStaffList(staff);

      const b = await AdminService.getBanners();
      setBanners(b);
  };

  // Search Users when entering Users tab or typing
  useEffect(() => {
      if (activeTab === 'users') {
          const search = async () => {
              const res = await AdminService.searchUsers(userSearch);
              setUsersList(res);
          };
          const debounce = setTimeout(search, 500);
          return () => clearTimeout(debounce);
      }
  }, [userSearch, activeTab]);

  // Search Jobs
  useEffect(() => {
      if (activeTab === 'jobs') {
          const search = async () => {
              const res = await AdminService.searchJobs(jobSearch);
              setJobsList(res);
          };
          const debounce = setTimeout(search, 500);
          return () => clearTimeout(debounce);
      }
  }, [jobSearch, activeTab]);

  // RBAC CHECK
  const canAccess = (tab: string) => {
      if (adminRole === 'super_admin') return true;
      
      if (adminRole === 'support') {
          return ['overview', 'support', 'users', 'jobs', 'kyc', 'disputes'].includes(tab);
      }
      
      if (adminRole === 'accountant') {
          return ['overview', 'finance', 'accounting'].includes(tab);
      }
      return false;
  };

  const handleLogout = () => {
      localStorage.removeItem('meerak_admin_token');
      localStorage.removeItem('meerak_admin_email');
      localStorage.removeItem('meerak_admin_role');
      navigate('/admin/login');
  };

  const handleApproveKYC = async (id: string, approve: boolean) => {
      if (approve) {
          if(window.confirm('Approve User?')) {
              await AdminService.reviewKYC(id, true);
              await AdminService.logAdminAction(adminEmail, adminRole, 'APPROVE_KYC', `User ID: ${id}`, id);
              loadData();
          }
      } else {
          const reason = prompt("Please enter rejection reason:", "Documents unclear");
          if (reason !== null) {
              await AdminService.reviewKYC(id, false, reason);
              await AdminService.logAdminAction(adminEmail, adminRole, 'REJECT_KYC', `Reason: ${reason}`, id);
              loadData();
          }
      }
  };

  const handleApproveWithdrawal = async (id: string) => {
      if(window.confirm('Mark withdrawal as transferred?')) {
          await AdminService.approveWithdrawal(id);
          await AdminService.logAdminAction(adminEmail, adminRole, 'APPROVE_WITHDRAWAL', `Tx ID: ${id}`, id);
          loadData();
      }
  };

  const handleResolveDispute = async (id: string, jobId: string, decision: 'refund_user' | 'pay_provider') => {
      if(window.confirm(`Resolve as: ${decision}?`)) {
          await AdminService.resolveDispute(id, jobId, decision);
          await AdminService.logAdminAction(adminEmail, adminRole, 'RESOLVE_DISPUTE', `Dispute: ${id}, Decision: ${decision}`, id);
          loadData();
      }
  };

  const handleViewChat = async (jobId: string) => {
      setSelectedDisputeJobId(jobId);
      const logs = await AdminService.getJobChatLogs(jobId);
      setChatLogs(logs);
      setShowChatModal(true);
  };

  const handleDeleteJob = async (jobId: string, title: string) => {
      if(window.confirm(`Force delete job: "${title}"? This cannot be undone.`)) {
          await AdminService.deleteJob(jobId);
          await AdminService.logAdminAction(adminEmail, adminRole, 'DELETE_JOB', `Job: ${title}`, jobId);
          const res = await AdminService.searchJobs(jobSearch);
          setJobsList(res);
      }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
      e.preventDefault();
      await AdminService.createVoucher({
          code: newVoucher.code.toUpperCase(),
          discount_amount: Number(newVoucher.discount),
          min_spend: Number(newVoucher.min),
          description: newVoucher.desc,
          active: true
      });
      await AdminService.logAdminAction(adminEmail, adminRole, 'CREATE_VOUCHER', `Code: ${newVoucher.code}`);
      setNewVoucher({ code: '', discount: 0, min: 0, desc: '' });
      loadData();
  };

  const handleCreateBanner = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newBanner.title || !newBanner.message) return;
      await AdminService.createBanner({
          title: newBanner.title,
          message: newBanner.message,
          type: newBanner.type as any,
          active: true
      });
      await AdminService.logAdminAction(adminEmail, adminRole, 'CREATE_BANNER', `Title: ${newBanner.title}`);
      setNewBanner({ title: '', message: '', type: 'info' });
      loadData();
  };

  const handleCrisisBanner = async () => {
      if(window.confirm('ACTIVATE CRISIS MODE? This will post a "System Down" banner immediately.')) {
          await AdminService.createBanner({
              title: '⚠️ System Maintenance',
              message: 'We are experiencing technical difficulties. Our team is investigating. Please check back later.',
              type: 'warning',
              active: true
          });
          await AdminService.logAdminAction(adminEmail, adminRole, 'CRISIS_MODE', 'Activated System Warning');
          loadData();
          alert('Crisis banner deployed.');
      }
  };

  const handleDeleteBanner = async (id: string) => {
      if(window.confirm('Remove banner?')) {
          await AdminService.deleteBanner(id);
          loadData();
      }
  };

  const handleViewUser = async (id: string) => {
      try {
          const details = await AdminService.getUserDetails(id);
          setSelectedUser(details);
          setShowUserModal(true);
      } catch (e) {
          alert('Failed to load user details');
      }
  };

  // 🔧 Handle Change User Role
  const handleOpenRoleModal = (user: UserProfile) => {
      setRoleEditUser(user);
      setNewRole(user.role === 'PROVIDER' ? 'USER' : 'PROVIDER');
      setShowRoleModal(true);
  };

  const handleChangeRole = async () => {
      if (!roleEditUser) return;
      
      try {
          await AdminService.updateUserRole(roleEditUser.id, newRole);
          await AdminService.logAdminAction(
              adminEmail, 
              adminRole, 
              'CHANGE_USER_ROLE', 
              `Changed ${roleEditUser.name} from ${roleEditUser.role} to ${newRole}`, 
              roleEditUser.id
          );
          
          alert(`✅ Successfully updated ${roleEditUser.name} to ${newRole}`);
          setShowRoleModal(false);
          
          // Refresh users list
          const res = await AdminService.searchUsers(userSearch);
          setUsersList(res);
      } catch (error) {
          alert(`❌ Failed to update role: ${error.message}`);
      }
  };

  const handleBanUser = async (id: string, currentStatus: boolean) => {
      if(window.confirm(currentStatus ? 'Unban this user?' : 'Ban this user?')) {
          await AdminService.banUser(id, !currentStatus);
          await AdminService.logAdminAction(adminEmail, adminRole, currentStatus ? 'UNBAN_USER' : 'BAN_USER', `User ID: ${id}`, id);
          // Refresh local state
          if (selectedUser) {
              setSelectedUser({ ...selectedUser, user: { ...selectedUser.user, is_banned: !currentStatus }});
          }
          const res = await AdminService.searchUsers(userSearch);
          setUsersList(res);
      }
  };

  const handleAddCategory = async () => {
      if (!newCategory.trim()) return;
      await AdminService.addCategory(newCategory.trim());
      await AdminService.logAdminAction(adminEmail, adminRole, 'ADD_CATEGORY', `Category: ${newCategory}`);
      setNewCategory('');
      const c = await AdminService.getCategories();
      setCategories(c);
  };

  const handleRemoveCategory = async (cat: string) => {
      if (window.confirm(`Remove category "${cat}"?`)) {
          await AdminService.removeCategory(cat);
          await AdminService.logAdminAction(adminEmail, adminRole, 'REMOVE_CATEGORY', `Category: ${cat}`);
          const c = await AdminService.getCategories();
          setCategories(c);
      }
  };

  const handleRecordExpense = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!expenseForm.amount || !expenseForm.description) return;
      
      await AdminService.recordCompanyTransaction({
          type: 'expense',
          category: expenseForm.category as any,
          amount: Number(expenseForm.amount),
          description: expenseForm.description,
          recorded_by: adminEmail
      });
      await AdminService.logAdminAction(adminEmail, adminRole, 'RECORD_EXPENSE', `Amount: ${expenseForm.amount}, Desc: ${expenseForm.description}`);
      
      setExpenseForm({ category: 'personnel', amount: '', description: '' });
      loadData();
  };

  const handleOwnerWithdraw = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!withdrawForm.amount) return;
      
      if (stats.cash_on_hand < Number(withdrawForm.amount)) {
          alert('Insufficient Cash on Hand!');
          return;
      }

      await AdminService.recordCompanyTransaction({
          type: 'owner_withdrawal',
          category: 'profit_taking',
          amount: Number(withdrawForm.amount),
          description: withdrawForm.description,
          recorded_by: adminEmail
      });
      await AdminService.logAdminAction(adminEmail, adminRole, 'OWNER_WITHDRAWAL', `Amount: ${withdrawForm.amount}`);

      setWithdrawForm({ amount: '', description: 'Owner Withdrawal' });
      loadData();
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
      e.preventDefault();
      if(!newEmployee.email || !newEmployee.password) return;
      try {
          await AdminService.createEmployee({
              name: newEmployee.name,
              email: newEmployee.email,
              password_hash: newEmployee.password,
              role: newEmployee.role as AdminRole,
              is_active: true
          });
          await AdminService.logAdminAction(adminEmail, adminRole, 'ADD_EMPLOYEE', `Email: ${newEmployee.email}`);
          setNewEmployee({ name: '', email: '', password: '', role: 'support' });
          loadData();
          alert('Employee added successfully');
      } catch (e: any) {
          alert(e.message);
      }
  };

  const handleRemoveEmployee = async (id: string) => {
      if(window.confirm('Remove this employee access?')) {
          await AdminService.removeEmployee(id);
          await AdminService.logAdminAction(adminEmail, adminRole, 'REMOVE_EMPLOYEE', `ID: ${id}`);
          loadData();
      }
  };

  const handleResetEmployeePassword = async (id: string) => {
      const newPass = prompt("Enter new password for this employee:");
      if (newPass && newPass.trim().length > 0) {
          await AdminService.resetEmployeePassword(id, newPass);
          await AdminService.logAdminAction(adminEmail, adminRole, 'RESET_PASSWORD', `ID: ${id}`);
          alert('Password updated successfully');
      }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (adminPassForm.new !== adminPassForm.confirm) {
          alert('New passwords do not match');
          return;
      }
      try {
          await AdminService.changeOwnPassword(adminEmail, adminPassForm.old, adminPassForm.new);
          alert('Password changed successfully. Please login again.');
          handleLogout();
      } catch (e: any) {
          alert(e.message || 'Failed to change password');
      }
  };

  const copyResponse = (text: string) => {
      navigator.clipboard.writeText(text);
      alert('Response copied to clipboard!');
  };

  const exportToCSV = (data: any[], filename: string) => {
      if (!data || !data.length) return;
      
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(obj => 
          Object.values(obj).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
      );
      
      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- PLAYBOOK DATA (THAI) ---
  const cannedResponses = [
      { q: "ทำไมโพสต์งานไปแล้วไม่เห็นเลย?", a: "ระบบของเราเพื่อให้งานครอบคลุมงานในระยะใกล้เคียงกันเป็นหลักและงานจะอายุ 24 ชั่วโมงครับ ถ้าครบเวลาแล้วงานจะควบคุมอัตโนมัติเพื่อความสดใหม่ครับ" },
      { q: "เติมเงินแล้วยอดไม่เข้า?", a: "รบกวนขอรูปสลิปโอนเงินหรือรหัสธุรกรรมครับระบบจะต้องตรวจสอบยอด 1-5 นาทีถ้าเกินนี้แล้วแอดมินจะตรวจสอบยอดหลังบ้านให้ครับ" },
      { q: "ส่งงานแล้ว ทำไมเงินยังไม่เข้า?", a: "หากผู้จ้างงานยังไม่กดอนุมัติระบบจะทำการดำเนินการอนุมัติให้อัตโนมัติภายใน 5 นาทีครับเดี๋ยวจะเข้ากระเป๋าทันทีรอสักครู่นะครับ" },
      { q: "ถอนเงินแล้ว เงินยังไม่เข้า?", a: "รายการถอนเงินจะดำเนินการภายใน 24 ชั่วโมงครับ (ตัดรอบทุก ... โมง) ทางเราจะรีบดำเนินการตรวจสอบและโอนให้ครับ" },
      { q: "KYC ไม่ผ่าน?", a: "ดูเหตุผลที่ถูกปฏิเสธที่กรอบสีแดงในหน้าโปรไฟล์ครับ (เช่นรูปไม่ชัดเจน) เพื่อให้ถ่ายภาพใหม่และส่งอีกครั้งได้เลย" }
  ];

  if (!stats) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading Admin Portal...</div>;

  const totalAlerts = (stats.pending_kyc || 0) + (stats.pending_withdrawals || 0) + (stats.active_disputes || 0);

  return (
    <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar */}
        <div className="w-64 bg-slate-900 text-white flex flex-col fixed h-full z-10">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-xl font-bold flex items-center">
                    <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center mr-3">M</div>
                    Admin
                </h1>
                <div className="mt-2 text-xs text-slate-400 flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-2 ${adminRole === 'super_admin' ? 'bg-red-500' : adminRole === 'accountant' ? 'bg-emerald-500' : 'bg-blue-500'}`}></span>
                    {adminEmail}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1 font-bold">{adminRole.replace('_', ' ')}</div>
            </div>
            <nav className="flex-1 p-4 space-y-2">
                <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                    <LayoutDashboard size={20} /> <span>Overview</span>
                </button>

                {canAccess('support') && (
                    <button onClick={() => setActiveTab('support')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'support' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <LifeBuoy size={20} /> <span>Support Playbook</span>
                    </button>
                )}
                
                {canAccess('accounting') && (
                    <button onClick={() => setActiveTab('accounting')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'accounting' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Briefcase size={20} /> <span>Accounting</span>
                    </button>
                )}
                
                {canAccess('users') && (
                    <button onClick={() => setActiveTab('users')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'users' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Users size={20} /> <span>Users (CRM)</span>
                    </button>
                )}

                {canAccess('jobs') && (
                    <button onClick={() => setActiveTab('jobs')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'jobs' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <Briefcase size={20} /> <span>Job Monitor</span>
                    </button>
                )}
                
                {canAccess('kyc') && (
                    <button onClick={() => setActiveTab('kyc')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'kyc' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <FileCheck size={20} /> <span>Verifications</span>
                        {stats.pending_kyc > 0 && <span className="ml-auto bg-red-500 text-xs px-2 py-0.5 rounded-full">{stats.pending_kyc}</span>}
                    </button>
                )}
                
                {canAccess('finance') && (
                    <button onClick={() => setActiveTab('finance')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'finance' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <DollarSign size={20} /> <span>Payouts</span>
                        {stats.pending_withdrawals > 0 && <span className="ml-auto bg-amber-500 text-black text-xs px-2 py-0.5 rounded-full">{stats.pending_withdrawals}</span>}
                    </button>
                )}
                
                {canAccess('disputes') && (
                    <button onClick={() => setActiveTab('disputes')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'disputes' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                        <AlertTriangle size={20} /> <span>Disputes</span>
                        {stats.active_disputes > 0 && <span className="ml-auto bg-red-500 text-xs px-2 py-0.5 rounded-full">{stats.active_disputes}</span>}
                    </button>
                )}
                
                {adminRole === 'super_admin' && (
                    <>
                        <div className="pt-4 pb-2 text-xs text-slate-500 font-bold uppercase tracking-wider">System</div>
                        <button onClick={() => setActiveTab('staff')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'staff' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            <UserCog size={20} /> <span>Staff Access</span>
                        </button>
                        <button onClick={() => setActiveTab('settings')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            <Settings size={20} /> <span>Config</span>
                        </button>
                        <button onClick={() => setActiveTab('logs')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'logs' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
                            <ScrollText size={20} /> <span>Audit Logs</span>
                        </button>
                    </>
                )}
            </nav>
            <div className="p-4 border-t border-slate-800">
                <button onClick={handleLogout} className="w-full flex items-center space-x-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                    <LogOut size={20} /> <span>Sign Out</span>
                </button>
            </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 ml-64 p-8">
            
            {/* Chat Log Modal */}
            {/* 🔧 Role Change Modal */}
            {showRoleModal && roleEditUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-slate-900 flex items-center">
                                <UserCog className="text-purple-600 mr-2" size={24} />
                                Change User Role
                            </h3>
                            <button 
                                onClick={() => setShowRoleModal(false)}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                <X size={24} />
                            </button>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-lg mb-6">
                            <div className="flex items-center mb-2">
                                <img 
                                    src={roleEditUser.avatar_url} 
                                    className="w-12 h-12 rounded-full mr-3" 
                                    alt="" 
                                />
                                <div>
                                    <p className="font-bold text-slate-900">{roleEditUser.name}</p>
                                    <p className="text-sm text-slate-500">{roleEditUser.phone}</p>
                                </div>
                            </div>
                            <div className="text-sm">
                                <span className="text-slate-500">Current Role: </span>
                                <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                    roleEditUser.role === 'PROVIDER' || roleEditUser.role === 'provider'
                                        ? 'bg-emerald-100 text-emerald-700' 
                                        : 'bg-blue-100 text-blue-700'
                                }`}>
                                    {roleEditUser.role}
                                </span>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-3">
                                Select New Role:
                            </label>
                            <div className="space-y-2">
                                <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                    <input 
                                        type="radio" 
                                        name="role" 
                                        value="USER"
                                        checked={newRole === 'USER'}
                                        onChange={(e) => setNewRole(e.target.value as 'USER' | 'PROVIDER')}
                                        className="mr-3"
                                    />
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-900">👤 USER (ผู้จ้าง)</div>
                                        <div className="text-xs text-slate-500">Can create and post jobs</div>
                                    </div>
                                </label>
                                <label className="flex items-center p-4 border-2 border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
                                    <input 
                                        type="radio" 
                                        name="role" 
                                        value="PROVIDER"
                                        checked={newRole === 'PROVIDER'}
                                        onChange={(e) => setNewRole(e.target.value as 'USER' | 'PROVIDER')}
                                        className="mr-3"
                                    />
                                    <div className="flex-1">
                                        <div className="font-bold text-slate-900">⚡ PROVIDER (ผู้รับงาน)</div>
                                        <div className="text-xs text-slate-500">Can accept and complete jobs</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowRoleModal(false)}
                                className="flex-1 py-3 border-2 border-slate-300 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleChangeRole}
                                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center"
                            >
                                <Check className="mr-2" size={18} />
                                Update Role
                            </button>
                        </div>

                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800">
                                <strong>⚠️ Warning:</strong> User must logout and login again to see the role change.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {showChatModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                            <h3 className="font-bold text-slate-700">Chat Evidence (Job #{selectedDisputeJobId.slice(0,6)})</h3>
                            <button onClick={() => setShowChatModal(false)} className="p-1 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 space-y-3 bg-slate-50">
                            {chatLogs.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm my-10">No messages found.</p>
                            ) : (
                                chatLogs.map(msg => (
                                    <div key={msg.id} className={`flex flex-col ${msg.sender_id === 'system' ? 'items-center' : 'items-start'}`}>
                                        <div className="text-[10px] text-slate-400 mb-1 ml-1">
                                            User: {msg.sender_id.slice(0,6)}... • {new Date(msg.created_at).toLocaleTimeString()}
                                        </div>
                                        <div className={`px-3 py-2 rounded-lg text-sm max-w-[85%] ${
                                            msg.sender_id === 'system' ? 'bg-gray-200 text-gray-600 italic' : 'bg-white border border-slate-200 text-slate-800 shadow-sm'
                                        }`}>
                                            {msg.type === 'image' ? (
                                                <a href={msg.media_url} target="_blank" rel="noreferrer">
                                                    <img src={msg.media_url} alt="Evidence" className="rounded max-h-40 border"/>
                                                </a>
                                            ) : msg.text}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="p-4 border-t border-slate-100 text-center bg-white rounded-b-xl">
                            <p className="text-xs text-slate-400">End of conversation log</p>
                        </div>
                    </div>
                </div>
            )}

            {/* User Detail Modal */}
            {showUserModal && selectedUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                            <div className="flex items-center">
                                <img src={selectedUser.user.avatar_url} className="w-16 h-16 rounded-full mr-4 border-4 border-white shadow-sm" alt="" />
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-900">{selectedUser.user.name}</h2>
                                    <p className="text-slate-500">{selectedUser.user.phone} • {selectedUser.user.email}</p>
                                    <div className="flex gap-2 mt-2">
                                        <span className={`px-2 py-0.5 text-xs rounded font-bold uppercase ${selectedUser.user.role === 'provider' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {selectedUser.user.role}
                                        </span>
                                        {selectedUser.user.is_banned && <span className="px-2 py-0.5 text-xs rounded font-bold uppercase bg-red-600 text-white">BANNED</span>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowUserModal(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="md:col-span-1 space-y-6">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                    <h3 className="font-bold text-slate-700 mb-2">Wallet</h3>
                                    <p className="text-3xl font-bold text-emerald-600">{selectedUser.user.wallet_balance?.toLocaleString()} ฿</p>
                                </div>
                                {adminRole === 'super_admin' && (
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <h3 className="font-bold text-slate-700 mb-2">Actions</h3>
                                        <button 
                                            onClick={() => handleBanUser(selectedUser.user.id, selectedUser.user.is_banned)}
                                            className={`w-full py-2 rounded-lg font-bold text-white ${selectedUser.user.is_banned ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                                        >
                                            {selectedUser.user.is_banned ? <><Unlock className="inline mr-2" size={16}/> Unban User</> : <><Ban className="inline mr-2" size={16}/> Ban User</>}
                                        </button>
                                    </div>
                                )}
                            </div>
                            
                            <div className="md:col-span-2 space-y-6">
                                <div>
                                    <h3 className="font-bold text-slate-800 mb-3">Job History</h3>
                                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    <th className="px-4 py-2 text-left">Role</th>
                                                    <th className="px-4 py-2 text-left">Title</th>
                                                    <th className="px-4 py-2 text-left">Status</th>
                                                    <th className="px-4 py-2 text-right">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {[
                                                    ...selectedUser.jobsPosted.map((j: any) => ({...j, type: 'Employer'})),
                                                    ...selectedUser.jobsWorked.map((j: any) => ({...j, type: 'Provider'}))
                                                ].map((job: any) => (
                                                    <tr key={job.id}>
                                                        <td className="px-4 py-2 text-slate-500">{job.type}</td>
                                                        <td className="px-4 py-2 font-medium">{job.title}</td>
                                                        <td className="px-4 py-2">{job.status}</td>
                                                        <td className="px-4 py-2 text-right">{job.price}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-800 capitalize">{activeTab}</h2>
                <div className="flex items-center space-x-4">
                    <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 text-sm font-medium text-slate-600">
                        Total Users: <span className="text-slate-900 font-bold">{stats.total_users}</span>
                    </div>
                    {canAccess('accounting') && (
                        <div className="bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200 text-sm font-medium text-slate-600">
                            Net Profit: <span className={`font-bold ${stats.net_profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{stats.net_profit.toLocaleString()} THB</span>
                        </div>
                    )}
                    {/* Admin Notification Bell */}
                    <div className="relative">
                        <button 
                            onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                            className="p-2 bg-white rounded-full shadow-sm border border-slate-200 hover:bg-slate-50 text-slate-600 relative"
                        >
                            <Bell size={20} />
                            {totalAlerts > 0 && (
                                <span className="absolute top-0 right-0 flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                </span>
                            )}
                        </button>
                        
                        {showNotifDropdown && (
                            <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-20 animate-in fade-in zoom-in-95">
                                <div className="p-3 bg-slate-50 border-b border-slate-100 font-bold text-xs text-slate-500 uppercase">
                                    Pending Actions
                                </div>
                                <div className="max-h-64 overflow-y-auto">
                                    {stats.active_disputes > 0 && (
                                        <button onClick={() => {setActiveTab('disputes'); setShowNotifDropdown(false)}} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex items-center text-red-600">
                                            <AlertTriangle size={16} className="mr-2"/>
                                            <span className="text-sm font-medium">{stats.active_disputes} Disputes</span>
                                        </button>
                                    )}
                                    {stats.pending_kyc > 0 && (
                                        <button onClick={() => {setActiveTab('kyc'); setShowNotifDropdown(false)}} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex items-center text-slate-700">
                                            <FileCheck size={16} className="mr-2"/>
                                            <span className="text-sm font-medium">{stats.pending_kyc} KYC Requests</span>
                                        </button>
                                    )}
                                    {stats.pending_withdrawals > 0 && (
                                        <button onClick={() => {setActiveTab('finance'); setShowNotifDropdown(false)}} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-50 flex items-center text-amber-600">
                                            <DollarSign size={16} className="mr-2"/>
                                            <span className="text-sm font-medium">{stats.pending_withdrawals} Payouts</span>
                                        </button>
                                    )}
                                    {totalAlerts === 0 && (
                                        <div className="px-4 py-6 text-center text-slate-400 text-sm">All caught up!</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Content Switcher */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Gross Revenue</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.gross_revenue.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600"><DollarSign size={20} /></div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-blue-600">
                                Platform Fees Collected
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Net Profit</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.net_profit.toLocaleString()}</h3>
                                </div>
                                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><TrendingUp size={20} /></div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-emerald-600">
                                After Expenses
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Active Jobs</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.active_jobs}</h3>
                                </div>
                                <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><FileCheck size={20} /></div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-amber-600">
                                Real-time activity
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm text-slate-500 font-medium">Providers</p>
                                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.total_providers}</h3>
                                </div>
                                <div className="p-2 bg-purple-100 rounded-lg text-purple-600"><Users size={20} /></div>
                            </div>
                            <div className="mt-4 flex items-center text-xs text-purple-600">
                                Registered Talents
                            </div>
                        </div>
                    </div>

                    {/* Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4">Financial Breakdown</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Platform Fee', value: stats.gross_revenue },
                                                { name: 'Expenses', value: stats.total_expenses }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell key="cell-0" fill="#10B981" />
                                            <Cell key="cell-1" fill="#EF4444" />
                                        </Pie>
                                        <Tooltip />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex justify-center gap-6 mt-4 text-sm">
                                <div className="flex items-center"><div className="w-3 h-3 bg-emerald-500 rounded-full mr-2"></div> Revenue</div>
                                <div className="flex items-center"><div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div> Expenses</div>
                            </div>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4">Job Activity (Mock)</h3>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { name: 'Mon', jobs: 12 },
                                        { name: 'Tue', jobs: 19 },
                                        { name: 'Wed', jobs: 15 },
                                        { name: 'Thu', jobs: 22 },
                                        { name: 'Fri', jobs: 30 },
                                        { name: 'Sat', jobs: 45 },
                                        { name: 'Sun', jobs: 38 },
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                        <YAxis axisLine={false} tickLine={false} />
                                        <Tooltip />
                                        <Bar dataKey="jobs" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SUPPORT PLAYBOOK TAB (UPDATED WITH THAI CONTENT) */}
            {activeTab === 'support' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Tier 1: Self-Service & FAQ (Thai) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <div className="flex items-center mb-4">
                            <div className="bg-emerald-100 p-2 rounded-lg mr-3 text-emerald-600"><LifeBuoy size={24}/></div>
                            <div>
                                <h3 className="font-bold text-slate-800">ระดับที่ 1: คำตอบมาตรฐาน (Self-Service)</h3>
                                <p className="text-xs text-slate-500">คัดลอกคำตอบเพื่อตอบกลับลูกค้าได้ทันที</p>
                            </div>
                        </div>
                        <div className="space-y-3">
                            {cannedResponses.map((item, i) => (
                                <div key={i} className="border border-slate-100 rounded-lg p-3 hover:bg-slate-50 transition-colors group">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="font-bold text-xs text-slate-700">{item.q}</p>
                                        <button onClick={() => copyResponse(item.a)} className="text-slate-400 hover:text-emerald-600" title="Copy Answer">
                                            <Copy size={14}/>
                                        </button>
                                    </div>
                                    <p className="text-sm text-slate-600">{item.a}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Tier 2: Quick Fixes */}
                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex items-center mb-4">
                                <div className="bg-amber-100 p-2 rounded-lg mr-3 text-amber-600"><Zap size={24}/></div>
                                <div>
                                    <h3 className="font-bold text-slate-800">ระดับที่ 2: แก้ไขด้วยตนเอง (Manual Fix)</h3>
                                    <p className="text-xs text-slate-500">ทางลัดไปยังเครื่องมือจัดการปัญหา</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setActiveTab('kyc')} className="p-3 border border-slate-200 rounded-lg text-left hover:border-amber-400 hover:bg-amber-50 transition-all">
                                    <span className="block text-xs font-bold text-slate-500 uppercase mb-1">ยืนยันตัวตน</span>
                                    <span className="font-bold text-slate-800 flex items-center">ตรวจสอบ KYC <ArrowUpRight size={14} className="ml-1"/></span>
                                </button>
                                <button onClick={() => setActiveTab('finance')} className="p-3 border border-slate-200 rounded-lg text-left hover:border-amber-400 hover:bg-amber-50 transition-all">
                                    <span className="block text-xs font-bold text-slate-500 uppercase mb-1">โอนเงิน</span>
                                    <span className="font-bold text-slate-800 flex items-center">อนุมัติถอนเงิน <ArrowUpRight size={14} className="ml-1"/></span>
                                </button>
                                <button onClick={() => setActiveTab('users')} className="p-3 border border-slate-200 rounded-lg text-left hover:border-amber-400 hover:bg-amber-50 transition-all">
                                    <span className="block text-xs font-bold text-slate-500 uppercase mb-1">ข้อมูลผู้ใช้</span>
                                    <span className="font-bold text-slate-800 flex items-center">แก้ไข/แบน <ArrowUpRight size={14} className="ml-1"/></span>
                                </button>
                                <button onClick={() => setActiveTab('jobs')} className="p-3 border border-slate-200 rounded-lg text-left hover:border-amber-400 hover:bg-amber-50 transition-all">
                                    <span className="block text-xs font-bold text-slate-500 uppercase mb-1">เนื้อหา</span>
                                    <span className="font-bold text-slate-800 flex items-center">ลบงาน <ArrowUpRight size={14} className="ml-1"/></span>
                                </button>
                            </div>
                        </div>

                        {/* Tier 3 & 4: Investigation & Crisis */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex items-center mb-4">
                                <div className="bg-purple-100 p-2 rounded-lg mr-3 text-purple-600"><Activity size={24}/></div>
                                <div>
                                    <h3 className="font-bold text-slate-800">ระดับที่ 3: ตรวจสอบเชิงลึก (Investigation)</h3>
                                    <p className="text-xs text-slate-500">เช็คลิสต์สำหรับข้อพิพาทและการทุจริต</p>
                                </div>
                            </div>
                            <ul className="text-sm text-slate-600 space-y-2 list-disc pl-4 mb-6">
                                <li>ตรวจสอบ <strong>Audit Logs</strong> เพื่อดูกิจกรรมที่ผิดปกติ</li>
                                <li>ดูหลักฐาน <strong>Chat Logs</strong> ในแท็บ Disputes</li>
                                <li>เช็ค <strong>Transaction History</strong> ว่ามีการโอนซ้ำซ้อนหรือไม่</li>
                            </ul>

                            <div className="pt-4 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-red-500 uppercase mb-2 flex items-center"><Siren size={14} className="mr-1"/> ระดับที่ 4: วิกฤต (Crisis Mode)</h4>
                                <button 
                                    onClick={handleCrisisBanner}
                                    className="w-full py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-bold hover:bg-red-600 hover:text-white transition-colors"
                                >
                                    ประกาศ "ระบบปิดปรับปรุง" ทันที
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* STAFF MANAGEMENT TAB */}
            {activeTab === 'staff' && adminRole === 'super_admin' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 font-bold text-slate-700">
                            Active Employees
                        </div>
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Name</th>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Role</th>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                                    <th className="px-6 py-3 text-right font-medium text-slate-500">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {staffList.map(staff => (
                                    <tr key={staff.id}>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">{staff.name}</div>
                                            <div className="text-xs text-slate-500">{staff.email}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                staff.role === 'super_admin' ? 'bg-red-100 text-red-700' : 
                                                staff.role === 'accountant' ? 'bg-emerald-100 text-emerald-700' : 
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {staff.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            {staff.is_active ? 
                                                <span className="text-emerald-600 text-xs font-bold flex items-center"><Check size={12} className="mr-1"/> Active</span> : 
                                                <span className="text-slate-400 text-xs font-bold">Inactive</span>
                                            }
                                        </td>
                                        <td className="px-6 py-4 text-right space-x-2">
                                            <button 
                                                onClick={() => handleResetEmployeePassword(staff.id)}
                                                className="text-blue-500 hover:text-blue-700"
                                                title="Reset Password"
                                            >
                                                <Key size={18} />
                                            </button>
                                            <button 
                                                onClick={() => handleRemoveEmployee(staff.id)} 
                                                className="text-red-500 hover:text-red-700"
                                                title="Revoke Access"
                                            >
                                                <X size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 h-fit">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                            <Plus className="mr-2" size={20} /> Add Employee
                        </h3>
                        <form onSubmit={handleAddEmployee} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                                <input 
                                    type="text" 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                    required
                                    value={newEmployee.name}
                                    onChange={e => setNewEmployee({...newEmployee, name: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Access</label>
                                <input 
                                    type="email" 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                    required
                                    value={newEmployee.email}
                                    onChange={e => setNewEmployee({...newEmployee, email: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                                <input 
                                    type="password" 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                    required
                                    value={newEmployee.password}
                                    onChange={e => setNewEmployee({...newEmployee, password: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role</label>
                                <select 
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                    value={newEmployee.role}
                                    onChange={e => setNewEmployee({...newEmployee, role: e.target.value})}
                                >
                                    <option value="support">Support (Users/KYC)</option>
                                    <option value="accountant">Accountant (Finance)</option>
                                    <option value="super_admin">Super Admin (Full Access)</option>
                                </select>
                            </div>
                            <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg">
                                Create Account
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* INTERNAL ACCOUNTING TAB */}
            {activeTab === 'accounting' && (
                <div className="space-y-6">
                    {/* P&L Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-xl text-white shadow-lg">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-slate-400 text-sm font-medium">Net Profit</p>
                                    <h3 className="text-3xl font-bold mt-1">{stats.net_profit.toLocaleString()} ฿</h3>
                                </div>
                                <TrendingUp className="text-emerald-400" size={24} />
                            </div>
                            <p className="text-xs text-slate-400 mt-4">Gross Revenue - Expenses</p>
                        </div>
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-slate-500 text-sm font-medium">Total Expenses</p>
                                    <h3 className="text-3xl font-bold text-red-600 mt-1">{stats.total_expenses.toLocaleString()} ฿</h3>
                                </div>
                                <ArrowDownLeft className="text-red-500" size={24} />
                            </div>
                            <p className="text-xs text-slate-400 mt-4">Operational Costs</p>
                        </div>
                        <div className="bg-emerald-50 p-6 rounded-xl shadow-sm border border-emerald-100">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-emerald-700 text-sm font-medium">Cash on Hand</p>
                                    <h3 className="text-3xl font-bold text-emerald-900 mt-1">{stats.cash_on_hand.toLocaleString()} ฿</h3>
                                </div>
                                <DollarSign className="text-emerald-600" size={24} />
                            </div>
                            <p className="text-xs text-emerald-600 mt-4">Available for Withdrawal</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Record Expense Form */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                                <Archive className="mr-2" size={20} /> Record Business Expense
                            </h3>
                            <form onSubmit={handleRecordExpense} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
                                    <select 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        value={expenseForm.category}
                                        onChange={(e) => setExpenseForm({...expenseForm, category: e.target.value})}
                                    >
                                        <option value="personnel">Personnel (Salaries)</option>
                                        <option value="server">Server & Infrastructure</option>
                                        <option value="marketing">Marketing & Ads</option>
                                        <option value="office">Office (Rent/Utilities)</option>
                                        <option value="insurance">Business Insurance</option>
                                        <option value="depreciation">Depreciation</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        placeholder="0.00"
                                        value={expenseForm.amount}
                                        onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        placeholder="e.g. Monthly Server Cost"
                                        value={expenseForm.description}
                                        onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                                    />
                                </div>
                                <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2 rounded-lg">
                                    Record Expense
                                </button>
                            </form>
                        </div>

                        {/* Owner Withdrawal Form */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center text-emerald-600">
                                <Briefcase className="mr-2" size={20} /> Owner Withdrawal
                            </h3>
                            <div className="bg-emerald-50 p-4 rounded-lg mb-4 text-sm text-emerald-800">
                                Available Balance: <strong>{stats.cash_on_hand.toLocaleString()} ฿</strong>
                            </div>
                            <form onSubmit={handleOwnerWithdraw} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount</label>
                                    <input 
                                        type="number" 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        placeholder="0.00"
                                        value={withdrawForm.amount}
                                        onChange={(e) => setWithdrawForm({...withdrawForm, amount: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Note</label>
                                    <input 
                                        type="text" 
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        value={withdrawForm.description}
                                        onChange={(e) => setWithdrawForm({...withdrawForm, description: e.target.value})}
                                    />
                                </div>
                                <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg">
                                    Withdraw to Bank
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Ledger Table */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center">
                            <span>Internal Ledger (Recent Activity)</span>
                            <button 
                                onClick={() => exportToCSV(companyLedger, 'internal-ledger.csv')}
                                className="flex items-center text-xs bg-slate-100 text-slate-600 px-3 py-1 rounded hover:bg-slate-200 transition-colors"
                            >
                                <Download size={14} className="mr-1"/> Export CSV
                            </button>
                        </div>
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Date</th>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Type</th>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Category</th>
                                    <th className="px-6 py-3 text-left font-medium text-slate-500">Description</th>
                                    <th className="px-6 py-3 text-right font-medium text-slate-500">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {companyLedger.map(item => (
                                    <tr key={item.id}>
                                        <td className="px-6 py-3 text-slate-600">{new Date(item.date).toLocaleDateString()}</td>
                                        <td className="px-6 py-3 capitalize">
                                            {item.type === 'expense' ? (
                                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">EXPENSE</span>
                                            ) : (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">WITHDRAWAL</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-3 capitalize text-slate-700">
                                            {item.category === 'personnel' && <User size={14} className="inline mr-1"/>}
                                            {item.category === 'server' && <Server size={14} className="inline mr-1"/>}
                                            {item.category === 'marketing' && <Megaphone size={14} className="inline mr-1"/>}
                                            {item.category === 'office' && <Home size={14} className="inline mr-1"/>}
                                            {item.category === 'insurance' && <ShieldCheck size={14} className="inline mr-1"/>}
                                            {item.category}
                                        </td>
                                        <td className="px-6 py-3 text-slate-600">{item.description}</td>
                                        <td className={`px-6 py-3 text-right font-bold ${item.type === 'expense' ? 'text-red-600' : 'text-emerald-600'}`}>
                                            -{item.amount.toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                                {companyLedger.length === 0 && (
                                    <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No internal records yet</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* AUDIT LOGS TAB */}
            {activeTab === 'logs' && adminRole === 'super_admin' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-700 flex items-center">
                            <ShieldCheck className="mr-2" size={20} /> System Audit Logs
                        </h3>
                    </div>
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Date</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Admin</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Action</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.map(log => (
                                <tr key={log.id}>
                                    <td className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap">
                                        {new Date(log.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm font-medium text-slate-900">{log.admin_email}</div>
                                        <div className="text-xs text-slate-500 uppercase">{log.role}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold">{log.action}</span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600 font-mono">
                                        {log.details}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No logs found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'users' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input 
                                type="text" 
                                placeholder="Search by name, phone, or email..." 
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                value={userSearch}
                                onChange={(e) => setUserSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">User</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Role</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {usersList.map(u => (
                                <tr key={u.id}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <img src={u.avatar_url} className="w-10 h-10 rounded-full mr-3" alt="" />
                                            <div>
                                                <p className="font-bold text-slate-900">{u.name}</p>
                                                <p className="text-xs text-slate-500">{u.phone}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 capitalize text-sm text-slate-600">{u.role}</td>
                                    <td className="px-6 py-4">
                                        {u.is_banned ? (
                                            <span className="px-2 py-1 rounded bg-red-100 text-red-700 text-xs font-bold">BANNED</span>
                                        ) : (
                                            <span className="px-2 py-1 rounded bg-emerald-100 text-emerald-700 text-xs font-bold">ACTIVE</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                onClick={() => handleOpenRoleModal(u)}
                                                className="text-purple-600 hover:text-purple-800 text-sm font-bold flex items-center"
                                                title="Change Role"
                                            >
                                                <UserCog size={16} className="mr-1" /> Role
                                            </button>
                                            <button 
                                                onClick={() => handleViewUser(u.id)}
                                                className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center"
                                            >
                                                <Eye size={16} className="mr-1" /> Details
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {usersList.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No users found</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'jobs' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex items-center gap-4 bg-slate-50">
                        <h3 className="font-bold text-slate-700 mr-4">Job Monitor</h3>
                        <div className="relative flex-1 max-w-md">
                            <Search className="absolute left-3 top-3 text-slate-400" size={20} />
                            <input 
                                type="text" 
                                placeholder="Search jobs by title or category..." 
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
                                value={jobSearch}
                                onChange={(e) => setJobSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-3 text-left font-medium text-slate-500">Title</th>
                                <th className="px-6 py-3 text-left font-medium text-slate-500">Category</th>
                                <th className="px-6 py-3 text-left font-medium text-slate-500">Status</th>
                                <th className="px-6 py-3 text-left font-medium text-slate-500">Price</th>
                                <th className="px-6 py-3 text-right font-medium text-slate-500">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {jobsList.length === 0 ? (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No jobs found. Try searching.</td></tr>
                            ) : (
                                jobsList.map(job => (
                                    <tr key={job.id}>
                                        <td className="px-6 py-4 font-medium text-slate-900">{job.title}</td>
                                        <td className="px-6 py-4 text-slate-600">{job.category}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                                job.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                job.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                                job.status === 'dispute' ? 'bg-orange-100 text-orange-800' :
                                                'bg-blue-100 text-blue-700'
                                            }`}>
                                                {job.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-slate-700">{job.price.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleDeleteJob(job.id, job.title)}
                                                className="text-red-500 hover:text-red-700 flex items-center justify-end ml-auto"
                                            >
                                                <Trash2 size={16} className="mr-1" /> Force Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'kyc' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">User</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Role</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Documents</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {kycList.map(u => (
                                <tr key={u.id}>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <img src={u.avatar_url} className="w-10 h-10 rounded-full mr-3" alt="" />
                                            <div>
                                                <p className="font-bold text-slate-900">{u.name}</p>
                                                <p className="text-xs text-slate-500">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 capitalize text-sm text-slate-600">{u.role}</td>
                                    <td className="px-6 py-4 text-sm text-blue-600 underline cursor-pointer">View Docs</td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleApproveKYC(u.id, true)} className="p-2 bg-emerald-100 text-emerald-600 rounded hover:bg-emerald-200"><Check size={16} /></button>
                                        <button onClick={() => handleApproveKYC(u.id, false)} className="p-2 bg-red-100 text-red-600 rounded hover:bg-red-200"><X size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {kycList.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No pending verifications</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'finance' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <h3 className="font-bold text-slate-700">User Withdrawal Requests</h3>
                        <button 
                            onClick={() => exportToCSV(withdrawals, 'pending-withdrawals.csv')}
                            className="flex items-center text-xs bg-emerald-100 text-emerald-700 px-3 py-1 rounded hover:bg-emerald-200 transition-colors font-bold"
                        >
                            <Download size={14} className="mr-1"/> Export CSV
                        </button>
                    </div>
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">User ID</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Amount</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Bank Info</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {withdrawals.map(t => (
                                <tr key={t.id}>
                                    <td className="px-6 py-4 text-sm font-mono text-slate-600">{t.user_id}</td>
                                    <td className="px-6 py-4 font-bold text-slate-900">{t.amount.toLocaleString()}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{t.bank_info}</td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => handleApproveWithdrawal(t.id)}
                                            className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded hover:bg-emerald-700"
                                        >
                                            Mark Paid
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {withdrawals.length === 0 && (
                                <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No pending user withdrawals</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'disputes' && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                     <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Job</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Reporter</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Reason</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase">Evidence</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Decision</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {disputes.map(d => (
                                <tr key={d.id}>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-900">{d.jobTitle}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{d.reporterName}</td>
                                    <td className="px-6 py-4 text-sm text-slate-600">{d.reason}</td>
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => handleViewChat(d.job_id)}
                                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded flex items-center"
                                        >
                                            <MessageSquare size={14} className="mr-1"/> View Chat
                                        </button>
                                    </td>
                                    <td className="px-6 py-4 text-right space-x-2">
                                        <button onClick={() => handleResolveDispute(d.id, d.job_id, 'refund_user')} className="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded hover:bg-red-200">Refund User</button>
                                        <button onClick={() => handleResolveDispute(d.id, d.job_id, 'pay_provider')} className="px-3 py-1 bg-emerald-100 text-emerald-600 text-xs font-bold rounded hover:bg-emerald-200">Pay Provider</button>
                                    </td>
                                </tr>
                            ))}
                            {disputes.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No active disputes</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'settings' && adminRole === 'super_admin' && (
                <div className="space-y-6">
                    {/* My Security Section (NEW) */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Lock className="mr-2" size={20}/> My Security</h3>
                        <div className="flex gap-4">
                            <div className="flex-1 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <h4 className="font-bold text-sm text-slate-700 mb-2">Change My Password</h4>
                                <form onSubmit={handleChangeOwnPassword} className="space-y-3">
                                    <input 
                                        type="password" placeholder="Old Password" required
                                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                                        value={adminPassForm.old} onChange={e => setAdminPassForm({...adminPassForm, old: e.target.value})}
                                    />
                                    <input 
                                        type="password" placeholder="New Password" required
                                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                                        value={adminPassForm.new} onChange={e => setAdminPassForm({...adminPassForm, new: e.target.value})}
                                    />
                                    <input 
                                        type="password" placeholder="Confirm New Password" required
                                        className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                                        value={adminPassForm.confirm} onChange={e => setAdminPassForm({...adminPassForm, confirm: e.target.value})}
                                    />
                                    <button type="submit" className="bg-red-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-red-700 w-full">Update Password</button>
                                </form>
                            </div>
                            <div className="flex-1 bg-blue-50 p-4 rounded-lg border border-blue-200">
                                <h4 className="font-bold text-sm text-blue-800 mb-2 flex items-center"><ShieldCheck size={16} className="mr-1"/> Account Status</h4>
                                <p className="text-sm text-blue-700 mb-2">Logged in as: <strong>{adminEmail}</strong></p>
                                <p className="text-xs text-blue-600">Last login: Today</p>
                                <div className="mt-4 p-2 bg-white/50 rounded text-xs text-blue-800">
                                    <strong>Security Tip:</strong> We will send alerts to your email if suspicious login attempts are detected.
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* System Banners */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-800 mb-4 flex items-center"><Megaphone className="mr-2" size={20}/> Global Announcements</h3>
                        <form onSubmit={handleCreateBanner} className="space-y-4 mb-6 border-b border-slate-100 pb-6">
                            <input 
                                type="text" placeholder="Banner Title" 
                                value={newBanner.title} onChange={e => setNewBanner({...newBanner, title: e.target.value})}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg text-sm"
                            />
                            <div className="flex gap-4">
                                <select 
                                    className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                                    value={newBanner.type}
                                    onChange={e => setNewBanner({...newBanner, type: e.target.value})}
                                >
                                    <option value="info">Info (Blue)</option>
                                    <option value="warning">Warning (Orange)</option>
                                    <option value="promo">Promo (Green)</option>
                                </select>
                                <input 
                                    type="text" placeholder="Message Content" 
                                    value={newBanner.message} onChange={e => setNewBanner({...newBanner, message: e.target.value})}
                                    className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm"
                                />
                                <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-900">Post</button>
                            </div>
                        </form>
                        <div className="space-y-2">
                            {banners.map(b => (
                                <div key={b.id} className={`p-3 rounded-lg border flex justify-between items-center ${
                                    b.type === 'info' ? 'bg-blue-50 border-blue-200' : 
                                    b.type === 'warning' ? 'bg-orange-50 border-orange-200' : 
                                    'bg-green-50 border-green-200'
                                }`}>
                                    <div>
                                        <span className="font-bold text-sm">{b.title}</span>
                                        <span className="mx-2 text-slate-400">|</span>
                                        <span className="text-sm text-slate-600">{b.message}</span>
                                    </div>
                                    <button onClick={() => handleDeleteBanner(b.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={16}/></button>
                                </div>
                            ))}
                            {banners.length === 0 && <p className="text-slate-400 text-sm italic">No active banners</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Categories Config */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4">Job Categories</h3>
                            <div className="flex gap-2 mb-4">
                                <input 
                                    type="text" 
                                    placeholder="New Category Name" 
                                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                                    value={newCategory}
                                    onChange={e => setNewCategory(e.target.value)}
                                />
                                <button 
                                    onClick={handleAddCategory}
                                    className="bg-slate-800 text-white px-3 py-2 rounded-lg hover:bg-slate-700"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {categories.map(cat => (
                                    <div key={cat} className="bg-slate-100 px-3 py-1.5 rounded-lg text-sm text-slate-700 flex items-center group">
                                        <Tag size={14} className="mr-1.5 opacity-50" />
                                        {cat}
                                        <button onClick={() => handleRemoveCategory(cat)} className="ml-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-4">Create Promo Code</h3>
                            <form onSubmit={handleCreateVoucher} className="space-y-4">
                                <input 
                                    type="text" placeholder="Code (e.g. SUMMER50)" 
                                    value={newVoucher.code} onChange={e => setNewVoucher({...newVoucher, code: e.target.value})}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <input 
                                        type="number" placeholder="Discount Amount" 
                                        value={newVoucher.discount} onChange={e => setNewVoucher({...newVoucher, discount: Number(e.target.value)})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                    />
                                    <input 
                                        type="number" placeholder="Min Spend" 
                                        value={newVoucher.min} onChange={e => setNewVoucher({...newVoucher, min: Number(e.target.value)})}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                    />
                                </div>
                                <input 
                                    type="text" placeholder="Description" 
                                    value={newVoucher.desc} onChange={e => setNewVoucher({...newVoucher, desc: e.target.value})}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg"
                                />
                                <button type="submit" className="w-full py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900">Create Voucher</button>
                            </form>

                            <div className="mt-6">
                                <h4 className="font-bold text-sm text-slate-500 mb-2">Active Vouchers</h4>
                                <div className="space-y-2">
                                    {vouchers.map(v => (
                                        <div key={v.code} className="flex justify-between items-center bg-slate-50 p-2 rounded text-sm">
                                            <span className="font-mono font-bold">{v.code}</span>
                                            <span className="text-emerald-600">-{v.discount_amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
