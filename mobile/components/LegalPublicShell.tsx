import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LegalPublicFooter } from "./LegalPublicFooter";

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

/** เปลือกหน้าเว็บสาธารณะ — ไม่บังคับ login */
export const LegalPublicShell: React.FC<Props> = ({ title, subtitle, children }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-800">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            to="/welcome"
            className="p-2 rounded-full text-slate-600 hover:bg-slate-100 transition-colors shrink-0"
            aria-label="กลับ"
          >
            <ArrowLeft size={20} />
          </Link>
          <Link
            to="/welcome"
            className="flex items-center gap-2 shrink-0 min-w-0"
            aria-label="AQOND หน้าแรก"
          >
            <img
              src="/logo.png"
              alt=""
              className="h-9 w-9 object-contain rounded-lg"
              width={36}
              height={36}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-slate-900 truncate text-base sm:text-lg">{title}</h1>
            {subtitle ? <p className="text-xs text-slate-500 truncate">{subtitle}</p> : null}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-10 pb-12 sm:pb-14">
        <article className="prose prose-slate prose-headings:font-semibold prose-a:text-emerald-700 max-w-none">
          {children}
        </article>
        {/* ข้อมูลยืนยันตัวตนผู้ประกอบการ — ซ้ำกับบล็อกในข้อติดต่อเพื่อให้มองเห็นชัดทั้งในเนื้อหาและท้ายหน้า */}
        <LegalPublicFooter />
      </main>
    </div>
  );
};
