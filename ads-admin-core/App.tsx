import React, { useEffect, useState } from "react";
import {
  BarChart3,
  Megaphone,
  ShieldCheck,
  Wallet,
  LogOut,
  LayoutDashboard,
  Users,
  Receipt,
} from "lucide-react";
import { LoginView } from "./components/LoginView";
import { OverviewView } from "./components/OverviewView";
import { CampaignsView } from "./components/CampaignsView";
import { ModerationView } from "./components/ModerationView";
import { BillingView } from "./components/BillingView";
import { TrustView } from "./components/TrustView";
import { OutcomeAuditView } from "./components/OutcomeAuditView";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  fetchAdsAdminSession,
  getAdsAdminToken,
  setAdsAdminToken,
} from "./services/adsAdminApi";

const ADS_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "ADS_MANAGER"]);

type ViewId = "overview" | "campaigns" | "moderation" | "billing" | "trust" | "outcomes";

const MENU: Array<{ id: ViewId; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "moderation", label: "Moderation", icon: ShieldCheck },
  { id: "outcomes", label: "Outcomes", icon: Receipt },
  { id: "billing", label: "Billing", icon: Wallet },
  { id: "trust", label: "Trust", icon: Users },
];

const App: React.FC = () => {
  const [user, setUser] = useState<{ email: string; role: string; name?: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<ViewId>("overview");

  useEffect(() => {
    const tok = getAdsAdminToken();
    if (!tok) {
      setReady(true);
      return;
    }
    fetchAdsAdminSession()
      .then((s) => {
        const role = String(s.user?.role || "").toUpperCase();
        if (ADS_ROLES.has(role)) setUser({ email: s.user.email, role, name: s.user.name });
        else setAdsAdminToken(null);
      })
      .catch(() => setAdsAdminToken(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="p-8 text-slate-500">Loading...</div>;

  if (!user) {
    return (
      <LoginView
        onLogin={(u) => {
          const role = u.role.toUpperCase();
          if (!ADS_ROLES.has(role)) {
            setAdsAdminToken(null);
            alert("ต้องมี role ADS_MANAGER, ADMIN หรือ SUPER_ADMIN");
            return;
          }
          setUser({ ...u, role });
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-56 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-400" />
            <span className="font-bold text-sm">Ads Admin</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Route 2</p>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {MENU.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setView(m.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                view === m.id ? "bg-indigo-600" : "hover:bg-slate-800"
              }`}
            >
              <m.icon size={16} />
              {m.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400">
          <p className="truncate">{user.email}</p>
          <p>{user.role}</p>
          <button
            type="button"
            className="mt-2 flex items-center gap-1 text-slate-300 hover:text-white"
            onClick={() => {
              setAdsAdminToken(null);
              setUser(null);
            }}
          >
            <LogOut size={14} /> ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 md:p-8 overflow-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            {MENU.find((m) => m.id === view)?.label}
          </h1>
          <p className="text-slate-500 text-sm">AQOND Marketplace Ads — Production Console</p>
        </header>
        <ErrorBoundary key={view}>
          {view === "overview" && <OverviewView />}
          {view === "campaigns" && <CampaignsView />}
          {view === "moderation" && <ModerationView />}
          {view === "outcomes" && <OutcomeAuditView />}
          {view === "billing" && <BillingView />}
          {view === "trust" && <TrustView />}
        </ErrorBoundary>
      </main>
    </div>
  );
};

export default App;
