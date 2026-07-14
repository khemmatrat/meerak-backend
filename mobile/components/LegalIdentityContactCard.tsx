import React from "react";
import { MapPin, Mail, MessageCircle, FileText } from "lucide-react";
import { companyLegal, entityType, formatAddressMultiline } from "../config/companyLegal";

/**
 * บล็อกที่อยู่และช่องทางติดต่อ — ใช้ในข้อ "ติดต่อ" ของ Terms/Privacy (Stripe / หน่วยงาน)
 */
export const LegalIdentityContactCard: React.FC<{ className?: string }> = ({
  className = "",
}) => {
  const lines = formatAddressMultiline(companyLegal.address);
  const isIndividual = entityType === "individual";

  return (
    <div
      className={`not-prose rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_0_rgba(15,23,42,0.06)] ring-1 ring-slate-900/[0.04] p-5 sm:p-6 space-y-5 ${className}`}
    >
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-500 mb-2">
          ที่อยู่และช่องทางติดต่อ
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          รายละเอียดด้านล่างเป็นข้อมูลผู้ควบคุมข้อมูล / ผู้ให้บริการแพลตฟอร์ม สำหรับหน่วยงาน ผู้ให้บริการชำระเงิน
          และการตรวจสอบตัวตนธุรกิจ
        </p>
      </div>

      <div className="flex gap-3">
        <MapPin className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-slate-800 tracking-tight">
            {isIndividual ? "ที่อยู่ติดต่อ / ที่พักอาศัย (ลงทะเบียน)" : "ที่อยู่จดทะเบียน"}
          </p>
          <address className="not-italic mt-1.5 text-[15px] leading-relaxed text-slate-900">
            {lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
        </div>
      </div>

      <div className="flex gap-3">
        <Mail className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-slate-800 tracking-tight">อีเมล</p>
          <a
            href={`mailto:${companyLegal.contactEmail}`}
            className="mt-1 inline-block text-[15px] text-emerald-800 font-medium hover:underline"
          >
            {companyLegal.contactEmail}
          </a>
        </div>
      </div>

      <div className="flex gap-3">
        <MessageCircle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-slate-800 tracking-tight">LINE</p>
          <p className="mt-1 font-mono text-[15px] text-slate-900">ID: {companyLegal.lineId}</p>
        </div>
      </div>

      {isIndividual ? (
        <div className="flex gap-3 pt-1 border-t border-slate-200/80">
          <FileText className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                ทะเบียนพาณิชย์อิเล็กทรอนิกส์ (DBD e-Registration)
              </p>
              <p className="mt-1 text-[15px] text-slate-900 font-medium leading-relaxed">
                {companyLegal.dbdEcommerceStatus}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                สถานะผู้ประกอบการ
              </p>
              <p className="mt-1 text-sm text-slate-800 leading-relaxed">{companyLegal.registrationNote}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 pt-1 border-t border-slate-200/80">
          <FileText className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">เลขทะเบียนพาณิชย์</p>
            <p className="mt-1 text-sm text-slate-900 leading-relaxed">
              {companyLegal.companyRegistrationNo || companyLegal.registrationNote}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
