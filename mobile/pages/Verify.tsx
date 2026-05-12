import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ShieldCheck, User, TrendingUp, AlertCircle } from "lucide-react";
import { getBackendBase } from "../services/api";

interface VerifyResult {
  verified: boolean;
  error?: string;
  partner_name?: string;
  period_from?: string;
  period_to?: string;
  total_income?: number;
  transaction_count?: number;
  average_income?: number;
  issued_at?: string;
  verification_code?: string;
}

export const Verify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q) {
      setResult({ verified: false, error: "ไม่มีรหัสตรวจสอบ" });
      setLoading(false);
      return;
    }
    const base = getBackendBase();
    fetch(`${base}/api/verify/statement?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((data) => setResult(data))
      .catch(() => setResult({ verified: false, error: "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้" }))
      .finally(() => setLoading(false));
  }, [q]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 tracking-wide">AQOND</h1>
          <p className="text-sm text-slate-500 mt-1">Scanner Verification</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 mt-4">กำลังตรวจสอบ...</p>
            </div>
          ) : result?.verified ? (
            <>
              {/* Security Seal */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-center gap-3">
                <ShieldCheck size={28} className="text-white" />
                <span className="text-white font-bold text-lg">Verified by Aqond Secure</span>
              </div>

              <div className="p-6 space-y-6">
                <div className="text-center py-4">
                  <p className="text-slate-700 font-medium text-lg">
                    เอกสารฉบับนี้ออกโดย Aqond จริง
                  </p>
                  <p className="text-slate-500 text-sm mt-1">
                    ใบรับรองรายได้ที่ออกโดยระบบ AQOND Technology
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                    <User size={20} className="text-slate-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">พาร์ทเนอร์</p>
                      <p className="font-semibold text-slate-800">{result.partner_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                    <TrendingUp size={20} className="text-slate-500 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500">ช่วงเวลา · ยอดรายได้เฉลี่ย</p>
                      <p className="font-semibold text-slate-800">
                        {result.period_from} – {result.period_to}
                      </p>
                      <p className="text-emerald-600 font-bold mt-1">
                        ฿{(result.average_income ?? 0).toLocaleString()} / รายการ
                      </p>
                      {result.transaction_count != null && result.transaction_count > 0 && (
                        <p className="text-xs text-slate-500 mt-1">
                          รวม {result.transaction_count} รายการ · ยอดรวม ฿{(result.total_income ?? 0).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200 text-center">
                  <p className="text-xs text-slate-400">
                    ออกเมื่อ {result.issued_at ? new Date(result.issued_at).toLocaleString("th-TH") : "-"}
                  </p>
                  <p className="text-xs text-slate-400 font-mono mt-1">{result.verification_code}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-amber-500 px-6 py-4 flex items-center justify-center gap-3">
                <AlertCircle size={24} className="text-white" />
                <span className="text-white font-bold">ไม่สามารถยืนยันได้</span>
              </div>
              <div className="p-8 text-center">
                <p className="text-slate-600">{result?.error || "รหัสไม่ถูกต้องหรือหมดอายุ"}</p>
                <p className="text-sm text-slate-500 mt-4">
                  กรุณาตรวจสอบรหัสจาก QR Code บนใบรับรองอีกครั้ง
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          AQOND Technology Co., Ltd. · ระบบตรวจสอบใบรับรองอัตโนมัติ
        </p>
      </div>
    </div>
  );
};
