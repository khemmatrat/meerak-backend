import React from "react";
import { Link } from "react-router-dom";
import { User, MapPin, FileText, MessageCircle, Mail } from "lucide-react";
import { companyLegal, entityType, formatAddressMultiline } from "../config/companyLegal";

/**
 * Footer ผู้ให้บริการแพลตฟอร์ม — บุคคลธรรมดาไม่แสดงเป็นนิติบุคคลประเภทบริษัทจำกัด
 * ดีไซน์เน้นความชัดเจนสำหรับผู้ตรวจ (เช่น Stripe) และสอดคล้องกับ Legal shell ใหม่
 */
export const LegalPublicFooter: React.FC = () => {
  const lines = formatAddressMultiline(companyLegal.address);
  const isIndividual = entityType === "individual";

  return (
    <footer className="mt-16 sm:mt-20 rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/95 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/[0.05] overflow-hidden">
      <div className="border-b border-slate-100/90 bg-slate-50/60 px-5 py-4 sm:px-8 sm:py-5">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500">
          ข้อมูลยืนยันตัวตนผู้ประกอบการ
        </p>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed max-w-2xl">
          {isIndividual
            ? "แสดงชื่อ ที่อยู่ติดต่อ สถานะทะเบียนพาณิชย์อิเล็กทรอนิกส์ และช่องทางติดต่อ — สอดคล้องกับข้อความในหน้านโยบายและข้อกำหนด"
            : "แสดงชื่อนิติบุคคล ที่อยู่จดทะเบียน และช่องทางติดต่อ"}
        </p>
      </div>

      <div className="px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-5">
          {isIndividual
            ? "ข้อมูลผู้ให้บริการแพลตฟอร์ม (บุคคลธรรมดา)"
            : "ข้อมูลนิติบุคคล"}
        </p>
        <div className="space-y-6 text-[15px] leading-relaxed text-slate-800">
          <div className="flex gap-4">
            <User className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="font-serif text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
                {companyLegal.name}
              </p>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                {isIndividual
                  ? "ผู้ให้บริการแพลตฟอร์ม AQOND — บุคคลธรรมดา (ไม่ใช่นิติบุคคลประเภทบริษัทจำกัด)"
                  : "ผู้ให้บริการแพลตฟอร์ม AQOND"}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <MapPin className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {isIndividual ? "ที่อยู่ติดต่อ / ที่พักอาศัย" : "ที่อยู่จดทะเบียน"}
              </p>
              <address className="not-italic mt-2 text-slate-900 font-medium">
                {lines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </address>
            </div>
          </div>
          <div className="flex gap-4">
            <FileText className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-4">
              {isIndividual ? (
                <>
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      ทะเบียนพาณิชย์อิเล็กทรอนิกส์ (DBD e-Registration)
                    </p>
                    <p className="mt-2 text-slate-900 font-semibold">{companyLegal.dbdEcommerceStatus}</p>
                  </div>
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      สถานะผู้ประกอบการ
                    </p>
                    <p className="mt-2 text-slate-800 leading-relaxed">{companyLegal.registrationNote}</p>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    ไม่แสดงเลขบัตรประชาชนบนหน้าเว็บสาธารณะ — ใช้เฉพาะการยืนยันตัวตนกับผู้ให้บริการชำระเงิน (เช่น Stripe) ตามที่ระบบระบุ
                  </p>
                </>
              ) : (
                <div>
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    เลขทะเบียนพาณิชย์
                  </p>
                  <p className="mt-2 text-slate-900 leading-relaxed">
                    {companyLegal.companyRegistrationNo || companyLegal.registrationNote}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-4">
            <MessageCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-500">LINE</p>
              <p className="mt-2 font-mono text-slate-900">ID: {companyLegal.lineId}</p>
            </div>
          </div>
        </div>
        <div className="mt-10 pt-8 border-t border-slate-200/80">
          <p className="text-xs text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Mail className="w-3.5 h-3.5 inline shrink-0 text-emerald-700" aria-hidden />
            <span className="font-medium text-slate-700">อีเมลติดต่อ:</span>
            <a
              href={`mailto:${companyLegal.contactEmail}`}
              className="text-emerald-800 hover:underline font-semibold"
            >
              {companyLegal.contactEmail}
            </a>
          </p>
          <p className="mt-4 text-xs text-slate-500 leading-relaxed">
            อีเมล {companyLegal.contactEmail} ต้องตั้งค่าให้<strong>รับข้อความได้จริง</strong> (รวมตรวจโฟลเดอร์สแปม)
            เพราะผู้ให้บริการชำระเงินอาจส่งอีเมลยืนยันหรือแจ้งเตือน — ระบบในโค้ดไม่สามารถตรวจสอบว่า inbox ใช้งานได้หรือไม่
          </p>
          <nav className="mt-6 text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-1" aria-label="หน้าเกี่ยวกับการลบบัญชีและข้อกำหนด">
            <Link to="/terms" className="text-emerald-800 hover:underline">
              ข้อกำหนดการให้บริการ
            </Link>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <Link to="/privacy" className="text-emerald-800 hover:underline">
              นโยบายความเป็นส่วนตัว
            </Link>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <Link to="/account-deletion" className="text-emerald-800 hover:underline">
              ขอลบบัญชีและข้อมูล
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
