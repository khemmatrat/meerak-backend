import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Shield,
  Video,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Play,
  Clock,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  LogOut,
  RefreshCw,
  FileVideo,
  CreditCard,
  Users,
  Briefcase,
  Activity,
  X,
  Star,
  Send,
} from 'lucide-react';
import {
  getProvidersForReview,
  getProvidersAll,
  updateProviderStatus,
  getReviewLogs,
  getJobsAll,
  getStats,
  NeedsInfoRequiresNoteError,
  type ProviderStatus,
} from '../services/firebaseService';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'aqond2025';

const Toast = ({
  message,
  onDismiss,
  visible,
  isLoading,
}: {
  message: string;
  onDismiss: () => void;
  visible: boolean;
  isLoading?: boolean;
}) =>
  visible ? (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-5 py-3 rounded-xl font-medium shadow-lg border ${
        isLoading
          ? 'bg-amber-600/95 text-white border-amber-400/40'
          : 'bg-lime-600/95 text-white border-lime-400/40'
      }`}
      role="alert"
    >
      {isLoading ? (
        <RefreshCw size={18} className="animate-spin" />
      ) : (
        <Send size={18} />
      )}
      {message}
      <button
        onClick={onDismiss}
        className="ml-2 p-1 rounded hover:bg-white/20 transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  ) : null;

// Deep Obsidian & Cyber Lime theme
const colors = {
  obsidian: '#0a0a0f',
  obsidianLight: '#12121a',
  obsidianCard: 'rgba(18, 18, 26, 0.8)',
  lime: '#84cc16',
  limeDim: 'rgba(132, 204, 22, 0.2)',
  limeBorder: 'rgba(132, 204, 22, 0.4)',
};

const StatusBadge = ({ status }: { status?: string }) => {
  const s = status || 'pending_review';
  const styles: Record<string, string> = {
    pending_review: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
    verified: 'bg-lime-500/20 text-lime-400 border-lime-500/40',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/40',
    needs_info: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
  };
  const labels: Record<string, string> = {
    pending_review: 'รอตรวจ',
    verified: 'Platinum',
    rejected: 'ปฏิเสธ',
    needs_info: 'ขอข้อมูลเพิ่ม',
  };
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-medium border ${styles[s] || 'bg-slate-500/20 text-slate-400'}`}
    >
      {labels[s] || s}
    </span>
  );
};

const VideoThumbnail = ({
  url,
  onClick,
  className,
}: {
  url: string;
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative rounded-lg overflow-hidden bg-black group cursor-pointer block w-full ${className || 'aspect-video'}`}
  >
    <video
      src={url}
      className="w-full h-full object-cover"
      preload="metadata"
      muted
      playsInline
      onLoadedData={(e) => {
        const v = e.currentTarget;
        v.currentTime = 1;
      }}
    />
    <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/60 transition-colors">
      <Play className="w-10 h-10 text-white drop-shadow-lg" />
    </div>
  </button>
);

const StarRating = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) => (
  <div className="flex items-center justify-between gap-3 py-2">
    <span className="text-slate-400 text-sm">{label}</span>
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5 rounded transition-colors hover:scale-110"
        >
          <Star
            size={18}
            className={
              star <= value
                ? 'fill-amber-400 text-amber-400'
                : 'fill-slate-600 text-slate-600'
            }
          />
        </button>
      ))}
    </div>
  </div>
);

const CHECKLIST_CATEGORIES = {
  skill: [
    { key: 'proficiency', label: 'Proficiency' },
    { key: 'tools', label: 'Tools' },
    { key: 'finishQuality', label: 'Finish Quality' },
  ],
  presence: [
    { key: 'attire', label: 'Attire' },
    { key: 'communication', label: 'Communication' },
    { key: 'confidence', label: 'Confidence' },
  ],
} as const;

type ChecklistScores = Record<string, number>;

const VideoPlayerModal = ({
  url,
  providerName,
  providerId,
  canTakeAction,
  onClose,
  onApprove,
  onRequestMoreInfo,
  onReject,
}: {
  url: string;
  providerName?: string;
  providerId?: string;
  canTakeAction?: boolean;
  onClose: () => void;
  onApprove?: (note?: string) => void;
  onRequestMoreInfo?: (note?: string) => void;
  onReject?: () => void;
}) => {
  const [scores, setScores] = useState<ChecklistScores>({
    proficiency: 0,
    tools: 0,
    finishQuality: 0,
    attire: 0,
    communication: 0,
    confidence: 0,
  });
  const [adminNotes, setAdminNotes] = useState('');

  const allScores = Object.values(scores);
  const allRated = allScores.every((s) => s > 0);
  const allHighScore = allRated && allScores.every((s) => s >= 4);
  const hasLowScore = allRated && allScores.some((s) => s < 4);

  const updateScore = (key: string, value: number) => {
    setScores((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden bg-[#0a0a0f] border border-lime-500/30 shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-700/50 flex items-center justify-between shrink-0">
          <span className="text-lime-400 font-medium truncate">
            {providerName ? `Work Story — ${providerName}` : 'Work Story'}
          </span>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          {/* Left: Video */}
          <div className="flex-1 min-w-0 bg-black aspect-video md:aspect-auto md:min-h-[320px]">
            <video
              src={url}
              controls
              className="w-full h-full object-contain"
              playsInline
              autoPlay
            />
          </div>

          {/* Right: Scoring & Checklist */}
          <div
            className="w-full md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-slate-700/50 flex flex-col overflow-y-auto"
            style={{ backgroundColor: colors.obsidianCard }}
          >
            <div className="p-4 border-b border-slate-700/50">
              <h3 className="text-sm font-semibold text-white">Platinum Verification Checklist</h3>
            </div>
            <div className="p-4 space-y-4 flex-1">
              <div>
                <p className="text-xs font-medium text-lime-400/80 mb-2">Skill (1–5 Stars)</p>
                <div className="space-y-0">
                  {CHECKLIST_CATEGORIES.skill.map(({ key, label }) => (
                    <StarRating
                      key={key}
                      value={scores[key] ?? 0}
                      onChange={(v) => updateScore(key, v)}
                      label={label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-lime-400/80 mb-2">Presence (1–5 Stars)</p>
                <div className="space-y-0">
                  {CHECKLIST_CATEGORIES.presence.map(({ key, label }) => (
                    <StarRating
                      key={key}
                      value={scores[key] ?? 0}
                      onChange={(v) => updateScore(key, v)}
                      label={label}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">
                  Admin Notes (internal)
                </label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="e.g. Good skills, but video is a bit dark"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800/80 border border-slate-600 text-slate-200 text-sm placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {canTakeAction && providerId && (
              <div className="p-4 border-t border-slate-700/50 space-y-3">
                {allHighScore && (
                  <p className="text-xs text-amber-400/90 font-medium">
                    ✓ All categories 4+ — Ready for Platinum
                  </p>
                )}
                {hasLowScore && !allHighScore && (
                  <p className="text-xs text-cyan-400/90 font-medium">
                    Consider requesting a better video
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => onApprove?.(adminNotes || undefined)}
                    className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                      allHighScore
                        ? 'bg-amber-500/30 text-amber-400 border-2 border-amber-400/60 hover:bg-amber-500/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                        : 'bg-lime-600/20 text-lime-400 border border-lime-500/40 hover:bg-lime-600/30'
                    }`}
                  >
                    <CheckCircle2 size={16} />
                    Approve as Platinum
                  </button>
                  <button
                    onClick={() => onRequestMoreInfo?.(adminNotes || undefined)}
                    disabled={!adminNotes?.trim()}
                    title={!adminNotes?.trim() ? 'กรุณากรอก Admin Notes ก่อน' : undefined}
                    className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg font-medium text-sm ${
                      !adminNotes?.trim()
                        ? 'bg-slate-600/30 text-slate-500 border border-slate-600 cursor-not-allowed'
                        : hasLowScore && !allHighScore
                          ? 'bg-cyan-500/30 text-cyan-400 border-2 border-cyan-400/60'
                          : 'bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-600/30'
                    }`}
                  >
                    <MessageCircle size={16} />
                    Request More Info
                  </button>
                  <button
                    onClick={onReject}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30 font-medium text-sm"
                  >
                    <XCircle size={16} />
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminLogin = ({ onSuccess }: { onSuccess: () => void }) => {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass === ADMIN_PASSWORD) onSuccess();
    else setErr('รหัสผ่านไม่ถูกต้อง');
  };
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ backgroundColor: colors.obsidian }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-8 shadow-2xl backdrop-blur-xl"
        style={{
          backgroundColor: colors.obsidianCard,
          borderColor: colors.limeBorder,
        }}
      >
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-10 h-10 text-lime-400" />
          <h1 className="text-xl font-bold text-white">AQOND Command Center</h1>
        </div>
        <p className="text-slate-400 text-sm mb-6">Admin Dashboard — เข้าสู่ระบบด้วยรหัสผ่าน</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={pass}
            onChange={(e) => (setPass(e.target.value), setErr(''))}
            placeholder="รหัสผ่าน"
            className="w-full px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-600 text-white placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent"
            autoFocus
          />
          {err && <p className="text-red-400 text-sm">{err}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-lime-600 hover:bg-lime-500 text-slate-950 font-semibold transition-colors"
          >
            เข้าสู่ระบบ
          </button>
        </form>
      </div>
    </div>
  );
};

export default function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tab, setTab] = useState<'talent' | 'jobs' | 'risk' | 'growth' | 'logs'>('talent');
  const [providers, setProviders] = useState<Array<Record<string, unknown>>>([]);
  const [providersAll, setProvidersAll] = useState<Array<Record<string, unknown>>>([]);
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [videoModal, setVideoModal] = useState<{
    url: string;
    providerName?: string;
    providerId?: string;
    canTakeAction?: boolean;
  } | null>(null);
  const [toast, setToast] = useState<{ message: string; visible: boolean; isLoading?: boolean }>({
    message: '',
    visible: false,
    isLoading: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [prov, provAll, jbs, lgs, st] = await Promise.all([
        getProvidersForReview(),
        getProvidersAll(),
        getJobsAll(),
        getReviewLogs(30),
        getStats(),
      ]);
      setProviders(prov as Array<Record<string, unknown>>);
      setProvidersAll(provAll as Array<Record<string, unknown>>);
      setJobs(jbs as Array<Record<string, unknown>>);
      setLogs(lgs as Array<Record<string, unknown>>);
      setStats(st as Record<string, number>);
    } catch (e) {
      console.error('Load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) load();
  }, [isLoggedIn]);

  if (!isLoggedIn) {
    return <AdminLogin onSuccess={() => setIsLoggedIn(true)} />;
  }

  const showToast = (message: string, duration = 4000, isLoading = false) => {
    setToast({ message, visible: true, isLoading });
    if (duration < 999999) {
      setTimeout(() => setToast((t) => ({ ...t, visible: false, isLoading: false })), duration);
    }
  };

  const handleProviderAction = async (
    providerId: string,
    status: ProviderStatus,
    providerName?: string,
    note?: string
  ) => {
    let finalNote = note;
    if (status === 'needs_info' && !note?.trim()) {
      const prompted = window.prompt(
        'กรุณาระบุรายละเอียดที่ต้องการเพิ่มเติม (Admin Notes):\n\nProvider จะได้รับข้อความนี้โดยตรง',
        ''
      );
      if (!prompted?.trim()) {
        showToast('กรุณาระบุรายละเอียดที่ต้องการเพิ่มเติมก่อนส่ง (Admin Notes)', 5000);
        return;
      }
      finalNote = prompted.trim();
    }
    setActionLoading(providerId);
    showToast('Sending automated response...', 999999, true);
    try {
      await updateProviderStatus(providerId, status, 'Admin', finalNote, providerName);
      await load();
      setToast((t) => ({ ...t, visible: false, isLoading: false }));
      setTimeout(() => showToast('Success: Message sent automatically'), 100);
    } catch (e) {
      setToast((t) => ({ ...t, visible: false, isLoading: false }));
      if (e instanceof NeedsInfoRequiresNoteError) {
        showToast('กรุณาระบุรายละเอียดที่ต้องการเพิ่มเติมก่อนส่ง (Admin Notes)', 6000);
      } else {
        console.error('Action error:', e);
        showToast('เกิดข้อผิดพลาด กรุณาลองใหม่', 4000);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const displayProviders = filter === 'pending' ? providers : providersAll;
  const toDate = (v: unknown): Date => {
    if (v instanceof Date) return v;
    if (v && typeof v === 'object' && 'toDate' in v) return (v as { toDate: () => Date }).toDate();
    return new Date(v as number);
  };
  const overdueJobs = jobs.filter((j) => {
    const est = (j.estimatedHours as number) || 0;
    const created = toDate(j.createdAt);
    const hoursSince = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return j.status === 'active' && hoursSince > est * 1.2;
  });
  const needsInfoCount = providersAll.filter((p) => p.status === 'needs_info').length;
  const disputedCount = jobs.filter((j) => j.status === 'disputed').length;

  const formatLogEntry = (l: Record<string, unknown>) => {
    const admin = String(l.adminName || 'Admin');
    const action =
      l.action === 'verified' ? 'approved' : l.action === 'rejected' ? 'rejected' : 'requested more info from';
    const provider = String(l.providerName || l.providerId || 'Provider');
    const time =
      l.timestamp instanceof Date
        ? l.timestamp.toLocaleString('th-TH')
        : String(l.timestamp);
    return `[${admin}] ${action} [${provider}] at ${time}`;
  };

  return (
    <div className="min-h-screen text-slate-200" style={{ backgroundColor: colors.obsidian }}>
      {/* Header */}
      <header
        className="sticky top-0 z-50 border-b backdrop-blur-xl"
        style={{ borderColor: colors.limeBorder, backgroundColor: 'rgba(10,10,15,0.95)' }}
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-lime-400" />
            <div>
              <h1 className="text-lg font-bold text-white">AQOND Command Center</h1>
              <p className="text-xs text-slate-400">Platinum Quality Control</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-red-600/20 text-slate-300 hover:text-red-400"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <nav className="container mx-auto px-4 flex gap-1 overflow-x-auto pb-2">
          {[
            { id: 'talent', label: 'Talent Approve', icon: Video },
            { id: 'jobs', label: 'Job Protection', icon: CreditCard },
            { id: 'risk', label: 'Risk Monitor', icon: AlertTriangle },
            { id: 'growth', label: 'Growth Metrics', icon: BarChart3 },
            { id: 'logs', label: 'Review Log', icon: FileVideo },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === id
                  ? 'bg-lime-500/20 text-lime-400 border'
                  : 'bg-slate-800/50 text-slate-400 hover:text-white border border-transparent'
              }`}
              style={tab === id ? { borderColor: colors.limeBorder } : {}}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main className="container mx-auto px-4 py-6">
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-8 h-8 text-lime-400 animate-spin" />
          </div>
        )}

        {!loading && tab === 'talent' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Provider Verification Table</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                    filter === 'pending'
                      ? 'bg-lime-600 text-slate-950'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  Pending ({providers.length})
                </button>
                <button
                  onClick={() => setFilter('all')}
                  className={`px-6 py-2 rounded-xl text-sm font-medium transition-colors ${
                    filter === 'all'
                      ? 'bg-lime-600 text-slate-950'
                      : 'bg-slate-800/80 text-slate-400 hover:text-white'
                  }`}
                >
                  All Providers
                </button>
              </div>
            </div>
            <div
              className="overflow-x-auto rounded-xl border overflow-hidden backdrop-blur-xl"
              style={{
                backgroundColor: colors.obsidianCard,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              {displayProviders.length === 0 ? (
                <div className="p-12 text-center text-slate-500">ไม่มีผู้สมัครที่รอตรวจ</div>
              ) : (
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left p-4 text-slate-400 font-medium text-sm">Name</th>
                      <th className="text-left p-4 text-slate-400 font-medium text-sm">Profession</th>
                      <th className="text-left p-4 text-slate-400 font-medium text-sm">Video Preview</th>
                      <th className="text-left p-4 text-slate-400 font-medium text-sm">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayProviders.map((p) => (
                      <tr key={String(p.id)} className="border-b border-slate-700/30">
                        <td className="p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white">{String(p.name)}</span>
                            <StatusBadge status={String(p.status ?? 'pending_review')} />
                          </div>
                          <p className="text-slate-500 text-sm mt-1">
                            โทร: {String(p.phone)}
                            {p.portfolioLink && ` • ${String(p.portfolioLink)}`}
                          </p>
                        </td>
                        <td className="p-4 text-slate-300 text-sm">
                          {String(p.profession)} • {String(p.experience)}
                        </td>
                        <td className="p-4">
                          {(p.portfolioVideos as string[])?.length ? (
                            <div className="flex gap-2 flex-wrap">
                              {(p.portfolioVideos as string[]).slice(0, 2).map((url, i) => (
                                <VideoThumbnail
                                  key={i}
                                  url={url}
                                  onClick={() =>
                                    setVideoModal({
                                      url,
                                      providerName: String(p.name),
                                      providerId: p.id as string,
                                      canTakeAction: p.status === 'pending_review',
                                    })
                                  }
                                  className="w-24 h-16"
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-500 text-sm">ไม่มีวิดีโอ</span>
                          )}
                        </td>
                        <td className="p-4">
                          {p.status === 'pending_review' && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  handleProviderAction(
                                    p.id as string,
                                    'verified',
                                    String(p.name)
                                  )
                                }
                                disabled={actionLoading === p.id}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-lime-600/20 text-lime-400 border border-lime-500/40 hover:bg-lime-600/30 font-medium text-sm disabled:opacity-50"
                              >
                                <CheckCircle2 size={16} />
                                Approve as Platinum
                              </button>
                              <button
                                onClick={() =>
                                  handleProviderAction(
                                    p.id as string,
                                    'needs_info',
                                    String(p.name)
                                  )
                                }
                                disabled={actionLoading === p.id}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 hover:bg-cyan-600/30 font-medium text-sm disabled:opacity-50"
                              >
                                <MessageCircle size={16} />
                                Request More Info
                              </button>
                              <button
                                onClick={() =>
                                  handleProviderAction(
                                    p.id as string,
                                    'rejected',
                                    String(p.name)
                                  )
                                }
                                disabled={actionLoading === p.id}
                                className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30 font-medium text-sm disabled:opacity-50"
                              >
                                <XCircle size={16} />
                                Reject
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {!loading && tab === 'jobs' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Job Protection Monitor</h2>
            {/* Risk Summary Card */}
            <div
              className="rounded-xl border p-6 grid grid-cols-1 md:grid-cols-3 gap-4 backdrop-blur-xl"
              style={{
                backgroundColor: colors.obsidianCard,
                borderColor: colors.limeBorder,
              }}
            >
              <div className="flex items-center gap-4">
                <Activity className="w-10 h-10 text-lime-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{overdueJobs.length}</p>
                  <p className="text-sm text-slate-400">Overdue</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <MessageCircle className="w-10 h-10 text-cyan-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{needsInfoCount}</p>
                  <p className="text-sm text-slate-400">Needs Info</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <AlertTriangle className="w-10 h-10 text-red-400" />
                <div>
                  <p className="text-2xl font-bold text-white">{disputedCount}</p>
                  <p className="text-sm text-slate-400">Disputed</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className="rounded-xl border p-6 backdrop-blur-xl"
                style={{
                  backgroundColor: colors.obsidianCard,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <CreditCard className="w-8 h-8 text-lime-400" />
                  <h3 className="font-semibold text-white">Insurance Status</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">งานทั้งหมด</span>
                    <span className="text-white font-bold">{stats.totalJobs ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Held</span>
                    <span className="text-lime-400">
                      {jobs.filter((j) => j.insuranceStatus === 'held').length}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Released</span>
                    <span className="text-emerald-400">
                      {jobs.filter((j) => j.insuranceStatus === 'released').length}
                    </span>
                  </div>
                </div>
              </div>
              <div
                className="rounded-xl border p-6 backdrop-blur-xl"
                style={{
                  backgroundColor: colors.obsidianCard,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <Clock className="w-8 h-8 text-lime-400" />
                  <h3 className="font-semibold text-white">Overdue Jobs</h3>
                </div>
                <p className="text-3xl font-bold text-lime-400">{overdueJobs.length}</p>
                <p className="text-sm text-slate-500 mt-1">
                  งานที่เกินระยะเวลาประมาณการ (120%+)
                </p>
              </div>
            </div>
            <div
              className="rounded-xl border overflow-hidden backdrop-blur-xl"
              style={{
                backgroundColor: colors.obsidianCard,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="p-4 border-b border-slate-700/50">
                <h3 className="font-semibold text-white">รายการงาน</h3>
              </div>
              <table className="w-full min-w-[520px]">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Job Name</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Provider</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Insurance</th>
                    <th className="text-left p-4 text-slate-400 font-medium text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr
                      key={String(j.id)}
                      className={`border-b border-slate-700/30 ${
                        overdueJobs.some((o) => o.id === j.id)
                          ? 'bg-yellow-500/20 border-l-4 border-yellow-400'
                          : ''
                      }`}
                    >
                      <td className="p-4">
                        <p className="font-medium text-white">{String(j.title)}</p>
                        <p className="text-sm text-slate-500">
                          {String(j.estimatedHours)} ชม. • ฿{Number(j.amount || 0).toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4 text-slate-300 text-sm">
                        {String(j.providerName || j.providerId || '-')}
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            j.insuranceStatus === 'held'
                              ? 'bg-lime-500/20 text-lime-400'
                              : j.insuranceStatus === 'released'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-slate-500/20 text-slate-400'
                          }`}
                        >
                          {String(j.insuranceStatus || '-')}
                        </span>
                      </td>
                      <td className="p-4">
                        {overdueJobs.some((o) => o.id === j.id) && (
                          <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400">
                            Overdue
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && tab === 'risk' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Risk Monitor</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="rounded-xl border p-6 backdrop-blur-xl"
                style={{
                  backgroundColor: colors.limeDim,
                  borderColor: colors.limeBorder,
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <AlertTriangle className="w-6 h-6 text-lime-400" />
                  <h3 className="font-semibold text-lime-400">งานเกินกำหนด</h3>
                </div>
                <p className="text-3xl font-bold text-white">{overdueJobs.length}</p>
                <p className="text-sm text-slate-400 mt-1">ต้องแทรกแซง</p>
              </div>
              <div
                className="rounded-xl border p-6 backdrop-blur-xl"
                style={{
                  backgroundColor: colors.obsidianCard,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <MessageCircle className="w-6 h-6 text-cyan-400" />
                  <h3 className="font-semibold text-cyan-400">รอขอข้อมูลเพิ่ม</h3>
                </div>
                <p className="text-3xl font-bold text-white">{needsInfoCount}</p>
              </div>
              <div
                className="rounded-xl border p-6 backdrop-blur-xl"
                style={{
                  backgroundColor: colors.obsidianCard,
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-6 h-6 text-red-400" />
                  <h3 className="font-semibold text-red-400">Disputed</h3>
                </div>
                <p className="text-3xl font-bold text-white">{disputedCount}</p>
              </div>
            </div>
          </div>
        )}

        {!loading && tab === 'growth' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Growth Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: Users, label: 'Providers', value: stats.totalProviders ?? 0, color: 'text-lime-400' },
                { icon: TrendingUp, label: 'Total Videos', value: stats.totalVideos ?? 0, color: 'text-emerald-400' },
                { icon: CheckCircle2, label: 'Platinum Count', value: stats.platinumCount ?? stats.approvedProviders ?? 0, color: 'text-cyan-400' },
                { icon: Briefcase, label: 'Users', value: stats.totalUsers ?? 0, color: 'text-violet-400' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div
                  key={label}
                  className="rounded-xl border p-6 backdrop-blur-xl"
                  style={{
                    backgroundColor: colors.obsidianCard,
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <Icon className={`w-8 h-8 mb-4 ${color}`} />
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-sm text-slate-400">{label}</p>
                </div>
              ))}
            </div>
            <div
              className="rounded-xl border p-6 backdrop-blur-xl"
              style={{
                backgroundColor: colors.obsidianCard,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <h3 className="font-semibold text-white mb-4">Ecosystem Health</h3>
              <p className="text-slate-400 text-sm">
                ยิ่งคลิปเยอะ = Ecosystem ยิ่งแข็งแกร่ง • รอตรวจ: {stats.pendingProviders ?? 0} คน
              </p>
            </div>
          </div>
        )}

        {!loading && tab === 'logs' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white">Review Log</h2>
            <div
              className="rounded-xl border overflow-hidden backdrop-blur-xl"
              style={{
                backgroundColor: colors.obsidianCard,
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="p-4 border-b border-slate-700/50">
                <h3 className="font-semibold text-white">ใครอนุมัติใคร</h3>
              </div>
              {logs.length === 0 ? (
                <div className="p-12 text-center text-slate-500">ยังไม่มีประวัติการตรวจ</div>
              ) : (
                <div className="divide-y divide-slate-700/50">
                  {logs.map((l) => (
                    <div key={String(l.id)} className="p-4">
                      <p className="text-slate-300 text-sm font-mono">
                        {formatLogEntry(l)}
                      </p>
                      {l.note && (
                        <p className="text-slate-500 text-xs mt-1">Note: {String(l.note)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <Toast
        message={toast.message}
        visible={toast.visible}
        isLoading={toast.isLoading}
        onDismiss={() => setToast((t) => ({ ...t, visible: false, isLoading: false }))}
      />
      <AnimatePresence>
        {videoModal && (
          <VideoPlayerModal
            url={videoModal.url}
            providerName={videoModal.providerName}
            providerId={videoModal.providerId}
            canTakeAction={videoModal.canTakeAction}
            onClose={() => setVideoModal(null)}
            onApprove={
              videoModal.providerId
                ? (note) =>
                    handleProviderAction(
                      videoModal.providerId!,
                      'verified',
                      videoModal.providerName,
                      note
                    ).then(() => setVideoModal(null))
                : undefined
            }
            onRequestMoreInfo={
              videoModal.providerId
                ? (note) =>
                    handleProviderAction(
                      videoModal.providerId!,
                      'needs_info',
                      videoModal.providerName,
                      note
                    ).then(() => setVideoModal(null))
                : undefined
            }
            onReject={
              videoModal.providerId
                ? () =>
                    handleProviderAction(
                      videoModal.providerId!,
                      'rejected',
                      videoModal.providerName
                    ).then(() => setVideoModal(null))
                : undefined
            }
          />
        )}
      </AnimatePresence>
    </div>
  );
}
