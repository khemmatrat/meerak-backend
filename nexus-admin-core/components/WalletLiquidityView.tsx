import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  RefreshCw,
  Landmark,
  Wallet,
  AlertTriangle,
  Download,
  TrendingUp,
  Gift,
} from "lucide-react";
import {
  getWalletLiquiditySummary,
  getSettlementProjection,
  downloadDailyReconcileCsv,
  getDiscountPromoFund,
  creditDiscountPromoFund,
  type WalletLiquiditySummary,
  type SettlementProjection,
  type DiscountPromoFundResponse,
} from "../services/adminApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

function fmtThb(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function localDateYmd(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const WalletLiquidityView: React.FC = () => {
  const [data, setData] = useState<WalletLiquiditySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projection, setProjection] = useState<SettlementProjection | null>(null);
  const [projLoading, setProjLoading] = useState(true);
  const [projError, setProjError] = useState<string | null>(null);
  const [reconcileDate, setReconcileDate] = useState(localDateYmd);
  const [csvBusy, setCsvBusy] = useState(false);
  const [fund, setFund] = useState<DiscountPromoFundResponse | null>(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [fundError, setFundError] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [creditBusy, setCreditBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getWalletLiquiditySummary();
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProjection = useCallback(async () => {
    setProjLoading(true);
    setProjError(null);
    try {
      const p = await getSettlementProjection(14);
      setProjection(p);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const is404 =
        /\b404\b/.test(msg) ||
        (typeof e === "object" &&
          e !== null &&
          "status" in e &&
          (e as { status?: number }).status === 404);
      if (is404) {
        /** Backend รุ่นเก่าหรือ base URL ชี้ผิดโฮสต์ — แสดงโครงว่างแทน error แดงทั้งบล็อก */
        setProjection({
          horizon_days: 14,
          timezone: "Asia/Bangkok",
          payso_settlement_pipeline_locked_thb: 0,
          payso_settlement_pipeline_row_count: 0,
          not_withdrawable_total_locked_thb: 0,
          not_withdrawable_row_count: 0,
          cash_flow_projection: [],
          note:
            "ไม่พบ GET /api/admin/wallet/settlement-projection บน API ที่เรียก (404) — deploy backend ล่าสุดจาก repo นี้ หรือ build Admin ด้วย VITE_ADMIN_API_URL=https://api.aqond.com (หรือโฮสต์ API จริงของคุณ)",
        });
        setProjError(null);
      } else {
        setProjError(msg);
        setProjection(null);
      }
    } finally {
      setProjLoading(false);
    }
  }, []);

  const loadFund = useCallback(async () => {
    setFundLoading(true);
    setFundError(null);
    try {
      const f = await getDiscountPromoFund();
      setFund(f);
    } catch (e: unknown) {
      setFundError(e instanceof Error ? e.message : String(e));
      setFund(null);
    } finally {
      setFundLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadFund();
  }, [loadFund]);

  useEffect(() => {
    void loadProjection();
  }, [loadProjection]);

  const chartData = useMemo(
    () =>
      (projection?.cash_flow_projection || []).map((r) => ({
        ...r,
        label: r.available_on?.slice(5) ?? r.available_on,
      })),
    [projection]
  );

  const onDownloadCsv = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      await downloadDailyReconcileCsv(reconcileDate);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCsvBusy(false);
    }
  };

  const totalUserCredit = data?.total_user_credit_thb ?? data?.system_total_user_wallet_balance_thb ?? 0;
  const cashReserve = data?.actual_cash_reserve_thb ?? 0;
  const pendingPayouts = data?.pending_payouts_total_thb ?? 0;

  /** สอดคล้องกับ GET /api/admin/wallet/liquidity-summary — มี fallback ถ้า backend ไม่ส่ง flag */
  const criticalLiquidityAlert = useMemo(() => {
    if (!data) return false;
    if (typeof data.critical_warning_cash_reserve_below_pending === "boolean") {
      return data.critical_warning_cash_reserve_below_pending;
    }
    return cashReserve < pendingPayouts;
  }, [data, cashReserve, pendingPayouts]);

  /** อัตราส่วนเปรียบเทียบเงินสดสำรอง vs เครดิตในระบบ (ผลรวมเป็นฐาน 100%) */
  const cashVsCreditRatio = useMemo(() => {
    const credit = Math.max(0, totalUserCredit);
    const cash = Math.max(0, cashReserve);
    const sum = cash + credit;
    if (sum <= 0) return { cashPct: 50, creditPct: 50, cash, credit };
    return {
      cashPct: (cash / sum) * 100,
      creditPct: (credit / sum) * 100,
      cash,
      credit,
    };
  }, [totalUserCredit, cashReserve]);

  const gap =
    data != null
      ? Math.round((data.system_total_user_wallet_balance_thb - data.actual_cash_in_bank_approx_thb) * 100) / 100
      : 0;

  const coveragePct =
    totalUserCredit > 0 ? Math.min(100, Math.round((cashReserve / totalUserCredit) * 1000) / 10) : cashReserve > 0 ? 100 : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-8 h-8 text-emerald-600" />
            Wallet Liquidity (Hybrid)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ข้อมูลจาก <code className="text-xs bg-slate-100 px-1 rounded">GET /api/admin/wallet/liquidity-summary</code> — เครดิตรวมในแอป vs เงินสดสำรอง
            และเทียบกับยอดถอนรอดำเนินการ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm">
            <label htmlFor="reconcile-date" className="text-slate-600 whitespace-nowrap">
              วันที่รายงาน
            </label>
            <input
              id="reconcile-date"
              type="date"
              value={reconcileDate}
              onChange={(e) => setReconcileDate(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => void onDownloadCsv()}
              disabled={csvBusy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50"
            >
              {csvBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Daily Reconcile CSV
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void load();
              void loadProjection();
              void loadFund();
            }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-16 text-slate-500">
          <Loader2 className="w-10 h-10 animate-spin" />
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {data && (
        <div className="space-y-4">
          {criticalLiquidityAlert && (
            <div
              className="rounded-xl border-2 border-red-400 bg-red-50 text-red-950 px-4 py-4 flex gap-3 items-start shadow-sm"
              role="alert"
            >
              <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-900">Critical: เงินสดสำรองไม่พอสำหรับยอดถอนรอดำเนินการ</p>
                <p className="text-sm text-red-800/95 mt-1">
                  <span className="font-mono">actual_cash_reserve_thb</span> ({fmtThb(cashReserve)} ฿) &lt;{" "}
                  <span className="font-mono">pending_payouts_total_thb</span> ({fmtThb(pendingPayouts)} ฿) — ตรวจสอบสภาพคล่องและบัญชีรับทันที
                </p>
              </div>
            </div>
          )}

          {/* PaySo settlement pipeline + cash flow projection */}
          <div className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-5 h-5 text-cyan-700" />
              <h2 className="text-sm font-bold text-cyan-950">PaySo Settlement Pipeline</h2>
            </div>
            {projLoading && !projection && (
              <div className="flex justify-center py-8 text-cyan-800">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            {projError && (
              <p className="text-sm text-rose-700 mb-2" role="alert">
                {projError}
                <span className="block text-xs text-rose-600/90 mt-1 font-normal">
                  ตรวจสอบว่า build ใช้ <code className="bg-white/80 px-1 rounded">VITE_ADMIN_API_URL</code> ชี้ API
                  เดียวกับที่มี route ใน <code className="bg-white/80 px-1 rounded">backend/server.js</code> (เช่น{" "}
                  <code className="bg-white/80 px-1 rounded">/api/admin/wallet/settlement-projection</code>)
                </span>
              </p>
            )}
            {projection && (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-cyan-200 bg-white/90 px-4 py-3">
                    <p className="text-xs font-semibold text-cyan-800 uppercase">Locked in PaySo cycle (pending settlement)</p>
                    <p className="text-2xl font-bold text-cyan-950 mt-1">
                      ฿{fmtThb(projection.payso_settlement_pipeline_locked_thb)}
                    </p>
                    <p className="text-xs text-cyan-800/90 mt-1">{projection.payso_settlement_pipeline_row_count} rows · not withdrawable</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-xs font-semibold text-slate-600 uppercase">All not-withdrawable (total)</p>
                    <p className="text-xl font-bold text-slate-900 mt-1">
                      ฿{fmtThb(projection.not_withdrawable_total_locked_thb)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{projection.not_withdrawable_row_count} rows</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                    Cash flow projection — net ฿ becoming withdrawable by day ({projection.horizon_days} days, Asia/Bangkok)
                  </h3>
                  <p className="text-xs text-slate-500 mb-3">
                    จาก <code className="bg-slate-100 px-1 rounded">wallet_transactions</code> ที่{" "}
                    <code className="bg-slate-100 px-1 rounded">is_withdrawable = false</code> จัดกลุ่มตาม{" "}
                    <code className="bg-slate-100 px-1 rounded">available_on</code> (มักเป็นวันปล่อยถัดไป)
                  </p>
                  {chartData.length > 0 ? (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} label={{ value: "Date (MM-DD)", position: "insideBottom", offset: -2, fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `฿${v}`} />
                          <Tooltip
                            formatter={(value: number) => [`฿${fmtThb(Number(value))}`, "รวม"]}
                            labelFormatter={(_, payload) => {
                              const row = payload?.[0]?.payload as { available_on?: string } | undefined;
                              return row?.available_on ? `วันที่ ${row.available_on}` : "";
                            }}
                          />
                          <Bar dataKey="total_thb" fill="#0891b2" name="฿ withdrawable" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 py-6">ไม่มีข้อมูล projection ในช่วงนี้ (หรือยังไม่มี available_on)</p>
                  )}
                </div>
                {projection.note && <p className="text-[11px] text-slate-500 leading-relaxed">{projection.note}</p>}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Wallet className="w-4 h-4" /> total_user_credit_thb
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">฿{fmtThb(totalUserCredit)}</p>
              <p className="text-xs text-slate-500 mt-2">
                ผลรวม <code className="bg-slate-100 px-1 rounded text-[11px]">wallet_balance</code> จากตารางผู้ใช้ (ไม่ใช่ mock)
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide">actual_cash_reserve_thb</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">฿{fmtThb(cashReserve)}</p>
              <p className="text-xs text-emerald-800/90 mt-2">เงินสดโดยประมาณหลังหักถอนที่อนุมัติแล้ว</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-5 shadow-sm">
              <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">pending_payouts_total_thb</p>
              <p className="text-2xl font-bold text-amber-950 mt-1">฿{fmtThb(pendingPayouts)}</p>
              <p className="text-xs text-amber-900/85 mt-2">ยอดถอนสถานะ pending (ควรมีสำรองเงินสด ≥ ยอดนี้)</p>
            </div>
          </div>

          {/* Cash vs system credit — visual ratio */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-800">Cash reserve vs system credit (relative scale)</h2>
              <span className="text-xs text-slate-500">
                Coverage: <strong className="text-slate-700">{coveragePct}%</strong> of credit
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              แถบแสดงสัดส่วนเมื่อนำเงินสดสำรองเทียบกับเครดิตรวมในระบบ (ไม่ใช่ยอดเงินจริงในกองเดียวกัน — ใช้เปรียบเทียบภาพรวม)
            </p>
            <div className="h-4 w-full rounded-full overflow-hidden bg-slate-100 flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${cashVsCreditRatio.cashPct}%` }}
                title={`Cash reserve ${cashVsCreditRatio.cashPct.toFixed(1)}%`}
              />
              <div
                className="h-full bg-indigo-400 transition-all duration-300"
                style={{ width: `${cashVsCreditRatio.creditPct}%` }}
                title={`System credit ${cashVsCreditRatio.creditPct.toFixed(1)}%`}
              />
            </div>
            <div className="flex justify-between text-xs mt-2 text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                Cash ({cashVsCreditRatio.cashPct.toFixed(1)}%)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-400" />
                System credit ({cashVsCreditRatio.creditPct.toFixed(1)}%)
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden" title="Cash as % of total user credit">
              <div
                className={`h-full rounded-full ${coveragePct >= 100 ? "bg-emerald-500" : coveragePct >= 50 ? "bg-amber-500" : "bg-red-500"}`}
                style={{ width: `${Math.min(100, coveragePct)}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              แถบล่าง: สัดส่วนเงินสดสำรองต่อเครดิตรวม (100% = สำรองเท่ากับยอดเครดิตผู้ใช้)
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">actual_cash_in_bank_approx_thb (legacy)</p>
            <p className="text-xl font-bold text-slate-800 mt-1">฿{fmtThb(data.actual_cash_in_bank_approx_thb)}</p>
            <p className="text-xs text-slate-500 mt-1">manual อนุมัติ (gross) + PaySo RECEIVED (net) — ไม่หักถอน</p>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/80 p-5 shadow-sm space-y-5">
            <div className="grid lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-sm font-bold text-violet-900 mb-3">Fee &amp; margin (จาก ledger / API)</h2>
                <p className="text-[11px] text-violet-800/90 mb-3 leading-relaxed">
                  ตัวเลข 0 หมายถึงยังไม่มี movement ที่จับในกฎบัญชี — ไม่ใช่ placeholder ใน UI
                </p>
                <ul className="text-sm space-y-2 text-violet-950">
                  <li className="flex justify-between gap-2">
                    <span>withdrawal_fee_collected_thb</span>
                    <span className="font-mono shrink-0" title="THB">
                      ฿{fmtThb(data.withdrawal_fee_collected_thb ?? 0)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span>payso_deposit_entry_fees_thb</span>
                    <span className="font-mono shrink-0" title="THB">
                      ฿{fmtThb(data.payso_deposit_entry_fees_thb ?? 0)}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2 font-semibold border-t border-violet-200 pt-2 mt-1">
                    <span>realized_profit_estimate_thb</span>
                    <span className="font-mono shrink-0" title="THB">
                      ฿{fmtThb(data.realized_profit_estimate_thb ?? 0)}
                    </span>
                  </li>
                </ul>
                <p className="text-[10px] text-violet-800/80 mt-2">
                  ทุกฟิลด์ข้างต้นเป็นสกุล THB (บาท) — ไม่ใช่ USD
                </p>
              </div>
              <div className="rounded-xl border border-violet-300 bg-white/90 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="w-5 h-5 text-violet-700" />
                  <h3 className="text-sm font-bold text-violet-950">กองทุนโค้ดส่วนลด (บันทึกการจัดสรร)</h3>
                </div>
                <p className="text-[11px] text-slate-600 mb-3 leading-relaxed">
                  เติมยอดงบที่แอดมินยืนยันจัดสรรจากรายได้ประมาณการด้านซ้าย — บันทึกใน DB (
                  <code className="bg-slate-100 px-1 rounded">system_settings.discount_promo_fund</code>) พร้อม audit
                </p>
                {fundLoading && !fund && (
                  <div className="flex justify-center py-6 text-violet-700">
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                )}
                {fundError && (
                  <p className="text-sm text-rose-700 mb-2">{fundError}</p>
                )}
                {fund && (
                  <>
                    <p className="text-xs font-semibold text-slate-600 uppercase">ยอดคงเหลือกองทุน</p>
                    <p className="text-2xl font-bold text-violet-900 mb-3">฿{fmtThb(fund.balance_thb)}</p>
                    {(() => {
                      const amt = parseFloat(creditAmount.replace(/,/g, ""));
                      const profit = data.realized_profit_estimate_thb ?? 0;
                      const warn =
                        Number.isFinite(amt) && amt > 0 && profit > 0 && amt > profit;
                      return warn ? (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-2 mb-3">
                          ยอดเติมมากกว่า <span className="font-mono">realized_profit_estimate_thb</span> (฿
                          {fmtThb(profit)}) — ตรวจสอบก่อนยืนยัน
                        </p>
                      ) : null;
                    })()}
                    <form
                      className="space-y-2"
                      onSubmit={(ev) => {
                        ev.preventDefault();
                        const amt = parseFloat(String(creditAmount).replace(/,/g, ""));
                        if (!Number.isFinite(amt) || amt <= 0) {
                          setFundError("กรอกจำนวนเงินเป็นบวก");
                          return;
                        }
                        setCreditBusy(true);
                        setFundError(null);
                        void creditDiscountPromoFund(amt, creditNote)
                          .then(() => {
                            setCreditAmount("");
                            setCreditNote("");
                            void loadFund();
                          })
                          .catch((e: unknown) => {
                            setFundError(e instanceof Error ? e.message : String(e));
                          })
                          .finally(() => setCreditBusy(false));
                      }}
                    >
                      <label className="block text-xs font-medium text-slate-700">จำนวนเงิน (THB)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={creditAmount}
                        onChange={(e) => setCreditAmount(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                        placeholder="เช่น 5000"
                      />
                      <label className="block text-xs font-medium text-slate-700 mt-2">หมายเหตุ (ไม่บังคับ)</label>
                      <input
                        type="text"
                        value={creditNote}
                        onChange={(e) => setCreditNote(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="เช่น แคมเปญสงกรานต์"
                      />
                      <button
                        type="submit"
                        disabled={creditBusy}
                        className="mt-2 w-full inline-flex justify-center items-center gap-2 rounded-lg bg-violet-700 text-white text-sm font-semibold py-2.5 hover:bg-violet-800 disabled:opacity-50"
                      >
                        {creditBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        บันทึกการเติมงบกองทุน
                      </button>
                    </form>
                    {fund.movements && fund.movements.length > 0 && (
                      <div className="mt-4 border-t border-violet-100 pt-3">
                        <p className="text-xs font-bold text-slate-700 mb-2">รายการล่าสุด</p>
                        <ul className="max-h-40 overflow-y-auto text-[11px] space-y-1.5 font-mono text-slate-700">
                          {[...fund.movements].reverse().slice(0, 8).map((m, i) => (
                            <li key={`${m.at}-${i}`} className="flex justify-between gap-2 border-b border-slate-100 pb-1">
                              <span className="truncate">{m.at.slice(0, 19)}…</span>
                              <span className="text-emerald-800 shrink-0">+฿{fmtThb(m.amount_thb)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {fund.help_th && <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">{fund.help_th}</p>}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong>Gap (system credit − cash in bank approx.):</strong> ฿{fmtThb(gap)} — มักสะท้อน PaySo ที่ยัง{" "}
            <code className="bg-amber-100 px-1 rounded">PENDING_SETTLEMENT</code> หรือเครดิตอื่นๆ
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <h2 className="text-sm font-bold text-slate-700 mb-3">Breakdown</h2>
            <ul className="text-sm space-y-2 text-slate-700">
              <li className="flex justify-between">
                <span>Manual verified (net, slip approved in ledger)</span>
                <span className="font-mono">
                  ฿
                  {(data.breakdown.manual_verified_net_thb ??
                    data.breakdown.manual_approved_gross_thb ??
                    0
                  ).toLocaleString()}
                </span>
              </li>
              <li className="flex justify-between">
                <span>PaySo settled (net to users)</span>
                <span className="font-mono">฿{data.breakdown.payso_settled_net_to_users_thb.toLocaleString()}</span>
              </li>
              <li className="flex justify-between text-amber-800">
                <span>PaySo pending settlement</span>
                <span className="font-mono">฿{data.breakdown.payso_pending_settlement_net_thb.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span>Manual ledger (net)</span>
                <span className="font-mono">฿{data.breakdown.manual_ledger_net_thb.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span>Total approved payouts</span>
                <span className="font-mono">฿{data.breakdown.total_approved_payouts_thb.toLocaleString()}</span>
              </li>
              {data.breakdown.admin_debit_total_thb != null && data.breakdown.admin_debit_total_thb > 0 && (
                <li className="flex justify-between text-rose-800">
                  <span>Admin debit (หักจาก User Management)</span>
                  <span className="font-mono">−฿{data.breakdown.admin_debit_total_thb.toLocaleString()}</span>
                </li>
              )}
              {data.breakdown.admin_credit_total_thb != null && data.breakdown.admin_credit_total_thb > 0 && (
                <li className="flex justify-between text-emerald-800">
                  <span>Admin credit (เติมจาก User Management)</span>
                  <span className="font-mono">+฿{data.breakdown.admin_credit_total_thb.toLocaleString()}</span>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <strong>ทำไมหัก debit แล้ว &quot;เงินสดสำรอง&quot; (เขียว) ไม่ลงเท่าเครดิตรวม?</strong>
            <p className="mt-1 text-sky-900/95 leading-relaxed">
              ยอด <code className="bg-white/80 px-1 rounded text-xs">actual_cash_reserve</code> / manual+PaySo สะท้อน
              <strong>เงินที่รับเข้าบริษัทจริง</strong> ลบถอนที่อนุมัติ — การหักแอดมินเป็นการแก้เครดิตในระบบ (เครดิตหลอก) ไม่ได้ทำให้เงินสดในบัญชีเพิ่ม/ลดอัตโนมัติ
              แต่ <strong>total_user_credit</strong> (ผลรวม wallet) จะลดตามการ debit — ช่องว่าง (Gap) ควรแคบลงหลังกด Refresh
            </p>
          </div>

          {data.note && <p className="text-xs text-slate-500 leading-relaxed">{data.note}</p>}

          <p className="text-xs text-slate-500">
            รอบปล่อย PaySo → ถอนได้: cron พุธ 23:00+ (Bangkok) หรือ{" "}
            <code className="bg-slate-100 px-1 rounded">POST /api/admin/wallet-transactions/settle-payso</code> (idempotent) · Daily CSV:{" "}
            <code className="bg-slate-100 px-1 rounded">GET /api/admin/reports/daily-reconcile?date=YYYY-MM-DD&amp;format=csv</code>
          </p>
        </div>
      )}
    </div>
  );
};
