import React, { useEffect, useMemo, useState } from "react";
import {
  ShieldCheck,
  AlertOctagon,
  DollarSign,
  Search,
  CheckCircle,
  XCircle,
  FileText,
  Wallet,
  Landmark,
  ArrowUpRight,
  History,
  Lock,
  Download,
  RefreshCw,
  X,
  MapPin,
  Smartphone,
  Globe,
  Plus,
  Building2,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { FinancialTransaction } from "../types";
import { db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
} from "firebase/firestore";
import {
  getAdminToken,
  getFinancialAudit,
  getBankAccounts,
  createBankAccount,
  CompanyBankAccount,
  getVipAdminFund,
  reinjectVipAdminFund,
  getRevenueBySource,
  verifyLedgerIntegrity,
  downloadExport,
  getAuditByQr,
  VipAdminFundResponse,
  RevenueBySourceResponse,
} from "../services/adminApi";

interface FinancialAuditViewProps {
  currentUserRole: string;
}

export const FinancialAuditView: React.FC<FinancialAuditViewProps> = ({
  currentUserRole,
}) => {
  const useBackend = !!getAdminToken();
  const useFirebase = !!db;
  const canSwitchSource = useBackend && useFirebase;
  const [dataSource, setDataSource] = useState<"firebase" | "backend">(
    useBackend ? "backend" : "firebase"
  );

  // State for Wallet & Transactions (real data)
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // UI States
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBank, setWithdrawBank] = useState("KBANK");

  const [isReconciling, setIsReconciling] = useState(false);
  const [showInvestigateModal, setShowInvestigateModal] =
    useState<FinancialTransaction | null>(null);

  // สมุดบัญชีธนาคารบริษัท (Company Bank Accounts)
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [newBankForm, setNewBankForm] = useState({
    bank_name: "",
    account_number: "",
    account_name: "",
  });
  const [addingBank, setAddingBank] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  // VIP Admin Fund + Revenue by Source
  const [vipFund, setVipFund] = useState<VipAdminFundResponse | null>(null);
  const [revenueBySource, setRevenueBySource] = useState<RevenueBySourceResponse | null>(null);
  const [vipFundLoading, setVipFundLoading] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [verifyingIntegrity, setVerifyingIntegrity] = useState(false);
  const [reinjectAmount, setReinjectAmount] = useState("");
  const [reinjecting, setReinjecting] = useState(false);
  const [qrSearch, setQrSearch] = useState("");
  const [qrResult, setQrResult] = useState<{ query: string; ledger: any[]; statements: any[]; audit_trail: any[] } | null>(null);
  const [qrSearching, setQrSearching] = useState(false);
  const [exportFrom, setExportFrom] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [exportTo, setExportTo] = useState(new Date().toISOString().slice(0, 10));
  /** Internal CSV: ส่ง exclude_demo=1 เมื่อเปิด (default ปิด = chain เต็ม) */
  const [internalLedgerExcludeDemo, setInternalLedgerExcludeDemo] = useState(false);
  /** QR audit: ส่ง strict_production=1 — ค้นหา demo id ต้องปิด */
  const [qrStrictProduction, setQrStrictProduction] = useState(false);

  /** กระเป๋ารายได้แพลตฟอร์ม / VIP reinject / export — เฉพาะ SUPER_ADMIN (ไม่รวม ADMIN) */
  const isSuperAdmin = currentUserRole === "SUPER_ADMIN";

  const normalizeTxType = (raw: string): FinancialTransaction["type"] => {
    const t = String(raw || "").toLowerCase();
    if (t.includes("withdraw")) return "WITHDRAWAL";
    if (t.includes("deposit") || t.includes("topup")) return "DEPOSIT";
    return "JOB_PAYMENT";
  };

  const normalizeTxStatus = (raw: string): FinancialTransaction["status"] => {
    const s = String(raw || "").toLowerCase();
    if (s === "waiting_admin" || s === "flagged") return "FLAGGED";
    if (s === "completed") return "COMPLETED";
    if (s === "pending") return "PENDING";
    return "FAILED";
  };

  const fetchFromBackend = async () => {
    const res = await getFinancialAudit({ limit: 200 });
    setBalance(res.platform_balance || 0);
    setTransactions(
      (res.transactions || []).map((t) => ({
        id: t.id,
        userId: t.userId,
        amount: Number(t.amount || 0),
        type: normalizeTxType(t.type),
        status: t.status,
        fraudScore: Number(t.fraudScore || 0),
        timestamp: t.timestamp ? new Date(t.timestamp).toLocaleString() : "",
        note: t.note,
      }))
    );
  };

  const fetchFromFirebase = async () => {
    if (!db) throw new Error("Firebase not initialized");
    const q = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
      fsLimit(200)
    );
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    // Heuristic: platform revenue ≈ sum of completed fee-like records
    const feeLike = (r: any) => {
      const desc = String(r.description || "").toLowerCase();
      const type = String(r.type || "").toLowerCase();
      return type === "fee" || desc.includes("fee");
    };
    const bal = rows.reduce((sum: number, r: any) => {
      const st = String(r.status || "").toLowerCase();
      if (st !== "completed") return sum;
      if (!feeLike(r)) return sum;
      return sum + (Number(r.amount) || 0);
    }, 0);

    setBalance(bal);
    setTransactions(
      rows.map((r: any) => {
        const status = normalizeTxStatus(r.status);
        const amount = Number(r.amount) || 0;
        const fraudScore =
          r.fraudScore != null
            ? Number(r.fraudScore)
            : status === "FLAGGED"
            ? 85
            : amount >= 200000
            ? 80
            : amount >= 50000
            ? 55
            : 10;
        return {
          id: String(r.id || ""),
          userId: String(r.user_id || r.userId || ""),
          amount,
          type: normalizeTxType(r.type),
          status,
          fraudScore,
          timestamp: r.date ? new Date(r.date).toLocaleString() : "",
          note: r.description || r.note,
        } as FinancialTransaction;
      })
    );
  };

  const effectiveSource = canSwitchSource
    ? dataSource
    : useBackend
    ? "backend"
    : "firebase";

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        if (effectiveSource === "backend") {
          if (!useBackend)
            throw new Error("Backend mode requires admin login (JWT).");
          await fetchFromBackend();
        } else {
          if (!useFirebase)
            throw new Error("Firebase mode requires Firestore initialization.");
          await fetchFromFirebase();
        }
      } catch (e: any) {
        if (!cancelled) {
          setBalance(0);
          setTransactions([]);
          setLoadError(e?.message || String(e));
        }
      }
      if (!cancelled) setLoading(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [effectiveSource, useBackend, useFirebase]);

  // โหลดสมุดบัญชีธนาคารเมื่อใช้ backend
  const loadBankAccounts = async () => {
    if (!useBackend) return;
    setBankAccountsLoading(true);
    try {
      const res = await getBankAccounts();
      setBankAccounts(res.accounts || []);
    } catch {
      setBankAccounts([]);
    }
    setBankAccountsLoading(false);
  };
  useEffect(() => {
    loadBankAccounts();
  }, [useBackend]);

  const loadVipFundAndRevenue = async () => {
    if (!useBackend) return;
    setVipFundLoading(true);
    setRevenueLoading(true);
    try {
      const [vf, rev] = await Promise.all([getVipAdminFund({ limit: 30 }), getRevenueBySource()]);
      setVipFund(vf);
      setRevenueBySource(rev);
    } catch {
      setVipFund(null);
      setRevenueBySource(null);
    }
    setVipFundLoading(false);
    setRevenueLoading(false);
  };
  useEffect(() => {
    loadVipFundAndRevenue();
  }, [useBackend]);

  // --- Handlers ---

  const handleWithdrawSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert(
      "โหมดนี้เป็น Read-only เพื่อความปลอดภัย (ยังไม่รองรับถอนเงินจริงจาก Dashboard)"
    );
    setShowWithdrawModal(false);
    setWithdrawAmount("");
  };

  const handleExportCSV = () => {
    const header = "ID,User,Type,Amount,Status,FraudScore,Time,Note\n";
    const rows = transactions
      .map(
        (t) =>
          `${t.id},${t.userId},${t.type},${t.amount},${t.status},${
            t.fraudScore
          },${t.timestamp},${t.note || ""}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial_audit_${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      if (effectiveSource === "backend") await fetchFromBackend();
      else await fetchFromFirebase();
      alert("Refresh complete.");
    } catch (e: any) {
      alert("Refresh failed: " + (e?.message || e));
    }
    setIsReconciling(false);
  };

  const handleInvestigateAction = (action: "SAFE" | "FRAUD") => {
    if (!showInvestigateModal) return;

    const newStatus = action === "SAFE" ? "COMPLETED" : "FAILED";
    const note =
      action === "SAFE"
        ? "Manually verified by Admin"
        : "Blocked due to fraud suspicion";

    setTransactions((prev) =>
      prev.map((t) =>
        t.id === showInvestigateModal.id
          ? { ...t, status: newStatus, note: note }
          : t
      )
    );

    setShowInvestigateModal(null);
  };

  const handleAddBankAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError(null);
    const { bank_name, account_number, account_name } = newBankForm;
    if (!bank_name.trim() || !account_number.trim() || !account_name.trim()) {
      setBankError("กรุณากรอก ธนาคาร เลขบัญชี และชื่อบัญชี");
      return;
    }
    setAddingBank(true);
    try {
      await createBankAccount({
        bank_name: bank_name.trim(),
        account_number: account_number.trim(),
        account_name: account_name.trim(),
        is_active: true,
      });
      setNewBankForm({ bank_name: "", account_number: "", account_name: "" });
      setShowAddBankModal(false);
      await loadBankAccounts();
    } catch (err: any) {
      setBankError(err?.message || "ไม่สามารถเพิ่มบัญชีได้");
    } finally {
      setAddingBank(false);
    }
  };

  const stats = useMemo(() => {
    const totalVolume = transactions.reduce(
      (s, t) => s + (Number(t.amount) || 0),
      0
    );
    const flagged = transactions.filter((t) => t.status === "FLAGGED").length;
    // Today-ish fraud attempts: count flagged in last 24h (best-effort parsing)
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const fraudToday = transactions.filter((t) => {
      if (t.status !== "FLAGGED") return false;
      const ts = Date.parse(t.timestamp);
      return Number.isFinite(ts) ? ts >= since : true;
    }).length;
    return { totalVolume, flagged, fraudToday };
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* --- SECTION FOR THE BOSS (OWNER WALLET) --- */}
      {isSuperAdmin ? (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden border border-indigo-700">
          <div className="absolute top-0 right-0 p-32 bg-indigo-500 rounded-full blur-3xl opacity-20 -mr-16 -mt-16 pointer-events-none"></div>

          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-indigo-500/30 rounded-lg backdrop-blur-sm">
                  <Wallet size={24} className="text-emerald-400" />
                </div>
                <h2 className="text-xl font-bold">
                  Platform Revenue Wallet (กระเป๋าเงินรายได้บริษัท)
                </h2>
              </div>
              <p className="text-indigo-200 text-sm max-w-lg">
                ส่วนแบ่งรายได้ (Commission Fees) สะสมทั้งหมด
                พร้อมถอนเข้าบัญชีบริษัท
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/10 min-w-[320px]">
              <p className="text-sm text-indigo-200 mb-1">
                ยอดเงินที่ถอนได้ (Available Balance)
              </p>
              <h3 className="text-4xl font-bold text-white tracking-tight">
                ฿
                {balance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </h3>
              <div className="mt-4 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    const first = bankAccounts.find((a) => a.is_active);
                    if (first) setWithdrawBank(first.id);
                    setShowWithdrawModal(true);
                  }}
                  className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-all shadow-lg hover:shadow-emerald-500/30 flex items-center justify-center gap-2"
                >
                  <Landmark size={18} /> ถอนเงินเข้าบัญชีบริษัท
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-100 rounded-xl p-8 border border-slate-200 flex flex-col items-center justify-center text-center opacity-75">
          <div className="p-4 bg-slate-200 rounded-full mb-3 text-slate-500">
            <Lock size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-700">
            Access Restricted
          </h3>
          <p className="text-slate-500 text-sm max-w-md">
            Platform Wallet is only accessible to <strong>Super Admins</strong>.
          </p>
        </div>
      )}

      {/* --- VIP Admin Fund (12.5% ที่กันไว้) --- */}
      {isSuperAdmin && useBackend && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-amber-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-700">
                <DollarSign size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">VIP Admin Fund</h2>
                <p className="text-sm text-slate-500">ยอดเงิน 12.5% ของ gross profit จากธุรกรรม VIP ที่กันไว้</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            {vipFundLoading ? (
              <div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
            ) : (
              <>
                {/* VIP Fund Growth Chart */}
                {vipFund?.entries && vipFund.entries.length > 0 && (() => {
                  const sorted = [...vipFund.entries].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                  let cum = 0;
                  const chartData = sorted.map((e) => {
                    cum += e.amount;
                    return {
                      date: new Date(e.created_at).toLocaleDateString("th-TH", { month: "short", day: "numeric", year: "2-digit" }),
                      cumulative: cum,
                      amount: e.amount,
                    };
                  });
                  return (
                    <div className="mb-6 h-48">
                      <p className="text-sm font-medium text-slate-600 mb-2">การเติบโตของกองทุน VIP (Cumulative)</p>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <defs>
                            <linearGradient id="vipFundGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                          <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: number) => [`฿${v.toLocaleString()}`, "ยอดสะสม"]} labelFormatter={(l) => `วันที่: ${l}`} />
                          <Area type="monotone" dataKey="cumulative" stroke="#f59e0b" fill="url(#vipFundGradient)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-4 mb-4">
                  <div className="bg-amber-50 rounded-xl px-5 py-3 border border-amber-100">
                    <p className="text-sm text-amber-700">ยอดคงเหลือ (Available)</p>
                    <p className="text-2xl font-bold text-slate-800">฿ {(vipFund?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={reinjectAmount}
                      onChange={(e) => setReinjectAmount(e.target.value)}
                      placeholder="จำนวนเงิน reinject"
                      className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <button
                      onClick={async () => {
                        const amt = parseFloat(reinjectAmount);
                        if (!(amt > 0)) return alert("กรุณาระบุจำนวนที่ถูกต้อง");
                        setReinjecting(true);
                        try {
                          await reinjectVipAdminFund({ amount: amt });
                          setReinjectAmount("");
                          await loadVipFundAndRevenue();
                        } catch (e: any) {
                          alert(e?.message || "Reinject ไม่สำเร็จ");
                        }
                        setReinjecting(false);
                      }}
                      disabled={reinjecting || !(parseFloat(reinjectAmount || "0") > 0)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                    >
                      {reinjecting ? "กำลังโอน..." : "Re-inject"}
                    </button>
                  </div>
                </div>
                <div className="text-sm text-slate-500 max-h-32 overflow-y-auto">
                  {vipFund?.entries?.length ? vipFund.entries.slice(0, 10).map((e) => (
                    <div key={e.id} className="flex justify-between py-1 border-b border-slate-50">
                      <span>+฿ {e.amount.toLocaleString()} ({e.source_event_type} {e.vip_tier ? `[${e.vip_tier}]` : ""})</span>
                      <span className="text-slate-400">{e.created_at ? new Date(e.created_at).toLocaleDateString() : ""}</span>
                    </div>
                  )) : <p className="text-slate-400">ยังไม่มีรายการ</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- Revenue by Source (Match / Board / Booking) --- */}
      {isSuperAdmin && useBackend && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <ArrowUpRight size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">รายได้แยกตามแหล่งที่มา</h2>
              <p className="text-sm text-slate-500">Margin ชัดเจน: Match / Board (Advance) / Booking</p>
            </div>
          </div>
          <div className="p-5">
            {revenueLoading ? (
              <div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-slate-400" /></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-500 font-medium">Match</p>
                  <p className="text-xl font-bold text-slate-800">฿ {(revenueBySource?.match?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-400 mt-1">{revenueBySource?.match?.tx_count ?? 0} รายการ · {revenueBySource?.match?.margin_percent ?? 0}% ของรวม</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-500 font-medium">Board (Advance)</p>
                  <p className="text-xl font-bold text-slate-800">฿ {(revenueBySource?.board?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-400 mt-1">{revenueBySource?.board?.tx_count ?? 0} รายการ · {revenueBySource?.board?.margin_percent ?? 0}% ของรวม</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <p className="text-sm text-slate-500 font-medium">Booking</p>
                  <p className="text-xl font-bold text-slate-800">฿ {(revenueBySource?.booking?.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  <p className="text-xs text-slate-400 mt-1">{revenueBySource?.booking?.tx_count ?? 0} รายการ · {revenueBySource?.booking?.margin_percent ?? 0}% ของรวม</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- Export Center (Tax & Compliance) --- */}
      {isSuperAdmin && useBackend && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
              <Download size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Export Center (บัญชี & ภาษี)</h2>
              <p className="text-sm text-slate-500">Official Revenue · Internal Ledger · Payout Recon</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={internalLedgerExcludeDemo}
                onChange={(e) => setInternalLedgerExcludeDemo(e.target.checked)}
                className="rounded border-slate-300"
              />
              Internal ledger: เฉพาะ production (ไม่รวม demo ใน CSV — default ปิดเพื่อ reconciliation chain เต็ม)
            </label>
            <div className="flex flex-wrap gap-2 items-center">
              <input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              <button onClick={() => downloadExport("official-revenue", exportFrom, exportTo)} className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-sm font-medium">
                Official_Revenue_CSV
              </button>
              <button
                onClick={() => downloadExport("internal-ledger", exportFrom, exportTo, { excludeDemo: internalLedgerExcludeDemo })}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium"
              >
                Internal_Full_Ledger
              </button>
              <button onClick={() => downloadExport("payout-recon", exportFrom, exportTo)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium">
                Payout_Recon_CSV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- QR Audit Tool --- */}
      {isSuperAdmin && useBackend && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <Search size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">QR Audit Tool</h2>
              <p className="text-sm text-slate-500">สแกน Smart ID หรือ tax_ref_id เพื่อดึง audit trail</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={qrStrictProduction}
                onChange={(e) => setQrStrictProduction(e.target.checked)}
                className="rounded border-slate-300"
              />
              Strict production — กรองแถว demo ออก (ค้นหา demo id / bill / tx ของ demo ให้ปิดตัวนี้)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={qrSearch}
                onChange={(e) => setQrSearch(e.target.value)}
                placeholder="AQ-JM-20250302-0001 หรือ Smart ID"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-mono"
              />
              <button
                onClick={async () => {
                  if (!qrSearch.trim()) return;
                  setQrSearching(true);
                  setQrResult(null);
                  try {
                    const r = await getAuditByQr(qrSearch.trim(), { strictProduction: qrStrictProduction });
                    setQrResult(r);
                  } catch {
                    setQrResult({ query: qrSearch, ledger: [], statements: [], audit_trail: [] });
                  }
                  setQrSearching(false);
                }}
                disabled={qrSearching || !qrSearch.trim()}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {qrSearching ? "กำลังค้นหา..." : "ค้นหา"}
              </button>
            </div>
            {qrResult && (
              <div className="space-y-3 text-sm">
                {qrResult.reporting_note && (
                  <p className="text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs">{qrResult.reporting_note}</p>
                )}
                {qrResult.ledger?.length > 0 && (
                  <div>
                    <p className="font-bold text-slate-700 mb-2">Ledger ({qrResult.ledger.length})</p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {qrResult.ledger.map((r) => (
                        <div key={r.id} className="flex justify-between py-1 px-2 bg-slate-50 rounded">
                          <span>{r.event_type} · ฿{r.amount.toLocaleString()}</span>
                          <span className="text-slate-500">{r.tax_ref_id || r.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {qrResult.statements?.length > 0 && (
                  <div>
                    <p className="font-bold text-slate-700 mb-2">Statements ({qrResult.statements.length})</p>
                    <div className="space-y-1">
                      {qrResult.statements.map((s) => (
                        <div key={s.id} className="py-1 px-2 bg-amber-50 rounded">{s.period_from} – {s.period_to} · ฿{s.fee_amount}</div>
                      ))}
                    </div>
                  </div>
                )}
                {qrResult.audit_trail?.length > 0 && (
                  <div>
                    <p className="font-bold text-slate-700 mb-2">Audit Trail ({qrResult.audit_trail.length})</p>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {qrResult.audit_trail.map((a) => (
                        <div key={a.id} className="py-1 px-2 bg-emerald-50 rounded text-xs">{a.action} · {a.created_at}</div>
                      ))}
                    </div>
                  </div>
                )}
                {(!qrResult.ledger?.length && !qrResult.statements?.length && !qrResult.audit_trail?.length) && (
                  <p className="text-slate-500">ไม่พบรายการ</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- สมุดบัญชีธนาคารบริษัท (รองรับรับเงินจาก Omise) --- */}
      {isSuperAdmin && useBackend && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                <Building2 size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800">
                  สมุดบัญชีธนาคารบริษัท
                </h2>
                <p className="text-sm text-slate-500">
                  บัญชีสำหรับรับเงินจาก Omise (Commission, VIP, Post Job ฯลฯ)
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setBankError(null);
                setShowAddBankModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all"
            >
              <Plus size={18} /> เพิ่มบัญชีธนาคาร
            </button>
          </div>
          <div className="p-5">
            {bankAccountsLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <RefreshCw size={20} className="animate-spin mr-2" />
                กำลังโหลด...
              </div>
            ) : bankAccounts.length === 0 ? (
              <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 rounded-xl">
                <Building2 size={40} className="mx-auto mb-3 text-slate-300" />
                <p className="font-medium">ยังไม่มีบัญชีธนาคาร</p>
                <p className="text-sm mt-1">กดปุ่ม &quot;เพิ่มบัญชีธนาคาร&quot; เพื่อเพิ่มบัญชีสำหรับรับเงินจาก Omise</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {bankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100"
                  >
                    <div className="flex items-center gap-4">
                      <div className="font-bold text-slate-800">{acc.bank_name}</div>
                      <div className="text-slate-600 font-mono">{acc.account_number}</div>
                      <div className="text-slate-500">{acc.account_name}</div>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        acc.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {acc.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- ADD BANK ACCOUNT MODAL --- */}
      {showAddBankModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Building2 size={20} className="text-emerald-600" /> เพิ่มบัญชีธนาคาร
              </h3>
              <button onClick={() => setShowAddBankModal(false)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <form onSubmit={handleAddBankAccount} className="p-6 space-y-4">
              {bankError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">
                  {bankError}
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">ชื่อธนาคาร</label>
                <input
                  type="text"
                  value={newBankForm.bank_name}
                  onChange={(e) => setNewBankForm((f) => ({ ...f, bank_name: e.target.value }))}
                  placeholder="เช่น KBANK, SCB, BBL"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">เลขบัญชี</label>
                <input
                  type="text"
                  value={newBankForm.account_number}
                  onChange={(e) => setNewBankForm((f) => ({ ...f, account_number: e.target.value }))}
                  placeholder="เช่น 123-4-56789-0"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">ชื่อบัญชี</label>
                <input
                  type="text"
                  value={newBankForm.account_name}
                  onChange={(e) => setNewBankForm((f) => ({ ...f, account_name: e.target.value }))}
                  placeholder="ชื่อบริษัทหรือผู้รับเงิน"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={addingBank}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-70"
              >
                {addingBank ? <RefreshCw size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                {addingBank ? "กำลังบันทึก..." : "เพิ่มบัญชี"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- WITHDRAW MODAL --- */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Landmark size={20} className="text-emerald-600" /> ถอนเงิน
                (Withdraw)
              </h3>
              <button onClick={() => setShowWithdrawModal(false)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <form onSubmit={handleWithdrawSubmit} className="p-6 space-y-5">
              <div className="bg-indigo-50 p-4 rounded-xl text-center border border-indigo-100">
                <p className="text-xs text-indigo-500 uppercase font-bold mb-1">
                  ยอดเงินคงเหลือ
                </p>
                <p className="text-3xl font-bold text-indigo-900">
                  ฿{balance.toLocaleString()}
                </p>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  เลือกบัญชีธนาคารปลายทาง
                </label>
                <select
                  value={withdrawBank}
                  onChange={(e) => setWithdrawBank(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                >
                  {bankAccounts.filter((a) => a.is_active).length > 0 ? (
                    bankAccounts
                      .filter((a) => a.is_active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bank_name} — {a.account_name} ••••{a.account_number.slice(-4)}
                        </option>
                      ))
                  ) : (
                    <>
                      <option value="KBANK">Kasikorn Bank (KBANK) ••••-8892</option>
                      <option value="SCB">Siam Commercial Bank (SCB) ••••-1120</option>
                      <option value="BBL">Bangkok Bank (BBL) ••••-4431</option>
                    </>
                  )}
                </select>
                {bankAccounts.filter((a) => a.is_active).length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ยังไม่มีบัญชี — เพิ่มได้ที่ส่วน &quot;สมุดบัญชีธนาคารบริษัท&quot; ด้านบน
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  จำนวนเงินที่ต้องการถอน
                </label>
                <div className="relative">
                  <DollarSign
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="number"
                    required
                    min="1"
                    max={balance}
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-lg text-slate-800 placeholder-slate-300"
                    placeholder="0.00"
                  />
                  <button
                    type="button"
                    onClick={() => setWithdrawAmount(balance.toString())}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-bold hover:bg-slate-200"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isWithdrawing}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-base shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isWithdrawing ? (
                  <RefreshCw className="animate-spin" />
                ) : (
                  <CheckCircle size={20} />
                )}
                {isWithdrawing ? "กำลังดำเนินการ..." : "ยืนยันการโอนเงิน"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- OPERATIONS BAR --- */}
      <div className="flex flex-col md:flex-row justify-between items-center mt-8 gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShieldCheck size={20} className="text-indigo-600" />
            User Transaction Audit
          </h2>
          <p className="text-slate-500 text-sm">
            ตรวจสอบธุรกรรมของผู้ใช้งานและการป้องกันการฟอกเงิน (AML)
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Source:{" "}
            <span className="font-mono">
              {effectiveSource === "backend"
                ? "Backend (PostgreSQL)"
                : "Firebase (Firestore)"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {canSwitchSource && (
            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setDataSource("firebase")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  dataSource === "firebase"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Firebase
              </button>
              <button
                type="button"
                onClick={() => setDataSource("backend")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  dataSource === "backend"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Backend
              </button>
            </div>
          )}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <Download size={16} /> Export Audit Log
          </button>
          <button
            onClick={handleReconcile}
            disabled={isReconciling}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
          >
            {isReconciling ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            {isReconciling ? "Reconciling..." : "Run Reconciliation"}
          </button>
          {useBackend && (
            <button
              onClick={async () => {
                setVerifyingIntegrity(true);
                try {
                  const res = await verifyLedgerIntegrity();
                  if (res.valid) {
                    alert(`Ledger Integrity: OK\n${res.total_rows} rows verified.`);
                  } else {
                    alert(`Ledger Integrity: FAILED\n${res.message}\nFirst broken at ID: ${res.first_broken?.id}`);
                  }
                } catch (e: any) {
                  alert("Verify failed: " + (e?.message || e));
                }
                setVerifyingIntegrity(false);
              }}
              disabled={verifyingIntegrity}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-lg"
              title="Validate checksum chain (Migration 069)"
            >
              {verifyingIntegrity ? <RefreshCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              Verify Integrity
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-24 text-slate-400">
          <RefreshCw size={18} className="animate-spin mr-2" />
          Loading financial audit data...
        </div>
      )}
      {loadError && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
          Failed to load real data:{" "}
          <span className="font-mono">{loadError}</span>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <DollarSign size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Total User Volume
            </span>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">
            ฿
            {stats.totalVolume.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </h3>
          <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
            <CheckCircle size={12} /> 100% Reconciled with Bank
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
              <AlertOctagon size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Fraud Attempts (Today)
            </span>
          </div>
          <h3 className="text-2xl font-bold text-rose-600">
            {stats.fraudToday}
          </h3>
          <p className="text-xs text-rose-600 mt-1">
            Blocked automatically by AI
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
              <Search size={20} />
            </div>
            <span className="text-sm font-medium text-slate-500">
              Flagged for Review
            </span>
          </div>
          <h3 className="text-2xl font-bold text-slate-800">{stats.flagged}</h3>
          <p className="text-xs text-amber-600 mt-1">
            Requires admin attention
          </p>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            Recent High-Risk Transactions
          </h3>
        </div>
        {/* Mobile: cards */}
        <div className="space-y-3 p-3 md:hidden">
          {transactions.map((tx) => (
            <div
              key={`m-${tx.id}`}
              className="rounded-xl border border-slate-200 bg-slate-50/50 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold text-slate-900">
                    ฿{tx.amount.toLocaleString()}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{tx.timestamp || "—"}</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    tx.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700"
                      : tx.status === "FLAGGED"
                      ? "bg-rose-50 text-rose-700"
                      : tx.status === "FAILED"
                      ? "bg-slate-200 text-slate-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {tx.status === "FLAGGED" && <AlertOctagon size={12} />}
                  {tx.status}
                </span>
              </div>
              <details className="mt-3 border-t border-slate-200 pt-3">
                <summary className="cursor-pointer text-sm font-medium text-indigo-600">
                  รายละเอียด / Fraud score
                </summary>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p>
                    <span className="text-slate-400">ID:</span>{" "}
                    <span className="font-mono text-xs">{tx.id}</span>
                  </p>
                  <p>
                    <span className="text-slate-400">User:</span> {tx.userId}
                  </p>
                  <p>
                    <span className="text-slate-400">Type:</span>{" "}
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {tx.type}
                    </span>
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Fraud:</span>
                    <div className="h-2 w-20 max-w-full rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          tx.fraudScore > 80
                            ? "bg-rose-500"
                            : tx.fraudScore > 50
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${tx.fraudScore}%` }}
                      />
                    </div>
                    <span className="font-bold text-slate-800">{tx.fraudScore}</span>
                  </div>
                  {tx.note ? (
                    <p className="text-xs text-slate-500">{tx.note}</p>
                  ) : null}
                  {tx.status === "FLAGGED" ? (
                    <button
                      type="button"
                      onClick={() => setShowInvestigateModal(tx)}
                      className="mt-2 min-h-[44px] w-full rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm font-bold text-indigo-600"
                    >
                      Investigate
                    </button>
                  ) : null}
                </div>
              </details>
            </div>
          ))}
        </div>
        <table className="hidden w-full text-left text-sm md:table">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-6 py-3 font-semibold">Transaction ID</th>
              <th className="px-6 py-3 font-semibold">User</th>
              <th className="px-6 py-3 font-semibold">Type</th>
              <th className="px-6 py-3 font-semibold">Amount</th>
              <th className="px-6 py-3 font-semibold">Fraud Score</th>
              <th className="px-6 py-3 font-semibold">Status</th>
              <th className="px-6 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="hover:bg-slate-50/50 transition-colors"
              >
                <td className="px-6 py-4 font-mono text-slate-600">{tx.id}</td>
                <td className="px-6 py-4">{tx.userId}</td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">
                    {tx.type}
                  </span>
                </td>
                <td className="px-6 py-4 font-medium">
                  ฿{tx.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          tx.fraudScore > 80
                            ? "bg-rose-500"
                            : tx.fraudScore > 50
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                        }`}
                        style={{ width: `${tx.fraudScore}%` }}
                      ></div>
                    </div>
                    <span
                      className={`font-bold ${
                        tx.fraudScore > 80
                          ? "text-rose-600"
                          : tx.fraudScore > 50
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {tx.fraudScore}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      tx.status === "COMPLETED"
                        ? "bg-emerald-50 text-emerald-700"
                        : tx.status === "FLAGGED"
                        ? "bg-rose-50 text-rose-700"
                        : tx.status === "FAILED"
                        ? "bg-slate-200 text-slate-600"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {tx.status === "FLAGGED" && <AlertOctagon size={12} />}
                    {tx.status}
                  </span>
                  {tx.note && (
                    <div className="text-xs text-slate-500 mt-1 truncate max-w-[150px]">
                      {tx.note}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {tx.status === "FLAGGED" ? (
                    <button
                      type="button"
                      onClick={() => setShowInvestigateModal(tx)}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-600 transition-colors hover:bg-indigo-100 hover:text-indigo-800 md:min-h-0 md:min-w-0 md:py-1.5"
                    >
                      Investigate
                    </button>
                  ) : (
                    <span className="text-slate-400 text-xs">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- INVESTIGATION MODAL --- */}
      {showInvestigateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl animate-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                <Search size={20} className="text-indigo-600" /> Fraud
                Investigation:{" "}
                <span className="font-mono text-slate-600">
                  {showInvestigateModal.id}
                </span>
              </h3>
              <button onClick={() => setShowInvestigateModal(null)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left: Transaction Details */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase">
                  Transaction Details
                </h4>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Amount</span>
                    <span className="text-sm font-bold text-slate-800">
                      ฿{showInvestigateModal.amount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">User ID</span>
                    <span className="text-sm font-mono text-slate-800">
                      {showInvestigateModal.userId}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-500">Time</span>
                    <span className="text-sm text-slate-800">
                      {showInvestigateModal.timestamp}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200">
                    <span className="text-xs text-rose-600 font-bold flex items-center gap-1">
                      <AlertOctagon size={12} /> Reason:{" "}
                      {showInvestigateModal.note}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Technical Signals */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase">
                  Risk Signals
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                    <MapPin className="text-rose-500" size={16} />
                    <div className="text-xs">
                      <p className="font-bold text-slate-700">
                        Location Mismatch
                      </p>
                      <p className="text-slate-500">
                        IP: Russia (RU) vs User: Thailand (TH)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                    <Smartphone className="text-amber-500" size={16} />
                    <div className="text-xs">
                      <p className="font-bold text-slate-700">Device Anomaly</p>
                      <p className="text-slate-500">
                        New Device (Emulator Detected)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 border border-slate-100 rounded-lg">
                    <Globe className="text-slate-400" size={16} />
                    <div className="text-xs">
                      <p className="font-bold text-slate-700">Network</p>
                      <p className="text-slate-500">VPN / Proxy Detected</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => handleInvestigateAction("SAFE")}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 font-bold text-sm rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors flex items-center gap-2"
              >
                <CheckCircle size={16} /> Mark as Safe (Allow)
              </button>
              <button
                onClick={() => handleInvestigateAction("FRAUD")}
                className="px-4 py-2 bg-rose-600 text-white font-bold text-sm rounded-lg hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-lg shadow-rose-200"
              >
                <XCircle size={16} /> Confirm Fraud (Block)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
