import React from "react";
import { prbSectionCard, prbHeading } from "./prbTheme";

function formatPrbMoney(amount: number) {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function PrbPriceBreakdown({
  base,
  fee,
  discount,
  total,
  balance,
}: {
  base: number;
  fee: number;
  discount: number;
  total: number;
  balance?: number;
}) {
  return (
    <div className={prbSectionCard}>
      <h3 className={`mb-3 text-base ${prbHeading}`}>สรุปค่าใช้จ่าย</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">เบี้ย พ.ร.บ.</span>
          <span>฿{formatPrbMoney(base)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">ค่าบริการ</span>
          <span>฿{formatPrbMoney(fee)}</span>
        </div>
        {discount > 0 ? (
          <div className="flex justify-between text-amber-700">
            <span>ส่วนลด</span>
            <span>-฿{formatPrbMoney(discount)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-slate-100 pt-2 text-lg font-bold text-blue-950">
          <span>รวมชำระ</span>
          <span>฿{formatPrbMoney(total)}</span>
        </div>
        {balance != null ? (
          <div className="flex justify-between text-xs text-slate-500">
            <span>ยอด Wallet หลังชำระ</span>
            <span>฿{Math.max(0, balance - total).toLocaleString()}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
