/**
 * Fee Structure Panel — LOCKED REFERENCE
 * แสดงอัตราค่าธรรมเนียมตาม financialEngine.js (อ่านอย่างเดียว)
 */
import React from "react";
import { Lock, Briefcase, CalendarCheck } from "lucide-react";
import {
  VIP_TIERS,
  MATCH_SOURCING_RATE,
  MATCH_PLATFORM_COMMISSION_RATE,
  TAX_SERVICE_RATE,
  PAYMENT_MARKUP_RATE,
  BOOKING_COMMISSION_RATE,
  BOOKING_SOURCING_RATE,
  BIDDING_FEE_RATE,
  BOOKING_MARKUP_RATE,
} from "../constants/feeStructure";

const formatPercent = (v: number) => `${(v * 100).toFixed(0)}%`;

export const FeeStructurePanel: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Lock size={22} /> Fee Structure (LOCKED)
        </h2>
        <p className="text-slate-300 text-sm">
          อัตราตาม backend/lib/financialEngine.js — ใช้สำหรับอ้างอิงเท่านั้น ไม่สามารถแก้ไขได้
        </p>
      </div>

      {/* Match Job & Advance Job */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Briefcase size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Match Job & Advance Job</h3>
            <p className="text-sm text-slate-500">Provider side: Sourcing + Platform Commission + Tax (3% of Sourcing+Commission)</p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Tier</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Sourcing</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Platform Commission</th>
              </tr>
            </thead>
            <tbody>
              {VIP_TIERS.map((tier) => (
                <tr key={tier} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium capitalize">{tier === "none" ? "Non-VIP" : tier}</td>
                  <td className="py-3 px-4">{formatPercent(MATCH_SOURCING_RATE[tier])}</td>
                  <td className="py-3 px-4">{formatPercent(MATCH_PLATFORM_COMMISSION_RATE[tier])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span><strong>Tax Service:</strong> {formatPercent(TAX_SERVICE_RATE)} of (Sourcing + Commission)</span>
            <span><strong>Payment Markup (Employer):</strong> {formatPercent(PAYMENT_MARKUP_RATE)}</span>
          </div>
        </div>
      </div>

      {/* Booking Talents */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
            <CalendarCheck size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Booking Talents</h3>
            <p className="text-sm text-slate-500">Sourcing 8% + Booking Commission (ตาม VIP) + Bidding 9.3% (surplus เท่านั้น) + Markup (Employer)</p>
          </div>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Tier</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Booking Commission</th>
                <th className="text-left py-3 px-4 font-semibold text-slate-700">Markup (Employer)</th>
              </tr>
            </thead>
            <tbody>
              {VIP_TIERS.map((tier) => (
                <tr key={tier} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-medium capitalize">{tier === "none" ? "Non-VIP" : tier}</td>
                  <td className="py-3 px-4">{formatPercent(BOOKING_COMMISSION_RATE[tier])}</td>
                  <td className="py-3 px-4">{formatPercent(BOOKING_MARKUP_RATE[tier])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600">
            <span><strong>Sourcing:</strong> {formatPercent(BOOKING_SOURCING_RATE)} fixed</span>
            <span><strong>Bidding Fee:</strong> {formatPercent(BIDDING_FEE_RATE)} on surplus only</span>
          </div>
        </div>
      </div>
    </div>
  );
};
