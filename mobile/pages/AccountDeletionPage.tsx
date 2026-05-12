import React from "react";
import { Link } from "react-router-dom";
import { LegalPublicShell } from "../components/LegalPublicShell";
import { LegalIdentityContactCard } from "../components/LegalIdentityContactCard";
import { companyLegal } from "../config/companyLegal";

/** URL เริ่มต้นสำหรับแสดงในหน้า (Play Store / ผู้ตรวจ) — ตั้ง VITE_PUBLIC_WEB_APP_URL ถ้าโดเมนเว็บแอปไม่ใช่ค่านี้ */
const defaultWebAppOrigin = "https://app.aqond.com";

function webAppAccountDeletionUrl(): string {
  const base = (import.meta as unknown as { env?: { VITE_PUBLIC_WEB_APP_URL?: string } }).env
    ?.VITE_PUBLIC_WEB_APP_URL?.trim();
  const origin = base || defaultWebAppOrigin;
  return `${origin.replace(/\/$/, "")}/#/account-deletion`;
}

/**
 * หน้าสาธารณะ — การขอลบบัญชีและข้อมูลที่เกี่ยวข้อง (Google Play / App Store)
 * ใส่ URL นี้ใน Play Console ช่อง "Delete account URL"
 */
export const AccountDeletionPage: React.FC = () => {
  const playUrl = webAppAccountDeletionUrl();
  const mailto = `mailto:${companyLegal.contactEmail}?subject=${encodeURIComponent(
    "คำขอลบบัญชี AQOND / Account deletion request"
  )}&body=${encodeURIComponent(
    "กรุณาระบุเบอร์โทรหรืออีเมลที่ลงทะเบียนกับ AQOND:\n\n"
  )}`;

  return (
    <LegalPublicShell
      title="การลบบัญชีและข้อมูลที่เกี่ยวข้อง"
      subtitle="Account deletion & related data — AQOND"
    >
      <p className="text-sm text-slate-500 not-prose mb-6 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 font-mono text-xs break-all">
        <span className="font-sans font-medium text-slate-600 block mb-1">
          URL สำหรับ Google Play Console (ลบบัญชี):
        </span>
        {playUrl}
      </p>

      <p className="text-sm text-slate-600 not-prose mb-6">
        <span className="font-medium text-slate-800">English:</span> You may request deletion of your AQOND account and
        associated personal data processed for the service. We will verify your identity before processing. Some records
        may be retained where the law requires (for example tax or dispute records) in anonymized or minimal form.
      </p>

      <h2>ตัวเลือกควบคุมข้อมูลโดยไม่จำเป็นต้องลบบัญชี (ไม่บังคับ)</h2>
      <p>
        นอกจากการลบบัญชีทั้งหมดแล้ว คุณสามารถ<strong>ควบคุมหรือลบข้อมูลบางส่วน</strong>ได้โดยบัญชียังใช้งานได้
        เพื่อให้สอดคล้องกับแนวทาง Google Play เรื่องการให้ผู้ใช้เลือกลบเฉพาะส่วนหรือทั้งหมดตามความเหมาะสม
      </p>
      <ul>
        <li>
          <strong>แก้ไขหรือลบข้อมูลโปรไฟล์:</strong> เข้าแอป → <strong>การตั้งค่า</strong> → แก้ไขโปรไฟล์ (ชื่อ เบอร์ อีเมล ข้อความแนะนำตัว ฯลฯ)
        </li>
        <li>
          <strong>ลบช่องทางรับเงิน / บัญชีธนาคารที่บันทึกไว้:</strong> การตั้งค่า → ช่องทางรับเงิน → ลบรายการที่ต้องการ
        </li>
        <li>
          <strong>ขอสำเนาข้อมูลส่วนบุคคล (PDPA):</strong> ในแอป → การตั้งค่า → หมวดข้อมูลส่วนบุคคล → ขอส่งออกสำเนาข้อมูล
          (ทีมจะดำเนินการตามคิวภายในระยะเวลาที่กฎหมายกำหนด)
        </li>
        <li>
          <strong>คำขอเฉพาะเรื่อง (เช่น ลบประวัติบางประเภท):</strong> หากยังไม่มีในหน้าตั้งค่า ให้ส่งอีเมลมาที่อีเมลด้านล่าง
          โดยระบุหมวดข้อมูลที่ต้องการให้แก้ไขหรือลบ เราจะยืนยันตัวตนก่อนดำเนินการ
        </li>
      </ul>
      <p className="text-sm text-slate-600 not-prose">
        <span className="font-medium text-slate-800">English (optional):</span> You may correct or remove specific
        categories of data through Settings (profile, payout methods) or request a copy of your data (data export).
        You may also email us to request deletion or correction of particular data without closing your account, where
        technically feasible and permitted by law.
      </p>

      <h2>1. วิธีขอลบบัญชี (แอปมือถือ / เว็บแอป)</h2>
      <ol>
        <li>เข้าสู่ระบบ AQOND ด้วยบัญชีของคุณ</li>
        <li>เปิดเมนู <strong>การตั้งค่า (Settings)</strong></li>
        <li>เลือกการลบบัญชีตามที่แสดงในแอป (หรือใช้ช่องทางอีเมลด้านล่างหากไม่สามารถเข้าแอปได้)</li>
      </ol>
      <p className="text-sm text-slate-600">
        หลังได้รับคำขอ เราจะดำเนินการตามขั้นตอนภายในระยะเวลาที่เหมาะสม (โดยทั่วไปภายใน 7 วันทำการสำหรับการตอบกลับเบื้องต้น)
        และอาจเก็บข้อมูลชั่วคราวตามระยะเก็บรักษาที่กฎหมายอนุญาตก่อนลบหรือทำให้ไม่สามารถระบุตัวตนได้
      </p>

      <h2>2. ช่องทางอีเมล (ถ้าไม่สามารถใช้แอป หรือขอจัดการข้อมูลเฉพาะส่วน)</h2>
      <p>
        ส่งอีเมลมาที่{" "}
        <a href={mailto} className="text-emerald-700 font-medium hover:underline">
          {companyLegal.contactEmail}
        </a>{" "}
        โดยระบุว่าเป็นการขอลบบัญชี หรือขอแก้ไข/ลบข้อมูลบางส่วน และแนบเบอร์โทรหรือข้อมูลที่ใช้ลงทะเบียนเพื่อยืนยันตัวตน
      </p>

      <h2>3. ข้อมูลที่เกี่ยวข้องเมื่อขอลบบัญชีทั้งหมด</h2>
      <ul>
        <li>โปรไฟล์บัญชี ชื่อ อีเมล เบอร์โทรศัพท์ และข้อมูลติดต่อที่ให้ไว้</li>
        <li>ข้อมูลที่เกี่ยวกับการใช้บริการตามที่ไม่ต้องเก็บตามกฎหมายหลังปิดบัญชี</li>
      </ul>
      <p className="text-sm text-slate-600">
        รายการบางประเภท (เช่น หลักฐานการชำระเงินที่กฎหมายกำหนด) อาจต้องเก็บในรูปแบบที่จำกัดหรือไม่ระบุตัวบุคคล — อ้างอิง{" "}
        <Link to="/privacy" className="text-emerald-700 hover:underline">
          นโยบายความเป็นส่วนตัว
        </Link>
      </p>

      <h2>4. ข้อมูลติดต่อผู้ควบคุมข้อมูล</h2>
      <LegalIdentityContactCard className="my-4" />

      <p className="not-prose text-sm text-slate-500 mt-8">
        <Link to="/privacy" className="text-emerald-700 hover:underline">
          นโยบายความเป็นส่วนตัว
        </Link>
        {" · "}
        <Link to="/terms" className="text-emerald-700 hover:underline">
          ข้อกำหนดการให้บริการ
        </Link>
      </p>
    </LegalPublicShell>
  );
};
