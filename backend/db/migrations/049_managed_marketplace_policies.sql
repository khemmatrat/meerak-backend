-- =================================================================================
-- 049: Managed Marketplace Policies
-- Service Approval, Provider Screening, Platform Safety Authority
-- =================================================================================

-- 1. ขยาย type (ใช้รายการเต็มเพื่อไม่ให้ violate แถวที่มีอยู่)
ALTER TABLE compliance_policies DROP CONSTRAINT IF EXISTS compliance_policies_type_check;
ALTER TABLE compliance_policies ADD CONSTRAINT compliance_policies_type_check CHECK (type IN (
  'terms', 'privacy', 'cookie', 'refund', 'community_guidelines',
  'kyc_policy', 'escrow_policy', 'talent_policy', 'night_work_policy',
  'prohibited_services', 'platform_enforcement',
  'anti_fraud', 'dispute', 'enforcement', 'freelancer_agreement', 'client_agreement', 'content_chat',
  'talent_category_rules', 'off_platform_transaction', 'escrow_legal_clause', 'liability_limitation',
  'aml_policy', 'risk_monitoring_policy', 'trust_safety_manual', 'managed_marketplace_policy',
  'high_risk_services_policy', 'safety_incident_policy'
));

-- 2. Managed Marketplace Policy (รวม 3 clauses)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('managed_marketplace_policy', '1.0', '<h1>นโยบาย Managed Marketplace - AQOND</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>AQOND เป็น Managed Marketplace ที่ควบคุมคุณภาพและความปลอดภัยของแพลตฟอร์มอย่างเคร่งครัด</p>

<h2>1. Service Approval System (ระบบอนุมัติงาน / Platform Moderation)</h2>
<p><strong>งานทุกงานในแพลตฟอร์มต้องผ่าน Platform Moderation System</strong> ก่อนจะแสดงต่อผู้ใช้</p>
<p>แพลตฟอร์มมีสิทธิ์:</p>
<ul>
  <li><strong>ปฏิเสธงาน</strong> — ไม่อนุญาตให้โพสต์หรือแสดงงานที่ละเมิดนโยบาย</li>
  <li><strong>แก้ไขงาน</strong> — แก้ไขเนื้อหา หมวดหมู่ หรือรายละเอียดที่ผิดพลาดหรือไม่เหมาะสม</li>
  <li><strong>ระงับงาน</strong> — ซ่อนงานชั่วคราวระหว่างการตรวจสอบ</li>
  <li><strong>ลบงาน</strong> — ลบงานที่ฝ่าฝืนนโยบายหรือกฎหมายทันที</li>
</ul>
<p>การดำเนินการดังกล่าวอาจกระทำได้โดยไม่ต้องแจ้งล่วงหน้า เมื่อแพลตฟอร์มเห็นสมควรเพื่อความปลอดภัยและความถูกต้องของชุมชน</p>

<h2>2. Provider Screening System (ระบบตรวจสอบผู้ให้บริการ)</h2>
<p><strong>ผู้ให้บริการ (Talent/Provider) ต้องผ่าน Verification + Quality Review</strong> ก่อนให้บริการบนแพลตฟอร์ม</p>
<p>กระบวนการตรวจสอบประกอบด้วย:</p>
<ul>
  <li><strong>KYC (Know Your Customer)</strong> — การยืนยันตัวตนด้วยเอกสารตามกฎหมาย</li>
  <li><strong>Skill Verification</strong> — การตรวจสอบความสามารถหรือใบอนุญาตตามหมวดงาน</li>
  <li><strong>Performance Review</strong> — การประเมินจากประวัติงาน คะแนนรีวิว และการส่งมอบ</li>
  <li><strong>Safety Score</strong> — คะแนนความปลอดภัยจากพฤติกรรมและประวัติการใช้งาน</li>
</ul>
<p>ผู้ให้บริการที่ไม่ได้ผ่านการตรวจสอบตามเกณฑ์ที่กำหนดจะไม่สามารถรับงานหรือให้บริการบนแพลตฟอร์มได้</p>

<h2>3. Platform Safety Authority (อำนาจความปลอดภัยของแพลตฟอร์ม)</h2>
<p><strong>แพลตฟอร์ม AQOND มีสิทธิ์ดำเนินการดังต่อไปนี้ทันที</strong> เพื่อความปลอดภัยของผู้ใช้และความสมบูรณ์ของแพลตฟอร์ม:</p>
<ul>
  <li><strong>ระงับบัญชีทันที</strong> — เมื่อพบพฤติกรรมที่ละเมิดนโยบายหรือเป็นอันตราย</li>
  <li><strong>ระงับเงิน</strong> — ระงับการถอนหรือใช้เงินใน Wallet/Escrow ระหว่างการตรวจสอบหรือข้อพิพาท</li>
  <li><strong>ตรวจสอบพฤติกรรม</strong> — วิเคราะห์ข้อมูลการใช้งาน แชท และธุรกรรมเพื่อป้องกันการฉ้อโกง</li>
  <li><strong>ปิดหมวดบริการบางประเภท</strong> — ระงับหรือจำกัดการให้บริการในหมวดที่เสี่ยงหรือละเมิดกฎหมาย</li>
</ul>
<p>การดำเนินการดังกล่าวเป็นไปเพื่อความปลอดภัยของผู้ใช้และสอดคล้องกับมาตรฐานของแพลตฟอร์มระดับใหญ่</p>

<h2>4. ติดต่อเรา</h2>
<p>trust-safety@aqond.com | compliance@aqond.com</p>',
true, NOW(), 'Managed Marketplace: Service Approval, Provider Screening, Platform Safety')
ON CONFLICT (type, version) DO NOTHING;

-- 3. อัปเดต Terms v3.1 — เพิ่มการอ้างอิง Managed Marketplace
UPDATE compliance_policies SET is_active = false WHERE type = 'terms';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('terms', '3.1', '<h1>ข้อกำหนดและเงื่อนไขการใช้บริการ AQOND (Platform Terms of Service)</h1>
<p><strong>เวอร์ชัน:</strong> 3.1 | <strong>อัปเดตล่าสุด:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>เอกสารนี้จัดทำตามพระราชบัญญัติธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 และกฎหมายที่เกี่ยวข้อง</p>

<h2>สถานะทางกฎหมายของแพลตฟอร์ม (Platform Legal Status)</h2>
<p><strong>AQOND เป็น Managed Marketplace</strong> และ Digital Intermediary Platform ที่ทำหน้าที่เป็นตัวกลางเชื่อมต่อระหว่าง Client (ผู้ว่าจ้าง) กับ Provider/Talent (ผู้ให้บริการ) โดยแพลตฟอร์มไม่เป็นนายจ้างของ Talent ตามประมวลกฎหมายแพ่งและพาณิชย์</p>

<h2>1. การยอมรับข้อกำหนด</h2>
<p>การใช้บริการ AQOND แสดงว่าคุณยอมรับข้อกำหนดและเงื่อนไขทั้งหมด รวมถึงนโยบายที่อ้างอิงในเอกสารนี้ โดยเฉพาะ Managed Marketplace Policy (Service Approval, Provider Screening, Platform Safety Authority)</p>

<h2>2. คุณสมบัติผู้ใช้</h2>
<p>คุณต้องมีอายุไม่ต่ำกว่า 18 ปี มีความสามารถตามกฎหมาย และมีสิทธิ์ทำสัญญาได้อย่างถูกต้อง</p>

<h2>3. การสมัครและบัญชี</h2>
<p>คุณต้องให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบัน การให้ข้อมูลเท็จอาจนำไปสู่การระงับบัญชีและความรับผิดทางกฎหมาย</p>

<h2>4. การใช้บริการและ Platform Moderation</h2>
<p>งานทุกงานในแพลตฟอร์มต้องผ่าน Platform Moderation System แพลตฟอร์มสามารถปฏิเสธ แก้ไข ระงับ หรือลบงานทันทีเมื่อเห็นสมควร (ดู Managed Marketplace Policy)</p>

<h2>5. Provider Screening</h2>
<p>ผู้ให้บริการต้องผ่าน Verification + Quality Review (KYC, Skill Verification, Performance Review, Safety Score) ก่อนให้บริการ</p>

<h2>6. Platform Safety Authority</h2>
<p>แพลตฟอร์มมีสิทธิ์ระงับบัญชี ระงับเงิน ตรวจสอบพฤติกรรม และปิดหมวดบริการบางประเภททันที เพื่อความปลอดภัยของผู้ใช้</p>

<h2>7. การชำระเงินและ Escrow</h2>
<p>การชำระเงินทั้งหมดต้องดำเนินการผ่านระบบ Escrow ของแพลตฟอร์มเท่านั้น ห้ามชำระเงินนอกแพลตฟอร์ม</p>

<h2>8. ข้อจำกัดความรับผิด</h2>
<p>AQOND เป็นตัวกลางเท่านั้น ความรับผิดสูงสุดจำกัดตามนโยบาย Liability Limitation</p>

<h2>9. การระงับและยกเลิกบัญชี</h2>
<p>AQOND ขอสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีของผู้ใช้ที่ฝ่าฝืนข้อกำหนด หรือเมื่อเห็นสมควร</p>

<h2>10. กฎหมายที่ใช้บังคับ</h2>
<p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ศาลไทยมีอำนาจพิจารณาคดีแต่เพียงผู้เดียว</p>

<h2>11. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'v3.1 - เพิ่ม Managed Marketplace clauses')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;
