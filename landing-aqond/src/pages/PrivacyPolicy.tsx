import React, { useEffect } from 'react';
import { Shield, ChevronLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  useEffect(() => {
    document.title = 'Privacy Policy - AQOND Technology';
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B]">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="AQOND" className="h-10 w-10 object-contain" />
            <span className="text-xl font-bold text-slate-900 tracking-tight">AQOND</span>
          </a>
          <a
            href="/"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            <ChevronLeft size={20} /> กลับหน้าหลัก
          </a>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12 max-w-3xl">
        <div className="mb-8">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-200/80 text-slate-700 text-sm font-medium mb-4">
            <Shield size={16} /> Privacy Policy
          </span>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">
            นโยบายความเป็นส่วนตัว - AQOND Technology
          </h1>
          <p className="text-slate-500 text-sm">Version 2.0 • 3/4/2026</p>
          <p className="text-slate-600 mt-2">มีผลตั้งแต่: 2026-03-04</p>
        </div>

        <p className="text-slate-600 mb-8 leading-relaxed">
          นโยบายนี้จัดทำตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)
        </p>

        <article className="space-y-8 text-slate-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">1. ข้อมูลที่เราเก็บรวบรวม</h2>
            <p>
              เราเก็บข้อมูลส่วนบุคคลของคุณเมื่อคุณสมัครใช้บริการ AQOND รวมถึง:
            </p>
            <ul className="mt-2 list-disc list-inside space-y-1 pl-2">
              <li>ชื่อ-นามสกุล, อีเมล, หมายเลขโทรศัพท์</li>
              <li>ข้อมูลการชำระเงินและธนาคาร</li>
              <li>ข้อมูล KYC (บัตรประชาชน, หลักฐานที่อยู่)</li>
              <li>ข้อมูลการใช้งาน (IP, Device, Log)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">2. วัตถุประสงค์การเก็บรวบรวม</h2>
            <p>
              เราใช้ข้อมูลเพื่อ: ให้บริการแพลตฟอร์ม, ประมวลผลธุรกรรม, ตรวจสอบตัวตน (KYC), ป้องกันการฉ้อโกง, ปรับปรุงคุณภาพบริการ, และปฏิบัติตามกฎหมาย
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">3. การแบ่งปันข้อมูล</h2>
            <p>
              เราไม่ขายข้อมูลของคุณ แต่อาจแบ่งปันกับ: Payment Gateway, หน่วยงานกำกับดูแล, และเมื่อกฎหมายกำหนด
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">4. การเก็บรักษาและความปลอดภัย</h2>
            <p>
              เราใช้มาตรการรักษาความปลอดภัยระดับสูง ข้อมูลถูกเก็บรักษาตามระยะเวลาที่จำเป็นหรือตามกฎหมาย
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">5. สิทธิของคุณ (PDPA)</h2>
            <p>
              คุณมีสิทธิ์: เข้าถึงข้อมูล, แก้ไข, ลบ, จำกัดการประมวลผล, โอนข้อมูล, และคัดค้านการประมวลผล สามารถดำเนินการได้ผ่าน Settings หรือติดต่อ DPO
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">6. ติดต่อเรา</h2>
            <p>
              DPO / Privacy: <a href="mailto:privacy@aqond.com" className="text-blue-600 hover:underline font-medium">privacy@aqond.com</a>
            </p>
          </section>
        </article>

        <div className="mt-12 pt-8 border-t border-slate-200">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft size={18} /> กลับหน้าหลัก
          </a>
        </div>
      </main>
    </div>
  );
}
