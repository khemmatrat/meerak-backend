
import React from 'react';
import { LayoutDashboard, Users, Server, Settings, Activity, Smartphone, Bell, Image, Briefcase, Network, Database, ShieldAlert, ShieldCheck, Router, Cpu, Lock, LifeBuoy, FileText, TrendingUp, BookOpen, Code, Scale, Banknote, Landmark, UserCog, FileCheck, Wallet, ScrollText, Shield, GraduationCap } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  /** Audit Logs แสดงเฉพาะเมื่อ role === ADMIN */
  currentUserRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, currentUserRole }) => {
  const isAdmin = (currentUserRole || "").toUpperCase() === "ADMIN";
  const menuItems = [
    { id: 'dashboard', label: 'ภาพรวมระบบ', icon: LayoutDashboard },
    { type: 'header', label: 'Security & Integrity' },
    { id: 'security-center', label: 'Security Center', icon: Lock }, 
    { id: 'financial-audit', label: 'Financial & Fraud', icon: ShieldCheck },
    { id: 'financial-dashboard', label: 'Financial Dashboard', icon: Wallet },
    { id: 'insurance-manager', label: 'จัดการประกันงาน (Insurance)', icon: Shield },
    { id: 'kyc-review', label: 'KYC Review', icon: FileCheck },
    { id: 'audit-logs', label: 'Audit Logs', icon: ScrollText },
    { id: 'legal-compliance', label: 'Legal & Compliance', icon: Scale },
    { id: 'api-gateway', label: 'API Gateway & WAF', icon: Router },
    { type: 'header', label: 'Operations' },
    { id: 'job-ops', label: 'Job Operations', icon: Briefcase },
    { id: 'user-payouts', label: 'User Payout Requests', icon: Banknote },
    { id: 'background-workers', label: 'Worker Queues', icon: Cpu },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'staff-management', label: 'Staff & Access', icon: UserCog }, // NEW
    { type: 'header', label: 'Strategy & Growth' },
    { id: 'financial-strategy', label: 'Financial Strategy', icon: Landmark },
    { id: 'reports', label: 'Reports & Export', icon: FileText }, 
    { type: 'header', label: 'Customer Service' },
    { id: 'support-center', label: 'Support & Chat', icon: LifeBuoy }, 
    { type: 'header', label: 'Infrastructure' },
    { id: 'cluster', label: 'Cluster Health', icon: Network },
    { id: 'resource-scaling', label: 'Resource & Cost', icon: TrendingUp },
    { id: 'sharding', label: 'Database Shards', icon: Database },
    { id: 'dr-center', label: 'Disaster Recovery', icon: ShieldAlert },
    { type: 'header', label: 'Training Center' },
    { id: 'training-center', label: 'ข้อสอบ & คะแนน', icon: GraduationCap },
    { type: 'header', label: 'App Management' },
    { id: 'push-notifications', label: 'Push Notifications', icon: Bell },
    { id: 'content', label: 'จัดการแบนเนอร์', icon: Image },
    { id: 'app-config', label: 'ตั้งค่า Mobile App', icon: Smartphone },
    { type: 'footer', label: 'System' },
    { id: 'logs', label: 'System Logs', icon: Activity },
    { id: 'settings', label: 'ตั้งค่าระบบ', icon: Settings },
    { id: 'docs', label: 'คู่มือการใช้งาน', icon: BookOpen },
    { id: 'integration-help', label: 'System Integration', icon: Code },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-full shadow-xl">
      <div className="p-6 border-b border-slate-800 flex items-center gap-3">
        <div className="bg-indigo-500 p-2 rounded-lg">
          <Server size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Nexus Core</h1>
          <p className="text-xs text-slate-400">Backend Control V2.4</p>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item, idx) => {
          if (item.type === 'header') {
             return <div key={`h-${idx}`} className="px-4 pt-4 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</div>;
          }
          if (item.type === 'footer') {
             return <div key={`f-${idx}`} className="my-2 border-t border-slate-800"></div>;
          }
          
          if (item.id === "audit-logs" && !isAdmin) return null;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id!)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group ${
                isActive 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {item.icon && <item.icon size={18} className={isActive ? 'text-indigo-200' : 'text-slate-500 group-hover:text-white'} />}
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800 rounded-xl p-4">
          <p className="text-xs text-slate-400 mb-2">สถานะเซิร์ฟเวอร์</p>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-sm font-semibold text-emerald-400">Operational</span>
          </div>
          <div className="text-xs text-slate-500">Protection: High</div>
        </div>
      </div>
    </aside>
  );
};
