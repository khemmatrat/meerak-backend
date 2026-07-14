import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Award, CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { verifyCourseCertificate } from "../services/courseMarketplaceService";

export default function CourseCertificateVerify() {
  const { code } = useParams<{ code: string }>();
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<{
    valid: boolean;
    courseTitle?: string;
    learnerName?: string;
    issuedAt?: string;
    verifyCode?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!code) {
        setResult({ valid: false, error: "ไม่พบรหัสใบรับรอง" });
        setLoading(false);
        return;
      }
      try {
        const data = await verifyCourseCertificate(code);
        if (!alive) return;
        setResult({ valid: true, ...data });
      } catch (e: any) {
        if (!alive) return;
        setResult({
          valid: false,
          error: e?.response?.data?.error || "รหัสใบรับรองไม่ถูกต้อง",
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  return (
    <div className="aqond-trust-theme course-flow-theme min-h-screen pb-24 px-4 pt-6">
      <div className="max-w-lg mx-auto luxury-card rounded-3xl p-8 text-center">
        {loading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-slate-800/50" />
        ) : result?.valid ? (
          <>
            <div className="inline-flex p-4 rounded-full bg-emerald-500/20 mb-4">
              <CheckCircle2 className="text-emerald-300" size={40} />
            </div>
            <h1 className="text-2xl font-black text-slate-100">ใบรับรองถูกต้อง</h1>
            <p className="text-sm text-slate-400 mt-2 inline-flex items-center gap-1 justify-center">
              <ShieldCheck size={14} /> ตรวจสอบโดย AQOND Course Marketplace
            </p>
            <div className="mt-6 text-left space-y-3 rounded-2xl border border-slate-700 p-4 bg-slate-900/50">
              <div>
                <p className="text-xs text-slate-500">ผู้เรียน</p>
                <p className="font-bold text-slate-100">{result.learnerName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">คอร์ส</p>
                <p className="font-bold text-emerald-300">{result.courseTitle}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">รหัสตรวจสอบ</p>
                <p className="font-mono text-amber-300">{result.verifyCode}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">ออกเมื่อ</p>
                <p className="text-slate-200">
                  {result.issuedAt
                    ? new Date(result.issuedAt).toLocaleDateString("th-TH", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="inline-flex p-4 rounded-full bg-rose-500/20 mb-4">
              <XCircle className="text-rose-300" size={40} />
            </div>
            <h1 className="text-2xl font-black text-slate-100">ไม่พบใบรับรอง</h1>
            <p className="text-slate-400 text-sm mt-2">{result?.error || "รหัสไม่ถูกต้องหรือหมดอายุ"}</p>
          </>
        )}

        <Link
          to="/courses"
          className="inline-flex items-center gap-2 mt-8 px-5 py-3 rounded-xl bg-emerald-600 text-white font-bold"
        >
          <Award size={18} /> กลับตลาดคอร์ส
        </Link>
      </div>
    </div>
  );
}
