-- =================================================================================
-- 046: เพิ่มนโยบายที่ขาดตามรายการเดิม
-- Anti-Fraud, Dispute, Enforcement, Freelancer Agreement, Client Agreement, Content & Chat Policy
-- =================================================================================

-- ขยาย type เพื่อรองรับนโยบายเพิ่มเติม (ใช้รายการเต็มเพื่อไม่ให้ violate แถวที่มีอยู่)
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

-- Anti-Fraud Policy (อ้างอิง พรบ. คอมพิวเตอร์ พ.ศ. 2550)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('anti_fraud', '1.0', '<h1>นโยบายป้องกันการฉ้อโกง</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>อ้างอิงพระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ พ.ศ. 2550</p>

<h2>1. การกระทำที่ห้าม</h2>
<ul>
  <li>การเข้าถึงระบบโดยไม่ได้รับอนุญาต</li>
  <li>การปลอมแปลงข้อมูลหรือเอกสาร</li>
  <li>การโจรกรรมข้อมูลหรือการโอนเงินโดยมิชอบ</li>
  <li>การสร้างบัญชีปลอมหรือใช้เอกสารปลอม</li>
</ul>

<h2>2. การตรวจสอบและป้องกัน</h2>
<p>เราใช้ระบบตรวจสอบธุรกรรม การวิเคราะห์พฤติกรรม และ KYC เพื่อป้องกันการฉ้อโกง</p>

<h2>3. การรายงาน</h2>
<p>หากพบพฤติกรรมน่าสงสัย กรุณารายงานที่ report@aqond.com</p>

<h2>4. ผลที่ตามมา</h2>
<p>การฝ่าฝืนอาจนำไปสู่การระงับบัญชี การรายงานต่อหน่วยงานที่เกี่ยวข้อง และความรับผิดทางกฎหมาย</p>

<h2>5. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'นโยบาย Anti-Fraud')
ON CONFLICT (type, version) DO NOTHING;

-- Dispute Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('dispute', '1.0', '<h1>นโยบายการระงับข้อพิพาท</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ขอบเขต</h2>
<p>นโยบายนี้ใช้กับข้อพิพาทระหว่าง Client กับ Provider เกี่ยวกับงาน การส่งมอบ หรือการชำระเงิน</p>

<h2>2. กระบวนการ</h2>
<ol>
  <li>แจ้งข้อพิพาทผ่านระบบภายใน 7 วันหลังเหตุการณ์</li>
  <li>ฝ่ายตรงข้ามมีโอกาสตอบ</li>
  <li>ทีม AQOND พิจารณาตามหลักฐาน</li>
  <li>ตัดสินภายใน 14 วันทำการ</li>
</ol>

<h2>3. การตัดสิน</h2>
<p>คำตัดสินอาจรวมถึง: ปล่อยเงินทั้งหมด/บางส่วนให้ Provider, คืนเงินให้ Client, หรือแบ่งตามสัดส่วน</p>

<h2>4. การอุทธรณ์</h2>
<p>สามารถอุทธรณ์ได้ภายใน 7 วัน ผ่านช่องทาง support@aqond.com</p>

<h2>5. ติดต่อเรา</h2>
<p>support@aqond.com</p>',
true, NOW(), 'นโยบาย Dispute')
ON CONFLICT (type, version) DO NOTHING;

-- Enforcement Policy (alias สำหรับ platform_enforcement)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('enforcement', '1.0', '<h1>นโยบายการบังคับใช้</h1>
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
true, NOW(), 'นโยบาย Enforcement')
ON CONFLICT (type, version) DO NOTHING;

-- Freelancer Agreement
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('freelancer_agreement', '1.0', '<h1>สัญญาการให้บริการ Freelancer</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ความสัมพันธ์ทางกฎหมาย</h2>
<p>Freelancer เป็นผู้ให้บริการอิสระ ไม่ใช่ลูกจ้างของ AQOND หรือ Client ตามประมวลกฎหมายแพ่งและพาณิชย์</p>

<h2>2. หน้าที่ของ Freelancer</h2>
<ul>
  <li>ปฏิบัติงานตาม Scope ที่ตกลงกับ Client</li>
  <li>ส่งมอบงานตรงเวลาและมีคุณภาพ</li>
  <li>รักษาความลับของ Client และข้อมูลงาน</li>
  <li>ปฏิบัติตามกฎหมายและนโยบายแพลตฟอร์ม</li>
</ul>

<h2>3. สิทธิในการรับค่าตอบแทน</h2>
<p>Freelancer มีสิทธิรับค่าตอบแทนเมื่อส่งมอบงานครบตามที่ตกลง ผ่านระบบ Escrow</p>

<h2>4. ความรับผิด</h2>
<p>Freelancer รับผิดชอบต่อคุณภาพงานและความเสียหายที่เกิดจากความประมาทของตน</p>

<h2>5. สิทธิในทรัพย์สินทางปัญญา</h2>
<p>ตามที่ตกลงใน Job/Contract ระหว่าง Freelancer กับ Client</p>

<h2>6. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'Freelancer Agreement')
ON CONFLICT (type, version) DO NOTHING;

-- Client Agreement
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('client_agreement', '1.0', '<h1>สัญญาการว่าจ้าง Client</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ความสัมพันธ์ทางกฎหมาย</h2>
<p>Client เป็นผู้ว่าจ้างอิสระ Freelancer ผ่านแพลตฟอร์ม AQOND ไม่มีความสัมพันธ์นายจ้าง-ลูกจ้างกับ Freelancer</p>

<h2>2. หน้าที่ของ Client</h2>
<ul>
  <li>ให้ข้อมูลงานและ Scope ที่ชัดเจน</li>
  <li>ชำระเงินผ่านระบบ Escrow ตามที่ตกลง</li>
  <li>ตรวจรับงานและยืนยันภายในระยะเวลาที่กำหนด</li>
  <li>ไม่แทรกแซงการทำงานของ Freelancer โดยไม่จำเป็น</li>
</ul>

<h2>3. การชำระเงิน</h2>
<p>Client ต้องชำระเงินเข้าสู่ Escrow ก่อนเริ่มงานหรือตาม Milestone ที่ตกลง</p>

<h2>4. สิทธิในผลงาน</h2>
<p>ตามที่ตกลงใน Job/Contract เมื่อชำระเงินครบ Client ได้รับสิทธิตามที่ระบุ</p>

<h2>5. การยกเลิก</h2>
<p>การยกเลิกต้องเป็นไปตามนโยบาย Refund และ Dispute</p>

<h2>6. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'Client Agreement')
ON CONFLICT (type, version) DO NOTHING;

-- Content & Chat Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('content_chat', '1.0', '<h1>นโยบายเนื้อหาและการสนทนา</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. เนื้อหาที่ห้าม</h2>
<ul>
  <li>เนื้อหาที่ผิดกฎหมาย หมิ่นประมาท หรือละเมิดสิทธิผู้อื่น</li>
  <li>เนื้อหาลามก อนาจาร หรือสร้างความเกลียดชัง</li>
  <li>การข่มขู่ คุกคาม หรือแสวงหาประโยชน์</li>
  <li>สแปม โฆษณาโดยไม่ได้รับอนุญาต หรือหลอกลวง</li>
  <li>การแชร์ข้อมูลส่วนบุคคลของผู้อื่นโดยไม่ยินยอม</li>
</ul>

<h2>2. การสนทนา (Chat)</h2>
<p>การสนทนาบนแพลตฟอร์มต้องสุภาพ เกี่ยวข้องกับงาน และไม่ละเมิดนโยบายนี้ เราเก็บ Log เพื่อความปลอดภัยและแก้ไขข้อพิพาท</p>

<h2>3. เนื้อหาในโปรไฟล์และพอร์ตโฟลิโอ</h2>
<p>เนื้อหาต้องเป็นของตนเองหรือมีสิทธิใช้ ไม่ละเมิดลิขสิทธิ์</p>

<h2>4. การรายงาน</h2>
<p>หากพบเนื้อหาที่ละเมิด กรุณารายงานผ่านปุ่ม Report หรือ report@aqond.com</p>

<h2>5. ผลที่ตามมา</h2>
<p>การฝ่าฝืนอาจนำไปสู่การลบเนื้อหา การระงับบัญชี ตามนโยบาย Enforcement</p>

<h2>6. ติดต่อเรา</h2>
<p>community@aqond.com</p>',
true, NOW(), 'Content & Chat Policy')
ON CONFLICT (type, version) DO NOTHING;
