import React, { useEffect } from 'react';
import { FileText, ChevronLeft } from 'lucide-react';

export default function TermsOfService() {
  useEffect(() => {
    document.title = 'ข้อตกลงและเงื่อนไขการใช้งาน - AQOND';
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90 backdrop-blur-md">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="AQOND" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold tracking-tight text-slate-900">AQOND</span>
          </a>
          <a
            href="/"
            className="flex items-center gap-2 font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <ChevronLeft size={20} /> กลับหน้าหลัก
          </a>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-6 py-12">
        <div className="mb-8">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-slate-200/80 px-3 py-1 text-sm font-medium text-slate-700">
            <FileText size={16} /> Terms of Service
          </span>
          <h1 className="mb-1 text-2xl font-bold text-slate-900 md:text-3xl">
            ข้อตกลงและเงื่อนไขการใช้งาน
          </h1>
          <p className="text-sm text-slate-500">AQOND Technology</p>
        </div>

        <article className="space-y-6 leading-relaxed text-slate-700">
          <p>
            เรากำลังจัดทำฉบับสมบูรณ์ของข้อตกลงและเงื่อนไขการใช้งานบริการ AQOND ให้สอดคล้องกับกฎหมายที่ใช้บังคับ
            รวมถึงการใช้งานแอปพลิเคชันและแพลตฟอร์ม — เอกสารฉบับเต็มจะประกาศให้ทราบผ่านหน้านี้และช่องทางอย่างเป็นทางการของบริษัท
          </p>
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            หากมีข้อสงสัยด้านกฎหมายหรือการใช้งาน โปรดติดต่อทีมงาน AQOND ผ่านช่องทางที่ระบุในเว็บไซต์
          </p>
        </article>
      </main>
    </div>
  );
}
