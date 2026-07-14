import React, { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { BrandAdviserRules } from "../services/brandAdviserRulesService";

/**
 * การ์ดอธิบายบทบาท BA บนมือถือ — ชัดเรื่องสิทธิประโยชน์หลักการและกติกา (ไม่แทนที่ข้อกฎหมายในแอป)
 */
export function BrandAdviserProgramInfoCard({
  className = "",
  rules,
}: {
  className?: string;
  /** จาก GET /api/app/brand-adviser-rules */
  rules?: BrandAdviserRules | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded-2xl border border-amber-500/35 bg-gradient-to-br from-amber-950/40 to-slate-900/60 text-amber-50/95 overflow-hidden ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <span className="flex items-center gap-2 font-bold text-sm text-amber-100">
          <Sparkles size={18} className="text-amber-400 shrink-0" />
          Brand Adviser — บทบาท & กติกาหลัก
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 space-y-3 text-xs leading-relaxed text-amber-100/90 border-t border-amber-500/20">
          <p>
            <strong className="text-amber-200">คุณคือ “ตาแมว” ของแพลตฟอร์ม</strong> — ช่วยให้กลุ่มคนที่เหมาะสมรู้จักและเข้ามาใช้
            AQOND ผ่านช่องทางของคุณอย่างโปร่งใส ไม่ใช่การรับรองฝีมือจากแพลตฟอร์มโดยตรง
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-amber-100/85 pl-1">
            <li>
              <strong>สิทธิประโยชน์หลักการ:</strong> เมื่อโปรแกรมเปิดใช้งาน คุณอาจได้รับการปรับ/ยกเว้นค่าธรรมเนียมตามเงื่อนไขในระบบ และสะสมคะแนน reputation จากกิจกรรมที่เกี่ยวข้อง
            </li>
            <li>
              <strong>กติกา:</strong> สื่อสารตามความจริง ไม่โฆษณาเกินจริง ไม่กล่าวอ้างผลตอบแทนที่ระบบไม่ได้รับรอง และไม่ใช้สถานะ BA เพื่อหลอกลวงหรือชักชวนโอนเงินนอกกลไกแอป
            </li>
            {rules ? (
              <li>
                <strong>ระยะเวลาและการแจ้งเตือน (ตั้งโดยแอดมิน):</strong> หากไม่มีกิจกรรมอ้างอิงต่อเนื่องเกิน{" "}
                <strong>{rules.inactivity_days}</strong> วัน ระบบอาจพักสถานะ BA — แจ้งเตือนล่วงหน้า{" "}
                <strong>{rules.warn_days_before_suspend}</strong> วันก่อนถึงกำหนด (ค่าอาจเปลี่ยนตามประกาศ)
              </li>
            ) : null}
            <li>
              <strong>การเพิกถอน:</strong> หากพบการทุจริตหรือฝ่าฝืนกติกาอย่างร้ายแรง แพลตฟอร์มอาจพักหรือเพิกถอนสิทธิ์ BA ได้ — รายละเอียดเต็มอยู่ในนโยบายและหน้าตั้งค่า
            </li>
          </ul>
          <p className="text-[11px] text-amber-200/70">
            รายละเอียดสิทธิ์และเกณฑ์ทางการเงินอาจเปลี่ยนแปลงได้ — ดูข้อมูลล่าสุดบนใบเสร็จและประกาศในแอป
          </p>
        </div>
      )}
    </div>
  );
}
