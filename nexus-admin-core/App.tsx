
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { MobileConfigView } from './components/MobileConfigView';
import { UserTableView } from './components/UserTableView';
import { UserManagementView } from './components/UserManagementView';
import { PushNotificationView } from './components/PushNotificationView';
import { ContentManagerView } from './components/ContentManagerView';
import { SystemLogsView } from './components/SystemLogsView';
import { SystemSettingsView } from './components/SystemSettingsView';
import { JobOperationsView } from './components/JobOperationsView';
import { ClusterHealthView } from './components/ClusterHealthView';
import { DisasterRecoveryView } from './components/DisasterRecoveryView';
import { DatabaseShardingView } from './components/DatabaseShardingView';
import { FinancialAuditView } from './components/FinancialAuditView';
import { ApiGatewayView } from './components/ApiGatewayView';
import { BackgroundWorkerView } from './components/BackgroundWorkerView';
import { SecurityCenterView } from './components/SecurityCenterView';
import { SupportTicketView } from './components/SupportTicketView';
import { ReportCenterView } from './components/ReportCenterView';
import { ResourceScalingView } from './components/ResourceScalingView';
import { DocumentationView } from './components/DocumentationView';
import { IntegrationHelpView } from './components/IntegrationHelpView';
import { LegalComplianceView } from './components/LegalComplianceView'; 
import { UserPayoutView } from './components/UserPayoutView'; 
import { FinancialStrategyView } from './components/FinancialStrategyView'; 
import { StaffManagementView } from './components/StaffManagementView';
import { KycReviewView } from './components/KycReviewView';
import { FinancialDashboardView } from './components/FinancialDashboardView';
import { AuditLogsView } from './components/AuditLogsView';
import { LoginView } from './components/LoginView';
import { Bell, Search, LogOut } from 'lucide-react';
import { AdminUser } from './types';
import { setAdminToken } from './services/adminApi';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(null);

  // AUTH GUARD: If no user is logged in, show Login View
  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout securely?')) {
      setAdminToken(null);
      setCurrentUser(null);
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView />;
      case 'users':
        return <UserManagementView />;
      case 'app-config':
        return <MobileConfigView />;
      case 'push-notifications':
        return <PushNotificationView />;
      case 'content':
        return <ContentManagerView />;
      case 'logs':
        return <SystemLogsView />;
      case 'settings':
        return <SystemSettingsView />;
      case 'job-ops':
        return <JobOperationsView />;
      case 'cluster':
        return <ClusterHealthView />;
      case 'resource-scaling':
        return <ResourceScalingView />;
      case 'dr-center':
        return <DisasterRecoveryView />;
      case 'sharding':
        return <DatabaseShardingView />;
      case 'financial-audit':
        // PASS USER ROLE FOR STRICT SECURITY CHECK
        return <FinancialAuditView currentUserRole={currentUser.role} />;
      case 'api-gateway':
        return <ApiGatewayView />;
      case 'background-workers':
        return <BackgroundWorkerView />;
      case 'security-center':
        return <SecurityCenterView />;
      case 'support-center': 
        return <SupportTicketView />;
      case 'reports': 
        return <ReportCenterView />;
      case 'docs':
        return <DocumentationView />;
      case 'integration-help':
        return <IntegrationHelpView />;
      case 'legal-compliance':
        return <LegalComplianceView />;
      case 'user-payouts':
        return <UserPayoutView />;
      case 'financial-strategy':
        return <FinancialStrategyView />;
      case 'staff-management':
        return <StaffManagementView />;
      case 'kyc-review':
        return <KycReviewView />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <h2 className="text-xl font-medium">Coming Soon</h2>
            <p>Module {currentView} is under development.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* Sidebar */}
      <Sidebar currentView={currentView} setView={setCurrentView} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-4 w-96">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search anything..." 
                className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm w-full focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button className="relative text-slate-500 hover:text-indigo-600 transition-colors">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              <div className="text-right hidden md:block">
                <p className="text-sm font-semibold text-slate-800">{currentUser.name}</p>
                <p className="text-xs text-slate-500">{currentUser.role.replace('_', ' ')}</p>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                <img src={currentUser.avatar} alt="Profile" className="w-full h-full object-cover" />
              </div>
              <button 
                onClick={handleLogout}
                className="ml-2 p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors" 
                title="Logout"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-7xl mx-auto h-full flex flex-col">
            <div className="mb-6 shrink-0">
              <h1 className="text-2xl font-bold text-slate-800 capitalize">
                {currentView === 'docs' ? 'System Manual' : 
                 currentView === 'integration-help' ? 'System Integration' :
                 currentView === 'staff-management' ? 'Staff & Access' :
                 currentView === 'kyc-review' ? 'KYC Review' :
                 currentView === 'financial-dashboard' ? 'Financial Dashboard' :
                 currentView === 'audit-logs' ? 'Audit Logs' :
                 currentView.replace(/-/g, ' ')}
              </h1>
              <p className="text-slate-500">Overview and management for {currentView}</p>
            </div>
            
            <div className="flex-1">
              {renderView()}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
