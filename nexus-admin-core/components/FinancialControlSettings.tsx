/**
 * Financial Control Settings — Administrative Steering
 * Manage payout thresholds (650 THB, 10 jobs) and dynamic fees (JobMatch, JobBoard, Booking)
 * per VIP tier. Every change is logged to financial_audit_log.
 * NOTE: Actual fee calculations use LOCKED rates from backend/lib/financialEngine.js.
 * See "Fee Structure (LOCKED)" tab for reference.
 */
import React, { useEffect, useState } from "react";
import {
  Settings,
  Save,
  RefreshCw,
  DollarSign,
  Percent,
  Shield,
  Lock,
  Crown,
  FileText,
  Calculator,
  Wallet,
} from "lucide-react";
import {
  getFinancialControlSettings,
  patchFinancialControlSettings,
  getAdminToken,
  previewAdminWithdrawalFee,
} from "../services/adminApi";
import type {
  AdminWithdrawalFeePreviewResponse,
  FinancialControlSettingsResponse,
  WithdrawalFeePolicyFull,
  WithdrawalFeePolicyLaneResolved,
} from "../services/adminApi";
import { MerchantHubBookingFeesPanel } from "./MerchantHubBookingFeesPanel";

const VIP_TIERS = ["none", "silver", "gold", "platinum"] as const;

const VIP_SUBSCRIPTION_TIERS = ["silver", "gold", "platinum"] as const;

export const FinancialControlSettings: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] =
    useState<FinancialControlSettingsResponse | null>(null);
  const [edited, setEdited] = useState<
    Partial<FinancialControlSettingsResponse>
  >({});
  const [withdrawalDraft, setWithdrawalDraft] =
    useState<WithdrawalFeePolicyFull | null>(null);
  const [previewAmount, setPreviewAmount] = useState(1000);
  const [previewChannel, setPreviewChannel] = useState<
    "bank_transfer" | "promptpay" | "truemoney"
  >("promptpay");
  const [previewIsProvider, setPreviewIsProvider] = useState(false);
  const [previewInstant, setPreviewInstant] = useState(false);
  const [previewResult, setPreviewResult] =
    useState<AdminWithdrawalFeePreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const useBackend = !!getAdminToken();

  type WithdrawalLaneId = keyof Pick<
    WithdrawalFeePolicyFull,
    | "bank_transfer"
    | "promptpay"
    | "truemoney"
    | "provider_batch"
    | "provider_instant"
  >;

  const withdrawalLaneDefs: Array<{
    id: WithdrawalLaneId;
    title: string;
    subtitle: string;
  }> = [
    {
      id: "bank_transfer",
      title: "Bank Transfer",
      subtitle: "โอนธนาคาร (ลูกค้าทั่วไป)",
    },
    { id: "promptpay", title: "PromptPay", subtitle: "พร้อมเพย์ — ถอนทันที" },
    { id: "truemoney", title: "TrueMoney", subtitle: "% จากยอดถอน" },
    {
      id: "provider_batch",
      title: "Provider Batch",
      subtitle: "รอบถอนผู้ให้บริการมาตรฐาน",
    },
    {
      id: "provider_instant",
      title: "Provider Instant",
      subtitle: "ถอนด่วนผู้ให้บริการ",
    },
  ];

  const updateWithdrawalLane = (
    lane: WithdrawalLaneId,
    partial: Partial<WithdrawalFeePolicyLaneResolved>,
  ) => {
    setWithdrawalDraft((prev) => {
      if (!prev) return prev;
      const cur = prev[lane];
      return {
        ...prev,
        [lane]: { ...cur, ...partial } as WithdrawalFeePolicyLaneResolved,
      };
    });
  };

  const setWithdrawalMode = (
    lane: WithdrawalLaneId,
    mode: "flat" | "percent",
    fallbackStd: number,
    fallbackPct: number,
  ) => {
    setWithdrawalDraft((prev) => {
      if (!prev) return prev;
      if (mode === "flat") {
        const next: WithdrawalFeePolicyLaneResolved = {
          mode: "flat",
          fee_thb:
            prev[lane].mode === "flat" ? prev[lane].fee_thb : fallbackStd,
          eta_label_th: prev[lane].eta_label_th ?? "",
        };
        return { ...prev, [lane]: next };
      }
      const pctPrev = prev[lane];
      const next: WithdrawalFeePolicyLaneResolved = {
        mode: "percent",
        percent: pctPrev.mode === "percent" ? pctPrev.percent : fallbackPct,
        min_fee_thb: pctPrev.mode === "percent" ? pctPrev.min_fee_thb : 0,
        max_fee_thb: pctPrev.mode === "percent" ? pctPrev.max_fee_thb : null,
        eta_label_th: prev[lane].eta_label_th ?? "",
      };
      return { ...prev, [lane]: next };
    });
  };

  const fetchSettings = async () => {
    if (!useBackend) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getFinancialControlSettings();
      setSettings(res);
      setEdited({});
      if (res.withdrawal_fee_policy) {
        setWithdrawalDraft(
          JSON.parse(
            JSON.stringify(res.withdrawal_fee_policy),
          ) as WithdrawalFeePolicyFull,
        );
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load control settings");
      setSettings(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, [useBackend]);

  const handleSave = async () => {
    if (
      !useBackend ||
      (Object.keys(edited).length === 0 && !withdrawalPolicyDirty())
    )
      return;
    setSaving(true);
    setError(null);
    try {
      const patchBody = {
        ...edited,
        ...(withdrawalPolicyDirty() && withdrawalDraft
          ? { withdrawal_fee_policy: withdrawalDraft }
          : {}),
      };
      const updated = await patchFinancialControlSettings(patchBody);
      setSettings(updated);
      setEdited({});
      if (updated.withdrawal_fee_policy) {
        setWithdrawalDraft(
          JSON.parse(
            JSON.stringify(updated.withdrawal_fee_policy),
          ) as WithdrawalFeePolicyFull,
        );
      }
      alert(
        "Control settings saved. Changes are logged in financial_audit_log.",
      );
    } catch (e: any) {
      setError(e?.message || "Failed to save");
    }
    setSaving(false);
  };

  function withdrawalPolicyDirty(): boolean {
    if (!settings?.withdrawal_fee_policy || !withdrawalDraft) return false;
    return (
      JSON.stringify(settings.withdrawal_fee_policy) !==
      JSON.stringify(withdrawalDraft)
    );
  }

  useEffect(() => {
    if (!useBackend || !withdrawalDraft) return undefined;
    const t = window.setTimeout(() => {
      void previewAdminWithdrawalFee({
        payout_amount_thb: previewAmount,
        channel: previewChannel,
        is_provider: previewIsProvider,
        instant_payout: previewInstant,
        withdrawal_fee_policy_draft: withdrawalDraft,
      })
        .then((r) => {
          if (r?.ok !== false && r?.fee_thb !== undefined) {
            setPreviewResult(r);
            setPreviewError(null);
          }
        })
        .catch((e: any) => {
          setPreviewError(
            e?.response?.data?.error || e?.message || "Preview failed",
          );
          setPreviewResult(null);
        });
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    useBackend,
    withdrawalDraft,
    previewAmount,
    previewChannel,
    previewIsProvider,
    previewInstant,
  ]);

  const updateThreshold = (
    key: keyof FinancialControlSettingsResponse,
    value: number,
  ) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  const updateFeeRate = (
    category: "platform_fee" | "commission_match_board" | "commission_booking",
    tier: string,
    value: number,
  ) => {
    const current = settings?.fee_rates?.[category] || {};
    const editedRates = (edited.fee_rates?.[category] ?? current) as Record<
      string,
      number
    >;
    setEdited((prev) => ({
      ...prev,
      fee_rates: {
        ...(prev.fee_rates || settings?.fee_rates || {}),
        [category]: { ...editedRates, [tier]: value },
      },
    }));
  };

  const updateScalarFee = (
    key:
      | "handling_fee_percent"
      | "payment_markup_percent"
      | "booking_sourcing_percent"
      | "bidding_fee_percent",
    value: number,
  ) => {
    setEdited((prev) => ({
      ...prev,
      fee_rates: {
        ...(prev.fee_rates || settings?.fee_rates || {}),
        [key]: value,
      },
    }));
  };

  const updateVipTier = (
    tier: (typeof VIP_SUBSCRIPTION_TIERS)[number],
    field: "priceMonthly" | "quotaPerMonth" | "discountPercent",
    value: number,
  ) => {
    setEdited((prev) => ({
      ...prev,
      vip_tiers: {
        ...(prev.vip_tiers || settings?.vip_tiers || {}),
        [tier]: {
          ...(prev.vip_tiers?.[tier] ?? settings?.vip_tiers?.[tier] ?? {}),
          [field]: value,
        },
      },
    }));
  };

  const updateMiscFee = (
    field:
      | "certified_statement_fee_thb"
      | "certified_statement_fee_min_thb"
      | "certified_statement_fee_max_thb",
    value: number,
  ) => {
    setEdited((prev) => ({
      ...prev,
      misc_fees: {
        ...(prev.misc_fees || settings?.misc_fees || {}),
        [field]: value,
      },
    }));
  };

  if (!useBackend) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
        <Settings size={48} className="mx-auto mb-4 text-slate-400" />
        <p>Financial Control Settings require Admin login (JWT).</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  const effective = {
    ...settings,
    ...edited,
  } as FinancialControlSettingsResponse;
  const hasChanges = Object.keys(edited).length > 0 || withdrawalPolicyDirty();

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Settings size={22} /> Administrative Steering
        </h2>
        <p className="text-indigo-100 text-sm">
          Edit payout thresholds and fee percentages. All changes are logged to
          financial_audit_log (action: SETTING_CHANGE).
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* DB-driven fee notice */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
        <Lock className="text-emerald-600 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-medium text-emerald-800">
            ค่าธรรมเนียมจองอ่านจาก DB แล้ว (Profile A + B)
          </p>
          <p className="text-sm text-emerald-700 mt-1">
            Slot booking ใช้ <code className="text-xs">fee_rates</code> ·
            Merchant Hub ใช้{" "}
            <code className="text-xs">beauty_booking_policy</code> —
            แก้ด้านล่างแล้วมีผลทันทีที่ backend คำนวณ ดูอ้างอิงเดิมได้ที่แท็บ
            &quot;Fee Structure (LOCKED)&quot;
          </p>
        </div>
      </div>

      {/* AQOND Fee Structure: Handling Fee 8% + Payment Markup 5% */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
            <DollarSign size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">AQOND Fee Structure</h3>
            <p className="text-sm text-slate-500">
              Handling Fee (ค่าจัดหา) & Payment Markup (ส่วนต่าง Omise)
            </p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Handling Fee % (หักจาก jobFee)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={
                edited.fee_rates?.handling_fee_percent ??
                effective?.fee_rates?.handling_fee_percent ??
                8
              }
              onChange={(e) =>
                updateScalarFee(
                  "handling_fee_percent",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-24 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="ml-2 text-slate-500">%</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Payment Markup % (Employer จ่ายเพิ่ม)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={
                edited.fee_rates?.payment_markup_percent ??
                effective?.fee_rates?.payment_markup_percent ??
                5
              }
              onChange={(e) =>
                updateScalarFee(
                  "payment_markup_percent",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-24 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <span className="ml-2 text-slate-500">%</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 px-6 pb-4">
          Handling Fee: หักจาก jobFee ทันที (Match & Advance). Payment Markup:
          Employer จ่าย (jobFee + insurance) × (1 + markup%) เพื่อครอบคลุม Omise
          3.9% และกำไรส่วนต่าง.
        </p>
      </div>

      {/* Payout Thresholds */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
            <Shield size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Payout Thresholds</h3>
            <p className="text-sm text-slate-500">
              Linked to payout-engine logic
            </p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Min Jobs (before withdrawal)
            </label>
            <input
              type="number"
              min={0}
              value={
                edited.withdrawal_min_jobs ??
                effective?.withdrawal_min_jobs ??
                10
              }
              onChange={(e) =>
                updateThreshold(
                  "withdrawal_min_jobs",
                  parseInt(e.target.value, 10) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Min Balance (THB)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={
                edited.withdrawal_min_balance_thb ??
                effective?.withdrawal_min_balance_thb ??
                650
              }
              onChange={(e) =>
                updateThreshold(
                  "withdrawal_min_balance_thb",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Standard Withdrawal Fee (THB)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={
                edited.withdrawal_fee_standard_thb ??
                effective?.withdrawal_fee_standard_thb ??
                35
              }
              onChange={(e) =>
                updateThreshold(
                  "withdrawal_fee_standard_thb",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Instant Withdrawal Fee (THB)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={
                edited.withdrawal_fee_instant_thb ??
                effective?.withdrawal_fee_instant_thb ??
                50
              }
              onChange={(e) =>
                updateThreshold(
                  "withdrawal_fee_instant_thb",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Withdrawal fee policy (premium) */}
      {withdrawalDraft && (
        <div className="rounded-xl border border-emerald-700/40 bg-gradient-to-br from-emerald-50 via-white to-slate-50 shadow-lg overflow-hidden">
          <div className="px-6 py-5 border-b border-emerald-900/10 bg-emerald-900 text-white flex flex-wrap gap-4 items-start">
            <div className="p-2 rounded-lg bg-emerald-800 shrink-0">
              <Wallet size={22} className="text-emerald-200" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-lg tracking-tight">
                ค่าธรรมเนียมถอน Wallet
              </h3>
              <p className="text-emerald-100/95 text-sm mt-1 leading-relaxed">
                ตั้งราคาแยกตามช่องทาง — พร้อมตัวอย่าง quote แบบ real-time
                และบันทึกลง{" "}
                <code className="text-xs bg-emerald-950/50 px-1 rounded">
                  financial_audit_log
                </code>
              </p>
            </div>
          </div>
          <div className="p-5 md:p-6 space-y-5">
            <div className="rounded-xl border border-amber-400/70 bg-gradient-to-r from-amber-50 to-amber-50/50 px-4 py-3 text-sm text-amber-950 shadow-sm leading-relaxed">
              <strong>สำคัญ:</strong> การเปลี่ยนค่าที่นี่ส่งผลเฉพาะ{" "}
              <em>การสร้างคำขอถอนในอนาคต</em> เท่านั้น —
              <span className="font-semibold text-amber-950">
                {" "}
                คำขอที่สร้างแล้วยังเก็บค่าธรรมเนียม snapshot ในระบบ
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  processor_cost_estimate_thb
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={withdrawalDraft.processor_cost_estimate_thb}
                  onChange={(e) =>
                    setWithdrawalDraft({
                      ...withdrawalDraft,
                      processor_cost_estimate_thb: Math.max(
                        0,
                        parseFloat(e.target.value) || 0,
                      ),
                    })
                  }
                  className="w-36 px-3 py-2 border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-mono text-sm"
                />
              </div>
              <p className="text-xs text-slate-500 max-w-md pb-2">
                ใช้ประมาณต้นทุนประมวลผลเมื่อคำนวณ margin platform (ไม่เป็น
                snapshot ใน payout_requests)
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {withdrawalLaneDefs.map(({ id, title, subtitle }) => {
                const lane = withdrawalDraft[id];
                const allowPercent =
                  id === "truemoney" ||
                  id === "promptpay" ||
                  id === "bank_transfer";
                return (
                  <div
                    key={id}
                    className="rounded-xl border border-slate-200/90 bg-white/95 p-4 shadow-sm space-y-3 ring-1 ring-slate-100"
                  >
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {subtitle}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold bg-emerald-50 px-2 py-1 rounded-full h-fit shrink-0">
                        {lane.mode}
                      </span>
                    </div>
                    {allowPercent ? (
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-slate-500">โหมด</span>
                        <select
                          value={lane.mode === "percent" ? "percent" : "flat"}
                          onChange={(e) =>
                            setWithdrawalMode(
                              id,
                              e.target.value as "flat" | "percent",
                              effective.withdrawal_fee_standard_thb,
                              3.6,
                            )
                          }
                          className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50"
                        >
                          <option value="flat">Flat (THB)</option>
                          <option value="percent">Percent (%)</option>
                        </select>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">
                        ผู้ให้บริการ: เรียกเก็บแบบ flat จาก lane ของ provider
                      </p>
                    )}
                    {lane.mode === "flat" ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-slate-500">
                            fee_thb
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={lane.fee_thb}
                            onChange={(e) =>
                              updateWithdrawalLane(id, {
                                fee_thb: Math.max(
                                  0,
                                  parseFloat(e.target.value) || 0,
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-slate-500">
                            ข้อความ ETA (ภาษาไทย)
                          </label>
                          <input
                            type="text"
                            value={lane.eta_label_th ?? ""}
                            onChange={(e) =>
                              updateWithdrawalLane(id, {
                                eta_label_th: e.target.value,
                              })
                            }
                            maxLength={280}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1 text-sm"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-slate-500">
                            %
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={50}
                            step={0.05}
                            value={lane.percent}
                            onChange={(e) =>
                              updateWithdrawalLane(id, {
                                ...lane,
                                percent: Math.min(
                                  50,
                                  Math.max(0, parseFloat(e.target.value) || 0),
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-slate-500">
                            min_fee_thb
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={lane.min_fee_thb}
                            onChange={(e) =>
                              updateWithdrawalLane(id, {
                                ...lane,
                                min_fee_thb: Math.max(
                                  0,
                                  parseFloat(e.target.value) || 0,
                                ),
                              })
                            }
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1"
                          />
                        </div>
                        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                          <label className="text-xs font-medium text-slate-500">
                            max_fee_thb (ว่าง = ไม่จำกัด)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="ไม่จำกัด"
                            value={
                              lane.max_fee_thb === null
                                ? ""
                                : String(lane.max_fee_thb)
                            }
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              updateWithdrawalLane(id, {
                                ...lane,
                                max_fee_thb:
                                  v === ""
                                    ? null
                                    : Math.max(
                                        lane.min_fee_thb ?? 0,
                                        parseFloat(v) || 0,
                                      ),
                              });
                            }}
                            className="w-40 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-slate-500">
                            ข้อความ ETA
                          </label>
                          <input
                            type="text"
                            value={lane.eta_label_th ?? ""}
                            onChange={(e) =>
                              updateWithdrawalLane(id, {
                                ...lane,
                                eta_label_th: e.target.value,
                              } as WithdrawalFeePolicyLaneResolved)
                            }
                            maxLength={280}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg mt-1 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Preview calculator */}
            <div className="rounded-xl border border-slate-200 bg-slate-900 text-white p-5 shadow-inner">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Calculator size={18} className="text-teal-300" />
                <h4 className="font-bold text-sm tracking-wide uppercase text-slate-200">
                  ตัวอย่างถอนจริง (preview)
                </h4>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-slate-900">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    ยอดถอน THB
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={previewAmount}
                    onChange={(e) =>
                      setPreviewAmount(parseFloat(e.target.value) || 0)
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-600 bg-slate-950 text-emerald-200 font-mono text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    ลูกค้า · channel
                  </label>
                  <select
                    disabled={previewIsProvider}
                    value={previewChannel}
                    onChange={(e) =>
                      setPreviewChannel(e.target.value as typeof previewChannel)
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white text-sm border border-slate-300"
                  >
                    <option value="promptpay">PromptPay</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="truemoney">TrueMoney</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 lg:col-span-1 mt-6">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={previewIsProvider}
                      onChange={(e) => setPreviewIsProvider(e.target.checked)}
                      className="rounded border-slate-500"
                    />
                    <span className="text-xs text-slate-300 whitespace-nowrap">
                      Provider
                    </span>
                  </label>
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <label
                    className={`flex items-center gap-2 select-none ${!previewIsProvider ? "opacity-40" : ""}`}
                  >
                    <input
                      type="checkbox"
                      disabled={!previewIsProvider}
                      checked={previewInstant}
                      onChange={(e) => setPreviewInstant(e.target.checked)}
                      className="rounded border-slate-500"
                    />
                    <span className="text-xs text-slate-300 whitespace-nowrap">
                      Instant payout
                    </span>
                  </label>
                </div>
              </div>
              {previewError && (
                <p className="mt-4 text-xs text-rose-300">{previewError}</p>
              )}
              {previewResult && !previewError && (
                <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
                  {[
                    ["fee_thb", previewResult.fee_thb?.toLocaleString()],
                    [
                      "net_receive",
                      previewResult.net_receive?.toLocaleString(),
                    ],
                    [
                      "total_deduct",
                      previewResult.total_deduct?.toLocaleString(),
                    ],
                    [
                      "margin_thb",
                      previewResult.platform_margin_amount?.toLocaleString(),
                    ],
                    [
                      "processor_thb",
                      previewResult.processor_cost_estimate_thb?.toLocaleString(),
                    ],
                    ["lane", previewResult.fee_lane],
                  ].map(([k, v]) => (
                    <div
                      key={String(k)}
                      className="bg-slate-800/85 rounded-lg px-2 py-2 border border-slate-700"
                    >
                      <p className="text-slate-500 font-semibold lowercase">
                        {k}
                      </p>
                      <p className="text-emerald-200 font-mono mt-1">
                        {String(v ?? "—")}
                      </p>
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-4 lg:col-span-7 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700">
                    <p className="text-slate-500 font-semibold">eta_label_th</p>
                    <p className="text-slate-200 text-sm mt-1">
                      {previewResult.eta_label_th || "—"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Profile A — Slot-based Talent Booking */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
          Profile A — Slot Booking (Talents)
        </p>
        <p className="text-sm text-emerald-900 mt-1">
          ค่าธรรมเนียมจอง slot จาก{" "}
          <code className="text-xs bg-white/80 px-1 rounded">fee_rates</code> —
          ใช้ตอน pay-deposit / release-deposit และแสดงบนแอปมือถือ
        </p>
      </div>

      {/* Dynamic Fees by VIP Tier */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
            <Percent size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">
              Dynamic Fees (VIP Tiers)
            </h3>
            <p className="text-sm text-slate-500">
              Client Platform Fee & Partner Commission (JobMatch, JobBoard,
              Booking)
            </p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Tier
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Platform Fee % (Client)
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Commission Match/Board % (Partner)
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Commission Booking % (Partner)
                </th>
              </tr>
            </thead>
            <tbody>
              {VIP_TIERS.map((tier) => (
                <tr
                  key={tier}
                  className="border-b border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="py-3 px-4 font-medium capitalize">
                    {tier === "none" ? "Non-VIP" : tier}
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={
                        edited.fee_rates?.platform_fee?.[tier] ??
                        effective?.fee_rates?.platform_fee?.[tier] ??
                        0
                      }
                      onChange={(e) =>
                        updateFeeRate(
                          "platform_fee",
                          tier,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                    %
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={
                        edited.fee_rates?.commission_match_board?.[tier] ??
                        effective?.fee_rates?.commission_match_board?.[tier] ??
                        0
                      }
                      onChange={(e) =>
                        updateFeeRate(
                          "commission_match_board",
                          tier,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                    %
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={
                        edited.fee_rates?.commission_booking?.[tier] ??
                        effective?.fee_rates?.commission_booking?.[tier] ??
                        0
                      }
                      onChange={(e) =>
                        updateFeeRate(
                          "commission_booking",
                          tier,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-3">
            Platform Fee: charged to employer/client. Commission: deducted from
            provider/partner earnings.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Booking Sourcing % (fixed)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={
                  edited.fee_rates?.booking_sourcing_percent ??
                  effective?.fee_rates?.booking_sourcing_percent ??
                  8
                }
                onChange={(e) =>
                  updateScalarFee(
                    "booking_sourcing_percent",
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-24 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="ml-2 text-slate-500">%</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Bidding Fee % (surplus only)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={
                  edited.fee_rates?.bidding_fee_percent ??
                  effective?.fee_rates?.bidding_fee_percent ??
                  9.3
                }
                onChange={(e) =>
                  updateScalarFee(
                    "bidding_fee_percent",
                    parseFloat(e.target.value) || 0,
                  )
                }
                className="w-24 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="ml-2 text-slate-500">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Profile B — Service Merchant Hub */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-800">
          Profile B — Merchant Hub (Beauty / Barber / Chef / Tailor / Artist)
        </p>
        <p className="text-sm text-indigo-900 mt-1">
          นโยบายแยกจาก slot — บันทึกที่{" "}
          <code className="text-xs bg-white/80 px-1 rounded">
            beauty_booking_policy
          </code>
        </p>
      </div>

      <MerchantHubBookingFeesPanel
        embedded
        onNotice={(msg) => setError(null)}
      />

      {/* Misc fees — certified income statement (not payout withdrawal) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-sky-100 rounded-lg text-sky-600">
            <FileText size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">
              ใบรับรองรายได้ (Certified statement)
            </h3>
            <p className="text-sm text-slate-500">
              ค่าธรรมเนียมหักจาก Wallet — แอปมือถือดึงจาก GET
              /api/payouts/settings
            </p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              ค่าธรรมเนียม (THB / ใบ)
            </label>
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={
                edited.misc_fees?.certified_statement_fee_thb ??
                effective?.misc_fees?.certified_statement_fee_thb ??
                50
              }
              onChange={(e) =>
                updateMiscFee(
                  "certified_statement_fee_thb",
                  parseFloat(e.target.value) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              ขั้นต่ำที่อนุญาต (THB)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={
                edited.misc_fees?.certified_statement_fee_min_thb ??
                effective?.misc_fees?.certified_statement_fee_min_thb ??
                25
              }
              onChange={(e) =>
                updateMiscFee(
                  "certified_statement_fee_min_thb",
                  parseInt(e.target.value, 10) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              สูงสุดที่อนุญาต (THB)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={
                edited.misc_fees?.certified_statement_fee_max_thb ??
                effective?.misc_fees?.certified_statement_fee_max_thb ??
                100
              }
              onChange={(e) =>
                updateMiscFee(
                  "certified_statement_fee_max_thb",
                  parseInt(e.target.value, 10) || 0,
                )
              }
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-slate-500 px-6 pb-4">
          ระบบจะ clamp ค่าธรรมเนียมให้อยู่ในช่วง min–max และ sync ไป tax_config
          (legacy) เมื่อบันทึก
        </p>
      </div>

      {/* VIP subscription pricing (mobile app + wallet debit) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
            <Crown size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">
              VIP Subscription Pricing
            </h3>
            <p className="text-sm text-slate-500">
              ราคา/โควตา/ส่วนลดต่อเดือน — แสดงบนแอปมือถือและหักจาก Wallet
              เมื่อสมัคร (ไม่มี QR แยก)
            </p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Tier
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Price (THB / month)
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Quota / month
                </th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">
                  Discount % (client)
                </th>
              </tr>
            </thead>
            <tbody>
              {VIP_SUBSCRIPTION_TIERS.map((tier) => (
                <tr
                  key={tier}
                  className="border-b border-slate-100 hover:bg-slate-50/50"
                >
                  <td className="py-3 px-4 font-medium capitalize">{tier}</td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={
                        edited.vip_tiers?.[tier]?.priceMonthly ??
                        effective?.vip_tiers?.[tier]?.priceMonthly ??
                        0
                      }
                      onChange={(e) =>
                        updateVipTier(
                          tier,
                          "priceMonthly",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-28 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={
                        edited.vip_tiers?.[tier]?.quotaPerMonth ??
                        effective?.vip_tiers?.[tier]?.quotaPerMonth ??
                        0
                      }
                      onChange={(e) =>
                        updateVipTier(
                          tier,
                          "quotaPerMonth",
                          parseInt(e.target.value, 10) || 0,
                        )
                      }
                      className="w-24 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={
                        edited.vip_tiers?.[tier]?.discountPercent ??
                        effective?.vip_tiers?.[tier]?.discountPercent ??
                        0
                      }
                      onChange={(e) =>
                        updateVipTier(
                          tier,
                          "discountPercent",
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-20 px-2 py-1.5 border border-slate-200 rounded text-center"
                    />
                    %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-slate-500 mt-3">
            ค่าเหล่านี้ถูก merge กับค่าเริ่มต้นของระบบ — แอปมือถือดึงจาก API
            เดียวกับ Financial Dashboard เพื่อให้ตัวเลขสอดคล้องกัน
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={fetchSettings}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <RefreshCw size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          {saving ? "Saving..." : "Save (Logs to financial_audit_log)"}
        </button>
        {hasChanges && (
          <span className="text-sm text-amber-600 font-medium">
            Unsaved changes
          </span>
        )}
      </div>
    </div>
  );
};
