import React, { useState, useEffect, useCallback } from 'react';
import { Banknote, CheckCircle, XCircle, AlertTriangle, ShieldCheck, Download, RefreshCw, Zap, Wallet, Users, Settings, Link2, UserCheck, Landmark, Eye, ExternalLink, Info } from 'lucide-react';
import {
  getAdminPayouts,
  patchAdminPayout,
  postAdminPayoutApproveManual,
  getPayoutGatewayBalance,
  getPayoutStats,
  getPayoutConfig,
  runAutoRelease,
  runAutoPayout,
  getAdminApiErrorCode,
  type AdminPayoutRow,
  type PayoutGatewayBalanceResponse,
  type PayoutStatsResponse,
  type PayoutConfigResponse,
} from '../services/adminApi';

function describePayoutError(e: unknown): string {
  const code = getAdminApiErrorCode(e);
  if (code === 'payout_approve_super_admin_only') {
    return 'รายการนี้เป็นปลายทางบัญชีบริษัท (sole disbursement) — อนุมัติ / โอนมือ / ส่งจ่ายได้เฉพาะ SUPER_ADMIN เท่านั้น';
  }
  return (e as Error).message || 'ดำเนินการไม่สำเร็จ';
}

function formatGatewayProviderLabel(provider?: string): string {
  if (!provider) return 'Payment Gateway';
  const p = provider.toLowerCase();
  const map: Record<string, string> = {
    paysolution: 'Paysolution',
    http: 'HTTP (Omise-compatible API)',
    gbprime: 'GB Prime',
    manual: 'Manual',
  };
  return map[p] || provider;
}

// Map backend status to display status
type DisplayStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

function toDisplayStatus(s: string): DisplayStatus {
  const lower = (s || '').toLowerCase();
  if (lower === 'pending') return 'PENDING';
  if (lower === 'approved') return 'APPROVED';
  if (lower === 'rejected') return 'REJECTED';
  return 'PENDING';
}

function fromBankDetails(bd: Record<string, unknown> | null): { bankName: string; accountNumber: string } {
  if (!bd || typeof bd !== 'object') return { bankName: '-', accountNumber: '-' };
  const bankName = String(bd.bank_name || bd.provider_name || bd.bankName || '').trim() || '-';
  const accountNumber = String(bd.account_number || bd.accountNumber || '').trim() || '-';
  return { bankName, accountNumber };
}

/** URL สลิปที่เคยแนบมากับคำขอ (legacy / ไม่บังคับ) — หลักฐานการโอนจริงควรเป็น paid_manually_slip_url หรือสลิปจาก gateway */
function extractPayoutSlipUrl(bd: Record<string, unknown> | null | undefined): string | null {
  if (!bd || typeof bd !== 'object') return null;
  const candidates = [
    bd.slip_url,
    bd.slipUrl,
    bd.transfer_slip_url,
    bd.proof_url,
    bd.slip,
    bd.attachment_url,
  ];
  for (const c of candidates) {
    const s = typeof c === 'string' ? c.trim() : '';
    if (s && /^https?:\/\//i.test(s)) return s;
  }
  return null;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf(\?|$)/i.test(url) || url.toLowerCase().includes('pdf');
}

function ReconciliationBadge({ st }: { st?: string | null }) {
  const u = (st || 'PENDING').toUpperCase();
  if (u === 'PASS') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-400">
        PASS
      </span>
    );
  }
  if (u === 'FAIL') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-400">
        FAIL
      </span>
    );
  }
  if (u === 'WARN') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-400 animate-pulse">
        WARN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
      {u}
    </span>
  );
}

/** ป้องกัน toLocaleString on undefined — คืน '-' ถ้าไม่ใช่ตัวเลข */
function fmtNum(v: unknown): string {
  if (v == null || v === '') return '-';
  const n = Number(v);
  return isNaN(n) ? '-' : n.toLocaleString();
}

export const UserPayoutView: React.FC<{ currentUserRole: string; onNavigate?: (view: string) => void }> = ({
  currentUserRole,
  onNavigate,
}) => {
  const [requests, setRequests] = useState<AdminPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Gateway (Paysolution / configured provider) & Stats
  const [gatewayBalance, setGatewayBalance] = useState<PayoutGatewayBalanceResponse | null>(null);
  const [stats, setStats] = useState<PayoutStatsResponse | null>(null);
  const [config, setConfig] = useState<PayoutConfigResponse | null>(null);
  const [runningRelease, setRunningRelease] = useState(false);
  const [runningPayout, setRunningPayout] = useState(false);

  const [actionModal, setActionModal] = useState<{ req: AdminPayoutRow; action: 'approve' | 'reject' } | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [detailRequest, setDetailRequest] = useState<AdminPayoutRow | null>(null);
  /** PaySo ล่ม / วันหยุด — อนุมัติโดยโอนมือ + URL สลิป */
  const [manualModal, setManualModal] = useState<AdminPayoutRow | null>(null);
  const [manualSlipUrl, setManualSlipUrl] = useState('');
  const [manualTxnId, setManualTxnId] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [manualSubmitting, setManualSubmitting] = useState(false);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminPayouts({ limit: 200 });
      setRequests(res.payouts || []);
    } catch (e) {
      setError((e as Error).message || 'Failed to load payouts');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGatewayAndStats = useCallback(async () => {
    try {
      const [bal, st] = await Promise.all([getPayoutGatewayBalance(), getPayoutStats()]);
      setGatewayBalance(bal);
      setStats(st);
    } catch {
      setGatewayBalance(null);
      setStats(null);
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    const cfg = await getPayoutConfig();
    setConfig(cfg);
  }, []);

  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  useEffect(() => {
    fetchGatewayAndStats();
    const t = setInterval(fetchGatewayAndStats, 60000);
    return () => clearInterval(t);
  }, [fetchGatewayAndStats]);

  // Defer config fetch — endpoint อาจไม่มีใน backend เวอร์ชันเก่า
  useEffect(() => {
    const t = setTimeout(() => fetchConfig(), 100);
    return () => clearTimeout(t);
  }, [fetchConfig]);

  // Filter Logic (client-side for consistency with existing UX)
  const filteredRequests = (requests || []).filter(
    (req) => req && (filterStatus === 'ALL' || toDisplayStatus(req?.status || '') === filterStatus)
  );

  const handleManualApprove = async () => {
    if (!manualModal) return;
    const slip = manualSlipUrl.trim();
    if (!/^https?:\/\//i.test(slip)) {
      setError('กรุณาใส่ slip_url เป็น https');
      return;
    }
    setManualSubmitting(true);
    try {
      await postAdminPayoutApproveManual(manualModal.id, {
        slip_url: slip,
        admin_notes: manualNotes.trim() || undefined,
        transaction_id: manualTxnId.trim() || undefined,
      });
      setRequests((prev) =>
        prev.map((req) => (req.id === manualModal.id ? { ...req, status: 'approved', paid_manually: true, paid_manually_slip_url: slip } : req))
      );
      setManualModal(null);
      setManualSlipUrl('');
      setManualTxnId('');
      setManualNotes('');
      fetchGatewayAndStats();
    } catch (e) {
      setError(describePayoutError(e));
    } finally {
      setManualSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'approved' | 'rejected') => {
    setActionSubmitting(true);
    try {
      await patchAdminPayout(id, {
        status: action,
        admin_notes: actionNotes || undefined,
      });
      setRequests((prev) =>
        prev.map((req) =>
          req.id === id ? { ...req, status: action } : req
        )
      );
      setActionModal(null);
      setActionNotes('');
      fetchGatewayAndStats();
    } catch (e) {
      setError(describePayoutError(e));
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!confirm(`ยืนยันอนุมัติ ${selectedIds.length} รายการที่เลือก?`)) return;
    const failures: { id: string; reason: string }[] = [];
    let ok = 0;
    for (const id of selectedIds) {
      try {
        await patchAdminPayout(id, { status: 'approved' });
        setRequests((prev) =>
          prev.map((req) => (req.id === id ? { ...req, status: 'approved' } : req))
        );
        ok++;
      } catch (e) {
        failures.push({ id, reason: describePayoutError(e) });
      }
    }
    setSelectedIds([]);
    if (failures.length) {
      setError(
        `อนุมัติสำเร็จ ${ok} รายการ — ล้มเหลว ${failures.length} รายการ:\n${failures
          .map((f) => `${f.id.slice(0, 8)}… ${f.reason}`)
          .join('\n')}`
      );
    } else if (ok > 0) {
      setError(null);
    }
    if (ok > 0) fetchGatewayAndStats();
  };

  const handleExportCSV = () => {
    const header = 'ID,User,Bank,Account,Amount,Status,Date\n';
    const rows = filteredRequests
      .map((r) => {
        const { bankName, accountNumber } = fromBankDetails(r.bank_details);
        return `${r.id},${r.user_name || r.user_id},${bankName},${accountNumber},${r.amount},${r.status},${r.created_at || ''}`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payouts-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleRunAutoRelease = async () => {
    if (!confirm('รัน Auto-Release ตอนนี้? (ปล่อย wallet_pending → wallet_balance สำหรับงานที่ครบ release_deadline)')) return;
    setRunningRelease(true);
    try {
      const res = await runAutoRelease();
      alert(`Released: ${res?.released ?? 0} jobs${res?.errors?.length ? `\nErrors: ${res.errors.length}` : ''}`);
      fetchPayouts();
      fetchGatewayAndStats();
    } catch (e) {
      alert((e as Error).message || 'Failed');
    } finally {
      setRunningRelease(false);
    }
  };

  const handleRunAutoPayout = async () => {
    const prov =
      config?.payment_gateway_provider ||
      gatewayBalance?.payment_gateway_provider ||
      'paysolution';
    const label = formatGatewayProviderLabel(prov);
    if (
      !confirm(
        `รัน Auto-Payout ผ่าน ${label} ตอนนี้?\n(ต้องเปิด AUTO_PAYOUT_GATEWAY_TRANSFER_ENABLED=1 หรือ AUTO_PAYOUT_OMISE_ENABLED=1 และมี PAYMENT_GATEWAY_SECRET_KEY)`
      )
    ) {
      return;
    }
    setRunningPayout(true);
    try {
      const res = await runAutoPayout();
      alert(`Processed: ${res?.processed ?? 0} payouts${res?.errors?.length ? `\nErrors: ${res.errors.length}` : ''}`);
      fetchPayouts();
      fetchGatewayAndStats();
    } catch (e) {
      alert((e as Error).message || 'Failed');
    } finally {
      setRunningPayout(false);
    }
  };

  const riskScore = (req: AdminPayoutRow): number => {
    const kyc = (req.kyc_status || '').toLowerCase();
    if (kyc === 'verified') return Math.min(20, Math.max(0, 100 - (req.rating || 0) * 10));
    if (kyc === 'rejected' || kyc === 'failed') return 90;
    return 50;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Banknote size={20} className="text-indigo-600" />
            อนุมัติการถอนเงิน (User Payout Requests)
          </h2>
          <p className="text-slate-500 text-sm">ตรวจสอบและดำเนินการโอนเงินให้ผู้ใช้งาน</p>
          <p className="text-xs text-slate-400 mt-1">บทบาท: {currentUserRole.replace(/_/g, ' ')}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => { fetchPayouts(); fetchGatewayAndStats(); fetchConfig(); }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <div className="flex bg-white border border-slate-200 rounded-lg p-1">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-3 py-1.5 text-xs font-bold rounded transition-colors ${
                  filterStatus === status ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-md"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-950 max-w-5xl">
        <p className="font-bold flex items-center gap-2">
          <AlertTriangle size={18} className="text-rose-600 shrink-0" />
          อนุมัติ = หักวอลเล็ตผู้ใช้ทันทีในระบบ
        </p>
        <p className="mt-1 text-xs leading-relaxed opacity-95">
          กดอนุมัติแล้วระบบจะหักเงินจาก wallet ลูกค้าทันที — คุณต้องโอนเงินจริงจากบัญชีบริษัทไปยังบัญชีลูกค้าตามข้อมูลในแถว (ข้อมูลธนาคารมาจากฐานข้อมูล ไม่แก้ในตารางนี้) หากโอนผิดบัญชีหรือช้าเกินไป จะก่อความเสียหายทางการเงิน
        </p>
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-4 text-sm text-indigo-950 shadow-sm space-y-2 max-w-5xl">
        <p className="font-bold text-indigo-900 flex items-center gap-2">
          <ShieldCheck size={18} className="text-indigo-700 shrink-0" />
          ลำดับการถอนเงิน &amp; ที่เก็บสลิป (หลักฐานขาเข้า–ขาออก)
        </p>
        <ol className="list-decimal list-inside space-y-1.5 text-indigo-950/95 leading-relaxed pl-1">
          <li>
            <strong>ลูกค้า</strong>แจ้งถอนในแอป — ระบบแสดงคำขอที่นี่ พร้อมบัญชีรับเงิน / PromptPay จากที่ลูกค้าลงใน Settings (ไม่ต้องแนบสลิปจากลูกค้าตอนแจ้งถอน)
          </li>
          <li>
            <strong>แอดมิน</strong>ตรวจรายการ → โอนเงินจากบัญชีบริษัทไปยังเลขบัญชีหรือ PromptPay ของลูกค้าตามที่แสดง
          </li>
          <li>
            <strong>หลังโอนสำเร็จ</strong> ต้องเก็บ<strong className="text-indigo-950">สลิปการโอน (ขาออก)</strong>เป็นหลักฐานในระบบ: ใช้ปุ่ม <em>โอนมือ + สลิป</em> (กรอก URL สลิป → บันทึก <code className="text-xs bg-white/80 px-1 rounded">paid_manually_slip_url</code>) หรือช่องทาง PaySo / Auto-Payout ตามที่ตั้งค่า
          </li>
          <li>
            สลิปนี้ใช้คู่กับ Ledger / Reconciliation และตรวจสอบยอดขาเข้า–ขาออก — ดูเพิ่มใน{' '}
            {onNavigate ? (
              <button type="button" onClick={() => onNavigate('financial-audit')} className="text-indigo-700 font-bold hover:underline">
                Financial Audit
              </button>
            ) : (
              'Financial Audit'
            )}
          </li>
        </ol>
      </div>

      {/* Gateway balance (Paysolution / configured provider) + Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Wallet size={16} /> ยอด Gateway ({formatGatewayProviderLabel(gatewayBalance?.payment_gateway_provider || config?.payment_gateway_provider)})
          </div>
          <div className="text-xl font-bold text-slate-800">
            ฿{fmtNum(gatewayBalance?.available)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Pending: ฿{fmtNum(gatewayBalance?.total_pending_payouts)} · Safety: ฿{fmtNum(gatewayBalance?.safety_gap)}
          </div>
          {gatewayBalance?.error && (
            <div className="text-xs text-amber-600 mt-1">{gatewayBalance.error}</div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Zap size={16} /> Pending Release
          </div>
          <div className="text-xl font-bold text-slate-800">{stats?.pending_release_jobs ?? '-'} jobs</div>
          <button
            onClick={handleRunAutoRelease}
            disabled={runningRelease || !stats?.pending_release_jobs}
            className="mt-2 text-xs px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold hover:bg-indigo-200 disabled:opacity-50"
          >
            {runningRelease ? 'Running...' : 'Run Auto-Release'}
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Banknote size={16} /> Pending Payouts
          </div>
          <div className="text-xl font-bold text-slate-800">
            {stats?.pending_payout_count ?? '-'} · ฿{fmtNum(stats?.pending_payout_total)}
          </div>
          <button
            onClick={handleRunAutoPayout}
            disabled={runningPayout || !stats?.pending_payout_count}
            className="mt-2 text-xs px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg font-bold hover:bg-emerald-200 disabled:opacity-50"
          >
            {runningPayout ? 'Running...' : 'Run Auto-Payout (Gateway)'}
          </button>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
            <Users size={16} /> Coach-Trainee
          </div>
          <div className="text-sm font-bold text-slate-800">
            Active: {stats?.connections?.active ?? '-'} · Pending: {stats?.connections?.pending ?? '-'} · Graduated: {stats?.connections?.graduated ?? '-'}
          </div>
        </div>
      </div>

      {/* บัญชีรับชั่วคราว — โอนด้วยมือ / รอ Paysolution พร้อม */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
          <Landmark size={18} /> บัญชีรับชั่วคราว (Manual / รอ Gateway)
        </h3>
        {config?.temporary_payout_account ? (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="text-sm text-slate-700">
              <div className="font-bold text-slate-800">{config.temporary_payout_account.label}</div>
              <div>
                {config.temporary_payout_account.bank_name} · {config.temporary_payout_account.account_holder_name}
              </div>
              <div className="font-mono text-xs text-slate-600 mt-1">
                เลขบัญชี (mask): {config.temporary_payout_account.account_number_masked}
                {config.temporary_payout_account.has_prompt_pay ? ' · มี PromptPay' : ''}
              </div>
            </div>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('personal-settlement-manual')}
                className="shrink-0 px-4 py-2 bg-slate-100 text-slate-800 rounded-lg text-xs font-bold hover:bg-slate-200"
              >
                ไปบันทึกรายการ / แก้ไขบัญชี
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <p className="text-sm text-slate-600">
              ยังไม่ได้ตั้งค่าบัญชีรับชั่วคราว — ใช้เมื่อโอนเงินให้ Talent ด้วยมือ (หรือคู่กับ Gateway ภายหลัง)
            </p>
            {onNavigate && (
              <button
                type="button"
                onClick={() => onNavigate('personal-settlement-manual')}
                className="shrink-0 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700"
              >
                ตั้งค่าบัญชีรับชั่วคราว
              </button>
            )}
          </div>
        )}
      </div>

      {/* Feature Control — Gateway + บัญชีชั่วคราว */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
          <Settings size={18} /> Feature Control (สถานะระบบ)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Zap size={16} className="text-indigo-500" />
            <span>Auto-Release:</span>
            <span className={`font-bold ${config?.auto_release_enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
              {config ? (config.auto_release_enabled ? `เปิด (${config.auto_release_hours ?? 24}h)` : 'ปิด') : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Banknote size={16} className="text-emerald-500" />
            <span>Auto-Payout (Gateway):</span>
            <span
              className={`font-bold ${
                (config?.auto_payout_gateway_transfer_enabled ?? config?.auto_payout_omise_enabled)
                  ? 'text-emerald-600'
                  : 'text-amber-600'
              }`}
            >
              {config
                ? (config.auto_payout_gateway_transfer_enabled ?? config.auto_payout_omise_enabled)
                    ? `เปิด (${formatGatewayProviderLabel(config.payment_gateway_provider)})`
                    : 'ปิด'
                : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Wallet size={16} className="text-indigo-500" />
            <span>Gateway key:</span>
            <span
              className={`font-bold ${
                (config?.gateway_configured ?? config?.omise_configured) ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {config ? (config.gateway_configured ?? config.omise_configured ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง') : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Landmark size={16} className="text-teal-600" />
            <span>บัญชีรับชั่วคราว:</span>
            <span className={`font-bold ${config?.temporary_payout_account ? 'text-emerald-600' : 'text-amber-600'}`}>
              {config ? (config.temporary_payout_account ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง') : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <UserCheck size={16} className="text-blue-500" />
            <span>Provider Advance:</span>
            <span className="font-bold text-slate-700">เปิดใช้งาน</span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
            <Link2 size={16} className="text-violet-500" />
            <span>Coach-Trainee:</span>
            <span className="font-bold text-slate-700">เปิดใช้งาน</span>
          </div>
        </div>
        {config?.payout_rail_hint && (
          <p className="text-xs text-slate-500 mt-2 font-mono">rail: {config.payout_rail_hint}</p>
        )}
        {config?.hint && (
          <p className="text-xs text-slate-500 mt-2">{config.hint}</p>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg flex items-start justify-between gap-4">
          <span className="flex items-start gap-2 whitespace-pre-wrap break-words text-left">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" /> {error}
          </span>
          <button
            onClick={() => { setError(null); fetchPayouts(); fetchGatewayAndStats(); fetchConfig(); }}
            className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-sm font-bold hover:bg-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-lg flex items-center justify-between">
          <span className="text-sm font-bold text-indigo-700">{selectedIds.length} items selected</span>
          <button
            onClick={handleBulkApprove}
            className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700"
          >
            Bulk Approve
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">Loading...</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-500">ไม่มีรายการ</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-medium">
              <tr>
                <th className="px-6 py-4 w-10">
                  <input
                    type="checkbox"
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredRequests.map((r) => r.id) : [])
                    }
                  />
                </th>
                <th className="px-6 py-4">Request Details</th>
                <th className="px-6 py-4 text-center">Reconcile</th>
                <th className="px-6 py-4">Risk Score</th>
                <th className="px-6 py-4">Bank Info</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Detail</th>
                <th className="px-6 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRequests.map((req) => {
                const { bankName, accountNumber } = fromBankDetails(req.bank_details);
                const status = toDisplayStatus(req.status);
                const risk = riskScore(req);
                const slipUrl = extractPayoutSlipUrl(req.bank_details);
                return (
                  <tr key={req.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(req.id)}
                        onChange={() => toggleSelect(req.id)}
                        disabled={status !== 'PENDING'}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">{req.id}</div>
                      <div className="text-slate-500 text-xs mt-1">{req.created_at || '-'}</div>
                      <div className="flex items-center gap-1 mt-1 text-xs">
                        <span className="text-slate-600 font-medium">{req.user_name || req.user_id}</span>
                        {(req.kyc_status || '').toLowerCase() === 'verified' && (
                          <ShieldCheck size={12} className="text-emerald-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ReconciliationBadge st={req.reconciliation_status} />
                      {req.slip_hash && (
                        <div className="text-[9px] font-mono text-slate-500 mt-1 max-w-[100px] truncate mx-auto" title={req.slip_hash}>
                          {req.slip_hash.slice(0, 10)}…
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${risk > 50 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                            style={{ width: `${risk}%` }}
                          />
                        </div>
                        <span className={`font-bold text-xs ${risk > 50 ? 'text-rose-600' : 'text-emerald-600'}`}>
                          {risk}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-700">{bankName}</div>
                      <div className="font-mono text-xs text-slate-500 flex items-center gap-2">
                        {accountNumber}
                        <span
                          className="inline-flex items-center text-slate-400"
                          title="ข้อมูลจากฐานข้อมูลเท่านั้น — ไม่แก้ในตารางนี้ หากต้องแก้บัญชีปลายทางหลังล็อก reconciliation ให้ใช้ SUPER_ADMIN ผ่าน Sensitive override ใน API"
                        >
                          <Info size={14} aria-hidden />
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-slate-800 text-lg">
                      ฿{fmtNum(req?.amount)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => setDetailRequest(req)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200"
                        title="ดูรายละเอียดและสลิป"
                      >
                        <Eye size={14} />
                        ดู
                      </button>
                      {slipUrl && (
                        <div className="text-[10px] text-emerald-600 mt-1">มีสลิป</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {status === 'PENDING' ? (
                        <div className="flex flex-col items-center gap-2">
                          <div className="flex justify-center gap-2">
                            <button
                              onClick={() => setActionModal({ req, action: 'approve' })}
                              className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100"
                              title="Approve"
                            >
                              <CheckCircle size={18} />
                            </button>
                            <button
                              onClick={() => setActionModal({ req, action: 'reject' })}
                              className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                              title="Reject"
                            >
                              <XCircle size={18} />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setManualModal(req);
                              setManualSlipUrl('');
                              setManualTxnId('');
                              setManualNotes('');
                            }}
                            className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200"
                            title="เมื่อ PaySo ล่ม — อนุมัติหลังโอนมือแล้ว แนบ URL สลิป"
                          >
                            โอนมือ + สลิป
                          </button>
                        </div>
                      ) : (
                        <div
                          className={`text-center text-xs font-bold px-2 py-1 rounded-full ${
                            status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}
                        >
                          {status}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* View detail — สลิปจาก bank_details.slip_url (ผู้โอน/ผู้ขอถอนแนบ) */}
      {detailRequest && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto my-8">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Eye size={20} className="text-indigo-600" /> รายละเอียดคำขอถอน
              </h3>
              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                className="text-slate-500 hover:text-slate-800 text-sm font-bold"
              >
                ปิด
              </button>
            </div>
            <div className="px-6 py-4 space-y-4 text-sm">
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <span className="text-slate-500 text-xs">Request ID</span>
                  <div className="font-mono font-bold text-slate-800">{detailRequest.id}</div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  <div>
                    <span className="text-slate-500 text-xs">สถานะ</span>
                    <div className="font-bold text-slate-800">{detailRequest.status}</div>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">จำนวน</span>
                    <div className="font-bold text-slate-800">฿{fmtNum(detailRequest.amount)}</div>
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">ผู้ใช้</span>
                  <div className="text-slate-800">{detailRequest.user_name || detailRequest.user_id}</div>
                  {detailRequest.user_phone && (
                    <div className="text-xs text-slate-600">โทร: {detailRequest.user_phone}</div>
                  )}
                  {detailRequest.user_email && (
                    <div className="text-xs text-slate-600">อีเมล: {detailRequest.user_email}</div>
                  )}
                </div>
                <div>
                  <span className="text-slate-500 text-xs">KYC / Tier</span>
                  <div className="text-slate-800">
                    {detailRequest.kyc_status || '-'} · {detailRequest.membership_tier || '-'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">สร้างเมื่อ / ดำเนินการ</span>
                  <div className="text-slate-800 text-xs">
                    {detailRequest.created_at || '-'}
                    {detailRequest.processed_at && (
                      <span className="block text-slate-600">processed: {detailRequest.processed_at}</span>
                    )}
                  </div>
                </div>
                {detailRequest.transaction_id && (
                  <div>
                    <span className="text-slate-500 text-xs">Transaction ID (หลังอนุมัติ)</span>
                    <div className="font-mono text-xs text-slate-800 break-all">{detailRequest.transaction_id}</div>
                  </div>
                )}
                {detailRequest.paid_manually && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-3">
                    <span className="text-amber-900 text-xs font-bold">โอนมือ (สำรอง PaySo)</span>
                    {detailRequest.paid_manually_slip_url && (
                      <a
                        href={detailRequest.paid_manually_slip_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-1 text-xs text-indigo-600 font-bold break-all hover:underline"
                      >
                        เปิดสลิปโอนมือ
                      </a>
                    )}
                    {detailRequest.paid_manually_at && (
                      <p className="text-[10px] text-slate-600 mt-1">เมื่อ: {detailRequest.paid_manually_at}</p>
                    )}
                  </div>
                )}
                {(detailRequest.payso_reference_id || detailRequest.payso_transaction_id) && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/80 p-3">
                    <span className="text-teal-800 text-xs font-bold uppercase">Payso (PromptPay)</span>
                    {detailRequest.payso_reference_id && (
                      <div className="mt-1">
                        <span className="text-slate-500 text-[10px]">Reference ID</span>
                        <div className="font-mono text-xs text-slate-900 break-all">{detailRequest.payso_reference_id}</div>
                      </div>
                    )}
                    {detailRequest.payso_transaction_id && (
                      <div className="mt-1">
                        <span className="text-slate-500 text-[10px]">Payso Transaction ID</span>
                        <div className="font-mono text-xs text-slate-900 break-all">{detailRequest.payso_transaction_id}</div>
                      </div>
                    )}
                  </div>
                )}
                {detailRequest.admin_notes && (
                  <div>
                    <span className="text-slate-500 text-xs">หมายเหตุแอดมิน</span>
                    <div className="text-slate-800 bg-slate-50 rounded p-2 text-xs">{detailRequest.admin_notes}</div>
                  </div>
                )}
              </div>

              <div>
                <span className="text-slate-500 text-xs font-bold uppercase">ข้อมูลธนาคาร / ช่องทาง (bank_details)</span>
                <pre className="mt-1 p-3 bg-slate-50 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(detailRequest.bank_details || {}, null, 2)}
                </pre>
              </div>

              <div>
                <span className="text-slate-500 text-xs font-bold uppercase">สลิปการโอน (แนบจากผู้ใช้)</span>
                {(() => {
                  const u = extractPayoutSlipUrl(detailRequest.bank_details);
                  if (!u) {
                    return (
                      <p className="mt-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
                        ไม่พบสลิปในรายการนี้ — รายการเก่าอาจสร้างก่อนบังคับสลิป หรือข้อมูลไม่ครบ ควรตรวจ Ledger และหลักฐานอื่นก่อนอนุมัติ
                      </p>
                    );
                  }
                  return (
                    <div className="mt-2 space-y-2">
                      {detailRequest.slip_hash && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wide mb-1">
                            SHA-256 (Tier A — manual verify)
                          </div>
                          <code className="text-xs break-all text-slate-900 block select-all font-mono">
                            {detailRequest.slip_hash}
                          </code>
                        </div>
                      )}
                      <a
                        href={u}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-indigo-600 hover:underline text-sm font-bold"
                      >
                        เปิดลิงก์สลิป <ExternalLink size={14} />
                      </a>
                      {!isPdfUrl(u) ? (
                        <div className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                          <img
                            src={u}
                            alt="สลิปการโอน"
                            className="w-full max-h-80 object-contain"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-slate-600">ไฟล์ PDF — ใช้ลิงก์ด้านบนเพื่อเปิดดู</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual approve (slip URL) — PaySo backup */}
      {manualModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="font-bold text-lg mb-2">อนุมัติแบบโอนมือ + สลิป (ขาออก)</h3>
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              หลังคุณ<strong>โอนเงินจากบัญชีบริษัทไปยังลูกค้าแล้ว</strong> ให้แนบ URL สลิป<strong>การโอนออก</strong> (หลักฐานที่ธนาคาร/Gateway ออกให้) — ไม่ใช่สลิปจากลูกค้า
              ใช้เมื่อ PaySo / API ไม่พร้อม — หัก wallet เหมือนอนุมัติปกติ ต้องเป็น URL แบบ https (อัปโหลดรูปไป S3/Cloudinary แล้วก็ได้)
            </p>
            <p className="text-sm font-mono text-slate-800 mb-3">ID: {manualModal.id}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-bold text-slate-500">slip_url (https) *</label>
                <input
                  type="url"
                  value={manualSlipUrl}
                  onChange={(e) => setManualSlipUrl(e.target.value)}
                  className="w-full border p-2 rounded mt-1 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">เลขอ้างอิงโอน (ถ้ามี)</label>
                <input
                  type="text"
                  value={manualTxnId}
                  onChange={(e) => setManualTxnId(e.target.value)}
                  className="w-full border p-2 rounded mt-1 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500">หมายเหตุ</label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  className="w-full border p-2 rounded mt-1 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setManualModal(null);
                  setManualSlipUrl('');
                  setManualTxnId('');
                  setManualNotes('');
                }}
                className="flex-1 py-2 border rounded text-slate-600 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleManualApprove}
                disabled={manualSubmitting}
                className="flex-1 py-2 rounded font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
              >
                {manualSubmitting ? '...' : 'ยืนยันโอนมือ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal (Approve/Reject with notes) */}
      {actionModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-xl w-96">
            <h3 className="font-bold text-lg mb-4">
              {actionModal.action === 'approve' ? 'อนุมัติ' : 'ปฏิเสธ'} คำขอถอน
            </h3>
            <p className="text-sm text-slate-600 mb-2">
              ID: {actionModal.req.id} · ฿{fmtNum(actionModal.req?.amount)}
            </p>
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-500 uppercase">Admin Notes (optional)</label>
              <input
                type="text"
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
                className="w-full border p-2 rounded mt-1"
                placeholder="Transaction ID, หมายเหตุ..."
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setActionModal(null);
                  setActionNotes('');
                }}
                className="flex-1 py-2 border rounded text-slate-600 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  handleAction(
                    actionModal.req.id,
                    actionModal.action === 'approve' ? 'approved' : 'rejected'
                  )
                }
                disabled={actionSubmitting}
                className={`flex-1 py-2 rounded font-bold text-white ${
                  actionModal.action === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionSubmitting ? '...' : actionModal.action === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
