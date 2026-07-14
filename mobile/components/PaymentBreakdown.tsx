/**
 * PaymentBreakdown — แสดงรายละเอียดการชำระเงินก่อนกดชำระ
 * รองรับทั้ง Job Match และ Job Advance (Escrow)
 *
 * Fee Model:
 * - Employer pays: Job Fee + Service Fee (5%) + Insurance (10% of Job Fee only)
 * - Platform Commission & Sourcing Fee: DEDUCTED from Talent's payout (rates vary by VIP tier)
 */
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, Shield, Lock, FileCheck, Scale, Crown, TrendingUp } from "lucide-react";

export interface PaymentBreakdownItem {
  label: string;
  amount: number;
  percent?: number;
  tooltip?: string;
}

export interface PaymentBreakdownProps {
  /** ค่าจ้างงาน (jobFee / agreed amount) */
  jobFee: number;
  /** ค่าจัดหา (handling / sourcing) 8% — หักจาก Talent */
  handlingFeeAmount: number;
  /** ค่าบริการระบบ (markup) 5% — นายจ้างชำระ */
  paymentMarkupAmount: number;
  /** ค่าคอมมิชชั่นแพลตฟอร์ม 12–24% — หักจาก Talent */
  commissionFeeAmount: number;
  /** ยอดที่ Talent จะได้รับ */
  talentReceives: number;
  /** ยอดที่ผู้จ้างต้องชำระ */
  totalToPay: number;
  /** เบี้ยประกันงาน (10% ของ Job Fee เท่านั้น) */
  insuranceAmount?: number;
  /** โหมด: "match" = Job Match, "advance" = Job Advance Escrow */
  mode?: "match" | "advance";
  /** แสดงข้อความเปรียบเทียบกับ Agency */
  showComparison?: boolean;
  /** แสดงประโยชน์ที่ผู้จ้างได้ */
  showBenefits?: boolean;
  /** light = ธีมสว่าง (Payment page), dark = ธีมเข้ม (ManageAdvanceJob) */
  variant?: "light" | "dark";
  className?: string;
  /** Member Payout Comparison — payout by VIP tier (advance mode only) */
  payoutByTier?: Record<string, { payout: number; commissionPercent: number; sourcePercent: number; totalDeductionPercent: number; label: string; labelTh: string; isBestValue?: boolean }>;
  /** Talent's current VIP tier (none | silver | gold | platinum) */
  talentCurrentTier?: string;
}

const FEE_TOOLTIPS: Record<string, string> = {
  handling: "ค่าจัดหางาน — คัดกรอง Talent, จับคู่งาน (หักจากยอดที่ Talent จะได้รับ)",
  payment: "ค่าบริการระบบ — ช่องทางชำระเงินและความปลอดภัย (นายจ้างชำระ)",
  commission: "ค่าคอมมิชชั่นแพลตฟอร์ม — Escrow, การจัดการข้อพิพาท (หักจากยอดที่ Talent จะได้รับ)",
  insurance: "ประกันความเสียหายจากการทำงาน (10% ของค่าจ้างงานเท่านั้น)",
};

const FeeTooltip: React.FC<{ id: string; text: string }> = ({ id, text }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-slate-400 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 rounded-full p-0.5"
        aria-label="อธิบาย"
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span className="absolute left-0 top-full mt-1 z-50 px-3 py-2 text-xs text-slate-100 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-w-[220px] whitespace-normal">
          {text}
        </span>
      )}
    </span>
  );
};

const TIER_ORDER = ["normal", "silver", "gold", "platinum"] as const;

export const PaymentBreakdown: React.FC<PaymentBreakdownProps> = ({
  jobFee,
  handlingFeeAmount,
  paymentMarkupAmount,
  commissionFeeAmount,
  talentReceives,
  totalToPay,
  insuranceAmount = 0,
  mode = "match",
  showComparison = true,
  showBenefits = true,
  variant = "dark",
  className = "",
  payoutByTier,
  talentCurrentTier = "none",
}) => {
  const handlingPercent = jobFee > 0 ? Math.round((handlingFeeAmount / jobFee) * 100) : 8;
  const paymentPercent = jobFee > 0 ? Math.round((paymentMarkupAmount / jobFee) * 100) : 5;
  const commissionPercent = jobFee > 0 ? Math.round((commissionFeeAmount / jobFee) * 100) : 24;

  const formatBath = (n: number) => `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const isLight = variant === "light";
  const boxCls = isLight
    ? "rounded-xl border border-gray-200 bg-gray-50 overflow-hidden"
    : "rounded-xl border border-slate-600/80 bg-slate-800/50 overflow-hidden";
  const headerCls = isLight
    ? "px-4 py-3 bg-gray-100 border-b border-gray-200"
    : "px-4 py-3 bg-slate-700/50 border-b border-slate-600";
  const titleCls = isLight ? "font-bold text-gray-900 text-sm" : "font-bold text-slate-100 text-sm";
  const rowCls = isLight ? "text-gray-600" : "text-slate-300";
  const amountCls = isLight ? "font-mono text-gray-900" : "font-mono text-slate-100";
  const borderCls = isLight ? "border-gray-200" : "border-slate-600";
  const benefitsCls = isLight
    ? "rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 space-y-2"
    : "rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2";
  const benefitsTitleCls = isLight ? "font-medium text-emerald-700" : "font-medium text-emerald-400";
  const benefitsTextCls = isLight ? "text-sm text-gray-600" : "text-sm text-slate-300";
  const comparisonCls = isLight ? "text-xs text-gray-500 italic" : "text-xs text-slate-500 italic";

  const isAdvance = mode === "advance";

  return (
    <div className={`space-y-4 ${className}`}>
      <div className={boxCls}>
        <div className={headerCls}>
          <h4 className={titleCls}>รายละเอียดการชำระเงิน</h4>
        </div>
        <div className="p-4 space-y-4 text-sm">
          {isAdvance ? (
            <>
              {/* Employer section: Job Fee + Service Fee (5%) + Insurance */}
              <div className="space-y-2">
                <p className={`text-xs font-medium uppercase tracking-wide ${isLight ? "text-gray-500" : "text-slate-400"}`}>
                  ยอดที่คุณต้องชำระ
                </p>
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    ค่าจ้างงาน
                    <FeeTooltip id="jobFee" text="ยอดค่าจ้างงานที่ตกลงกัน (ฐานคำนวณ)" />
                  </span>
                  <span className={amountCls}>{formatBath(jobFee)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    ค่าบริการระบบ ({paymentPercent}%)
                    <FeeTooltip id="payment" text={FEE_TOOLTIPS.payment} />
                  </span>
                  <span className={amountCls}>{formatBath(paymentMarkupAmount)}</span>
                </div>
                {insuranceAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className={`${rowCls} flex items-center`}>
                      เบี้ยประกันงาน (10% ของค่าจ้างงาน)
                      <FeeTooltip id="insurance" text={FEE_TOOLTIPS.insurance} />
                    </span>
                    <span className={amountCls}>{formatBath(insuranceAmount)}</span>
                  </div>
                )}
              </div>

              <div className={`border-t ${borderCls} pt-3`}>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-amber-600 font-medium" : "text-amber-400 font-medium"}>
                    ยอดที่คุณต้องชำระ
                  </span>
                  <span className={`font-mono font-bold text-lg ${isLight ? "text-amber-600" : "text-amber-400"}`}>
                    {formatBath(totalToPay)}
                  </span>
                </div>
              </div>

              {/* Talent section: Job Fee − Platform Commission − Sourcing Fee */}
              <div className={`border-t ${borderCls} pt-4 mt-4 space-y-2`}>
                <p className={`text-xs font-medium uppercase tracking-wide ${isLight ? "text-gray-500" : "text-slate-400"}`}>
                  ยอดที่ Talent จะได้รับ
                </p>
                <div className="flex justify-between items-center">
                  <span className={rowCls}>ค่าจ้างงาน</span>
                  <span className={amountCls}>{formatBath(jobFee)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    หัก ค่าคอมมิชชั่นแพลตฟอร์ม ({commissionPercent}%)
                    <FeeTooltip id="commission" text={FEE_TOOLTIPS.commission} />
                  </span>
                  <span className={`${amountCls} text-red-400`}>−{formatBath(commissionFeeAmount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    หัก ค่าจัดหางาน ({handlingPercent}%)
                    <FeeTooltip id="handling" text={FEE_TOOLTIPS.handling} />
                  </span>
                  <span className={`${amountCls} text-red-400`}>−{formatBath(handlingFeeAmount)}</span>
                </div>
              </div>

              <div className={`border-t ${borderCls} pt-2`}>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-emerald-600 font-medium" : "text-emerald-400 font-medium"}>
                    ยอดที่ Talent จะได้รับ
                  </span>
                  <span className={`font-mono font-bold ${isLight ? "text-emerald-600" : "text-emerald-400"}`}>
                    {formatBath(talentReceives)}
                  </span>
                </div>
              </div>

              {/* Member Payout Comparison — Potential Earnings by VIP tier */}
              {payoutByTier && (
                <div className={`border-t ${borderCls} pt-4 mt-4 space-y-3`}>
                  <p className={`text-xs font-medium uppercase tracking-wide flex items-center gap-1 ${isLight ? "text-gray-500" : "text-slate-400"}`}>
                    <TrendingUp size={14} />
                    เปรียบเทียบยอดรับตามระดับสมาชิก
                  </p>
                  <div className="space-y-2">
                    {TIER_ORDER.map((tierId) => {
                      const t = payoutByTier[tierId];
                      if (!t) return null;
                      const isCurrent = (tierId === "normal" && talentCurrentTier === "none") || (tierId === talentCurrentTier);
                      const canUpgrade = !isCurrent && TIER_ORDER.indexOf(tierId) > TIER_ORDER.indexOf(talentCurrentTier === "none" ? "normal" : talentCurrentTier);
                      return (
                        <div
                          key={tierId}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-lg ${
                            t.isBestValue
                              ? isLight ? "bg-amber-50 border border-amber-200" : "bg-amber-500/15 border border-amber-500/40"
                              : isLight ? "bg-gray-50/80" : "bg-slate-700/30"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {t.isBestValue && <Crown size={16} className={isLight ? "text-amber-600" : "text-amber-400"} />}
                            <div>
                              <span className={`font-medium ${isLight ? "text-gray-900" : "text-slate-100"}`}>
                                {t.labelTh}
                                {t.isBestValue && (
                                  <span className={`ml-1 text-xs ${isLight ? "text-amber-600" : "text-amber-400"}`}>
                                    (ได้รับเงินเยอะที่สุด)
                                  </span>
                                )}
                              </span>
                              <span className={`block text-xs ${isLight ? "text-gray-500" : "text-slate-400"}`}>
                                หัก {t.totalDeductionPercent}% (Comm {t.commissionPercent}% + Sourcing {t.sourcePercent}%)
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`font-mono font-bold ${isLight ? "text-emerald-700" : "text-emerald-400"}`}>
                              {formatBath(t.payout)}
                            </span>
                            {canUpgrade && (
                              <Link
                                to="/vip"
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-charcoal-900 hover:bg-amber-400 transition-colors"
                              >
                                อัปเกรด
                              </Link>
                            )}
                            {isCurrent && (
                              <span className={`text-xs px-2 py-0.5 rounded ${isLight ? "bg-emerald-100 text-emerald-700" : "bg-emerald-500/20 text-emerald-400"}`}>
                                ปัจจุบัน
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Legacy layout for Job Match */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    ค่าจ้างงาน
                    <FeeTooltip id="jobFee" text="ยอดค่าจ้างงานที่ตกลงกัน" />
                  </span>
                  <span className={amountCls}>{formatBath(jobFee)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={`${rowCls} flex items-center`}>
                    ค่าบริการระบบ ({paymentPercent}%)
                    <FeeTooltip id="payment" text={FEE_TOOLTIPS.payment} />
                  </span>
                  <span className={amountCls}>{formatBath(paymentMarkupAmount)}</span>
                </div>
                {insuranceAmount > 0 && (
                  <div className="flex justify-between items-center">
                    <span className={`${rowCls} flex items-center`}>
                      เบี้ยประกันงาน (10%)
                      <FeeTooltip id="insurance" text={FEE_TOOLTIPS.insurance} />
                    </span>
                    <span className={amountCls}>{formatBath(insuranceAmount)}</span>
                  </div>
                )}
              </div>
              <div className={`border-t ${borderCls} pt-3 mt-2 space-y-2`}>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-emerald-600 font-medium" : "text-emerald-400 font-medium"}>
                    ยอดที่ Talent จะได้รับ
                  </span>
                  <span className={`font-mono font-bold ${isLight ? "text-emerald-600" : "text-emerald-400"}`}>
                    {formatBath(talentReceives)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className={isLight ? "text-amber-600 font-medium" : "text-amber-400 font-medium"}>
                    ยอดที่คุณต้องชำระ
                  </span>
                  <span className={`font-mono font-bold text-lg ${isLight ? "text-amber-600" : "text-amber-400"}`}>
                    {formatBath(totalToPay)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showBenefits && (
        <div className={benefitsCls}>
          <h5 className={`${benefitsTitleCls} flex items-center gap-2`}>
            <Shield size={16} />
            ประโยชน์ที่คุณได้รับ
          </h5>
          <ul className={`${benefitsTextCls} space-y-1`}>
            <li className="flex items-start gap-2">
              <Lock size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              เงินอยู่ใน Escrow จนกว่าจะยืนยันงานเสร็จ
            </li>
            <li className="flex items-start gap-2">
              <Scale size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              มีระบบจัดการข้อพิพาท
            </li>
            <li className="flex items-start gap-2">
              <FileCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
              มีการตรวจสอบและยืนยันตัวตน Talent
            </li>
          </ul>
        </div>
      )}

      {showComparison && (
        <p className={comparisonCls}>
          ค่าบริการระบบต่ำกว่าการจ้างผ่าน Agency — แพลตฟอร์มรับค่าธรรมเนียมจากยอดที่ Talent ได้รับ
        </p>
      )}
    </div>
  );
};
