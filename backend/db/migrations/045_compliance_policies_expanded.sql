-- =================================================================================
-- 045: Compliance Policies Expanded
-- เพิ่ม policy types ใหม่, Platform Legal Status ใน Terms, ขยาย Terms/Privacy ตามกฎหมาย
-- นโยบาย: KYC, Escrow, Anti-Fraud, Dispute, Enforcement
-- สัญญา: Freelancer Agreement, Client Agreement
-- นโยบาย: Content & Chat Policy
-- =================================================================================

-- 1. ขยาย type ใน compliance_policies (ใช้รายการเต็มเพื่อไม่ให้ violate แถวที่มีอยู่)
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

-- 2. อัปเดต Terms v2.0 (เพิ่ม Platform Legal Status, ขยายตาม พรบ. ธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544)
UPDATE compliance_policies SET is_active = false WHERE type = 'terms';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('terms', '2.0', '<h1>ข้อกำหนดและเงื่อนไขการใช้บริการ AQOND</h1>
<p><strong>อัปเดตล่าสุด:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>สถานะทางกฎหมายของแพลตฟอร์ม (Platform Legal Status)</h2>
<p><strong>AQOND เป็น Digital Intermediary Platform</strong> ที่ทำหน้าที่เป็นตัวกลางเชื่อมต่อระหว่าง Client (ผู้ว่าจ้าง) กับ Provider/Freelancer (ผู้ให้บริการ) โดยแพลตฟอร์มไม่เป็นนายจ้างของ Freelancer ตามประมวลกฎหมายแพ่งและพาณิชย์ และไม่มีความสัมพันธ์ทางกฎหมายในฐานะนายจ้าง-ลูกจ้างกับผู้ให้บริการบนแพลตฟอร์ม</p>
<p>การให้บริการบนแพลตฟอร์มอยู่ภายใต้พระราชบัญญัติธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 และกฎหมายที่เกี่ยวข้อง</p>

<h2>1. การยอมรับข้อกำหนด</h2>
<p>การใช้บริการ AQOND แสดงว่าคุณยอมรับข้อกำหนดและเงื่อนไขทั้งหมดตามที่ระบุในเอกสารนี้ การสมัครสมาชิกหรือใช้บริการถือเป็นการยอมรับที่มีผลผูกพันทางกฎหมาย</p>

<h2>2. การใช้บริการ</h2>
<p>AQOND เป็นแพลตฟอร์มเชื่อมต่อนายจ้างและ Talent เพื่อการทำงานอิสระและการให้บริการ คุณต้องใช้บริการอย่างสุจริต ไม่ละเมิดสิทธิผู้อื่น และปฏิบัติตามกฎหมายไทย</p>

<h2>3. บัญชีผู้ใช้และข้อมูล</h2>
<p>คุณต้องให้ข้อมูลที่ถูกต้องครบถ้วนในการสมัครและใช้บริการ การให้ข้อมูลเท็จอาจนำไปสู่การระงับบัญชีและความรับผิดทางกฎหมาย</p>

<h2>4. การชำระเงินและค่าธรรมเนียม</h2>
<p>ค่าธรรมเนียมแพลตฟอร์มจะถูกหักจากรายได้ของผู้ให้บริการตามระดับ Tier การชำระเงินผ่านระบบ Escrow ตามนโยบาย Escrow ของแพลตฟอร์ม</p>

<h2>5. ข้อจำกัดความรับผิด</h2>
<p>AQOND เป็นตัวกลางเท่านั้น ไม่รับผิดชอบต่อการกระทำของ User แต่ละราย อย่างไรก็ตาม แพลตฟอร์มมีระบบระงับข้อพิพาทและบังคับใช้กฎเพื่อความปลอดภัยของชุมชน</p>

<h2>6. การเปลี่ยนแปลงข้อกำหนด</h2>
<p>AQOND ขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อกำหนด โดยจะแจ้งให้ทราบผ่านแพลตฟอร์มหรืออีเมล การใช้บริการต่อหลังการเปลี่ยนแปลงถือเป็นการยอมรับ</p>

<h2>7. กฎหมายที่ใช้บังคับ</h2>
<p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ศาลไทยมีอำนาจพิจารณาคดี</p>

<h2>8. ติดต่อเรา</h2>
<p>หากมีข้อสงสัย กรุณาติดต่อ: legal@aqond.com</p>',
true, NOW(), 'v2.0 - เพิ่ม Platform Legal Status, ขยายตาม พรบ. ธุรกรรมทางอิเล็กทรอนิกส์')
ON CONFLICT (type, version) DO UPDATE SET
  content = EXCLUDED.content, is_active = EXCLUDED.is_active,
  published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 3. อัปเดต Privacy v2.0 (ขยายตาม PDPA พ.ศ. 2562)
UPDATE compliance_policies SET is_active = false WHERE type = 'privacy';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('privacy', '2.0', '<h1>นโยบายความเป็นส่วนตัว - AQOND Technology</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>นโยบายนี้จัดทำตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA)</p>

<h2>1. ข้อมูลที่เราเก็บรวบรวม</h2>
<p>เราเก็บข้อมูลส่วนบุคคลของคุณเมื่อคุณสมัครใช้บริการ AQOND รวมถึง:</p>
<ul>
  <li>ชื่อ-นามสกุล, อีเมล, หมายเลขโทรศัพท์</li>
  <li>ข้อมูลการชำระเงินและธนาคาร</li>
  <li>ข้อมูล KYC (บัตรประชาชน, หลักฐานที่อยู่)</li>
  <li>ข้อมูลการใช้งาน (IP, Device, Log)</li>
</ul>

<h2>2. วัตถุประสงค์การเก็บรวบรวม</h2>
<p>เราใช้ข้อมูลเพื่อ: ให้บริการแพลตฟอร์ม, ประมวลผลธุรกรรม, ตรวจสอบตัวตน (KYC), ป้องกันการฉ้อโกง, ปรับปรุงคุณภาพบริการ, และปฏิบัติตามกฎหมาย</p>

<h2>3. การแบ่งปันข้อมูล</h2>
<p>เราไม่ขายข้อมูลของคุณ แต่อาจแบ่งปันกับ: Payment Gateway, หน่วยงานกำกับดูแล, และเมื่อกฎหมายกำหนด</p>

<h2>4. การเก็บรักษาและความปลอดภัย</h2>
<p>เราใช้มาตรการรักษาความปลอดภัยระดับสูง ข้อมูลถูกเก็บรักษาตามระยะเวลาที่จำเป็นหรือตามกฎหมาย</p>

<h2>5. สิทธิของคุณ (PDPA)</h2>
<p>คุณมีสิทธิ์: เข้าถึงข้อมูล, แก้ไข, ลบ, จำกัดการประมวลผล, โอนข้อมูล, และคัดค้านการประมวลผล สามารถดำเนินการได้ผ่าน Settings หรือติดต่อ DPO</p>

<h2>6. ติดต่อเรา</h2>
<p>DPO / Privacy: privacy@aqond.com</p>',
true, NOW(), 'v2.0 - ขยายตาม PDPA พ.ศ. 2562')
ON CONFLICT (type, version) DO UPDATE SET
  content = EXCLUDED.content, is_active = EXCLUDED.is_active,
  published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 4. KYC Policy (ตาม พรบ. ป้องกันและปราบปรามการฟอกเงิน พ.ศ. 2542)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('kyc_policy', '1.0', '<h1>นโยบาย KYC (Know Your Customer)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>จัดทำตามพระราชบัญญัติป้องกันและปราบปรามการฟอกเงิน พ.ศ. 2542 และกฎหมายที่เกี่ยวข้อง</p>

<h2>1. วัตถุประสงค์</h2>
<p>การตรวจสอบตัวตน (KYC) เพื่อป้องกันการฟอกเงิน การสนับสนุนการก่อการร้าย และการฉ้อโกงบนแพลตฟอร์ม</p>

<h2>2. เอกสารที่ต้องยืนยัน</h2>
<ul>
  <li>บัตรประชาชนหรือบัตรประชาชนอิเล็กทรอนิกส์</li>
  <li>หลักฐานที่อยู่ (ไม่เกิน 6 เดือน)</li>
  <li>ข้อมูลบัญชีธนาคารสำหรับการรับชำระเงิน</li>
</ul>

<h2>3. กระบวนการตรวจสอบ</h2>
<p>เราจะตรวจสอบเอกสารและข้อมูลที่คุณส่ง เพื่อยืนยันตัวตนและความถูกต้องของข้อมูล</p>

<h2>4. การเก็บรักษาข้อมูล</h2>
<p>ข้อมูล KYC ถูกเก็บรักษาตามระยะเวลาที่กฎหมายกำหนด และใช้เฉพาะเพื่อวัตถุประสงค์ที่กฎหมายอนุญาต</p>

<h2>5. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'นโยบาย KYC ตาม พรบ. ป้องกันการฟอกเงิน')
ON CONFLICT (type, version) DO NOTHING;

-- 5. Escrow Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('escrow_policy', '1.0', '<h1>นโยบาย Escrow (การเก็บเงินกลาง)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. การทำงานของ Escrow</h2>
<p>เมื่อ Client ชำระเงิน เงินจะถูกเก็บในระบบ Escrow จนกว่าจะส่งมอบงานครบหรือตาม Milestone ที่ตกลงกัน</p>

<h2>2. การปล่อยเงิน</h2>
<p>เงินจะถูกปล่อยให้ Provider เมื่อ: Client ยืนยันการรับงาน, ครบกำหนดเวลาโดยไม่มีข้อพิพาท, หรือมีคำตัดสินจาก Dispute Resolution</p>

<h2>3. ข้อพิพาท</h2>
<p>หากมีข้อพิพาท เงินจะถูกเก็บไว้จนกว่าจะมีคำตัดสินตามนโยบาย Dispute</p>

<h2>4. การยกเลิก</h2>
<p>การยกเลิกงานก่อนเริ่มหรือตามเงื่อนไขที่กำหนด อาจส่งผลต่อการคืนเงินตามนโยบาย Refund</p>

<h2>5. ติดต่อเรา</h2>
<p>support@aqond.com</p>',
true, NOW(), 'นโยบาย Escrow')
ON CONFLICT (type, version) DO NOTHING;

-- 6. Talent Policy (สัญญา/นโยบายสำหรับ Talent/Freelancer)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('talent_policy', '1.0', '<h1>นโยบาย Talent (ผู้ให้บริการ)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ความสัมพันธ์ทางกฎหมาย</h2>
<p>Talent เป็นผู้ให้บริการอิสระ ไม่ใช่ลูกจ้างของ AQOND หรือ Client ตามประมวลกฎหมายแพ่งและพาณิชย์</p>

<h2>2. หน้าที่ของ Talent</h2>
<ul>
  <li>ปฏิบัติงานตาม Scope ที่ตกลงกับ Client</li>
  <li>ส่งมอบงานตรงเวลาและมีคุณภาพ</li>
  <li>รักษาความลับของ Client และข้อมูลงาน</li>
  <li>ปฏิบัติตามกฎหมายและนโยบายแพลตฟอร์ม</li>
</ul>

<h2>3. สิทธิในการรับค่าตอบแทน</h2>
<p>Talent มีสิทธิรับค่าตอบแทนเมื่อส่งมอบงานครบตามที่ตกลง ผ่านระบบ Escrow</p>

<h2>4. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'นโยบาย Talent')
ON CONFLICT (type, version) DO NOTHING;

-- 7. Night Work Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('night_work_policy', '1.0', '<h1>นโยบายการทำงานกลางคืน</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ขอบเขต</h2>
<p>นโยบายนี้ใช้กับงานที่ดำเนินการในช่วงเวลากลางคืน (หลัง 22:00 - ก่อน 06:00) ตามพระราชบัญญัติคุ้มครองแรงงาน</p>

<h2>2. ข้อกำหนด</h2>
<p>การทำงานกลางคืนต้องเป็นไปตามความยินยอมของทั้งสองฝ่าย และปฏิบัติตามกฎหมายแรงงานที่เกี่ยวข้อง</p>

<h2>3. ความปลอดภัย</h2>
<p>Client และ Talent ต้องดูแลความปลอดภัยในการพบปะหรือทำงานในช่วงเวลากลางคืน</p>

<h2>4. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'นโยบายการทำงานกลางคืน')
ON CONFLICT (type, version) DO NOTHING;

-- 8. Prohibited Services
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('prohibited_services', '1.0', '<h1>บริการที่ห้ามบนแพลตฟอร์ม</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. บริการที่ห้าม</h2>
<ul>
  <li>บริการที่ผิดกฎหมายไทยหรือสากล</li>
  <li>บริการที่เกี่ยวข้องกับการฟอกเงิน การก่อการร้าย</li>
  <li>บริการทางเพศหรือเนื้อหาลามก</li>
  <li>บริการที่ละเมิดลิขสิทธิ์หรือทรัพย์สินทางปัญญา</li>
  <li>บริการที่ก่อความเสียหายต่อผู้อื่น</li>
</ul>

<h2>2. ผลที่ตามมา</h2>
<p>การเสนอหรือรับบริการที่ห้ามจะนำไปสู่การระงับบัญชีตามนโยบาย Platform Enforcement</p>

<h2>3. ติดต่อเรา</h2>
<p>report@aqond.com</p>',
true, NOW(), 'บริการที่ห้าม')
ON CONFLICT (type, version) DO NOTHING;

-- 9. Platform Enforcement
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('platform_enforcement', '1.0', '<h1>นโยบายการบังคับใช้แพลตฟอร์ม</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ระดับการลงโทษ</h2>
<ul>
  <li><strong>คำเตือน:</strong> การฝ่าฝืนเล็กน้อยครั้งแรก</li>
  <li><strong>ระงับชั่วคราว:</strong> 7-30 วัน ตามความรุนแรง</li>
  <li><strong>ระงับถาวร:</strong> การฝ่าฝืนร้ายแรงหรือซ้ำซาก</li>
  <li><strong>รายงานหน่วยงาน:</strong> กรณีผิดกฎหมาย</li>
</ul>

<h2>2. การพิจารณา</h2>
<p>เราพิจารณาตามหลักฐาน ความรุนแรง และประวัติการใช้งาน</p>

<h2>3. สิทธิในการอุทธรณ์</h2>
<p>คุณสามารถอุทธรณ์การตัดสินภายใน 14 วัน ผ่าน appeal@aqond.com</p>

<h2>4. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'นโยบาย Platform Enforcement')
ON CONFLICT (type, version) DO NOTHING;
