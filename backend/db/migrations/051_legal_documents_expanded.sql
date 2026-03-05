-- =================================================================================
-- 051: เอกสารกฎหมายที่ขาด/ต้องขยาย
-- Provider Terms, Escrow & Wallet, Dispute, High-Risk Services, Safety Incident, Trust & Safety
-- =================================================================================

-- 1. ขยาย type
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

-- 2. Freelancer Agreement v2.0 (Provider Terms / Talent Agreement ตัวเต็ม)
UPDATE compliance_policies SET is_active = false WHERE type = 'freelancer_agreement';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('freelancer_agreement', '2.0', '<h1>สัญญาการให้บริการ Provider / Talent Agreement</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>เอกสารนี้เป็นสัญญาระหว่าง Provider (ผู้ให้บริการ/Talent) กับ AQOND สำหรับการให้บริการบนแพลตฟอร์ม</p>

<h2>1. ความสัมพันธ์ทางกฎหมาย</h2>
<p><strong>Provider ไม่ใช่พนักงานของแพลตฟอร์ม AQOND หรือ Client</strong> ตามประมวลกฎหมายแพ่งและพาณิชย์ Provider เป็นผู้ให้บริการอิสระ (Independent Contractor) ที่ทำงานผ่านแพลตฟอร์มเป็นตัวกลางเท่านั้น</p>

<h2>2. Provider รับผิดชอบงานของตัวเอง</h2>
<p>Provider รับผิดชอบต่อคุณภาพงาน การส่งมอบตรงเวลา และความเสียหายที่เกิดจากความประมาทของตน โดยแพลตฟอร์มไม่รับประกันหรือรับผิดชอบต่อการกระทำของ Provider</p>

<h2>3. การเสียภาษี</h2>
<p><strong>การเสียภาษีเป็นหน้าที่ของ Provider</strong> Provider รับผิดชอบในการยื่นภาษีและชำระภาษีตามกฎหมายไทย (เช่น ภาษีเงินได้บุคคลธรรมดา ภ.ง.ด.90) แพลตฟอร์มอาจออกเอกสารสรุปรายได้สำหรับการยื่นภาษี แต่ไม่รับผิดชอบต่อการเสียภาษีของ Provider</p>

<h2>4. มาตรฐานการให้บริการ</h2>
<ul>
  <li>ปฏิบัติงานตาม Scope ที่ตกลงกับ Client</li>
  <li>ส่งมอบงานตรงเวลาและมีคุณภาพตามที่ตกลง</li>
  <li>รักษาความลับของ Client และข้อมูลงาน</li>
  <li>ปฏิบัติตาม Talent Category Rules, Prohibited Services และ Community Guidelines</li>
  <li>ไม่ละเมิดสิทธิผู้อื่นหรือกฎหมาย</li>
</ul>

<h2>5. การห้ามรับงานนอกระบบ</h2>
<p><strong>Provider ห้ามรับงานหรือชำระเงินนอกแพลตฟอร์ม</strong> กับ Client ที่พบผ่าน AQOND การชักชวนหรือตกลงชำระเงินนอกแพลตฟอร์มเป็นการฝ่าฝืน Off-Platform Transaction Policy และอาจนำไปสู่การระงับบัญชี</p>

<h2>6. สิทธิในการรับค่าตอบแทน</h2>
<p>Provider มีสิทธิรับค่าตอบแทนเมื่อส่งมอบงานครบตามที่ตกลง ผ่านระบบ Escrow การถอนเงินต้องเป็นไปตาม Escrow & Wallet Policy</p>

<h2>7. สิทธิในทรัพย์สินทางปัญญา</h2>
<p>ตามที่ตกลงใน Job/Contract ระหว่าง Provider กับ Client</p>

<h2>8. ข้อจำกัดความรับผิดของแพลตฟอร์ม</h2>
<p>AQOND เป็นตัวกลางเท่านั้น ไม่รับผิดชอบต่อคุณภาพงาน ความล่าช้า หรือความเสียหายที่เกิดจาก Provider</p>

<h2>9. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'v2.0 - Provider Terms ตัวเต็ม')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 3. Escrow Policy v2.0 (รวม Escrow & Wallet)
UPDATE compliance_policies SET is_active = false WHERE type = 'escrow_policy';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('escrow_policy', '2.0', '<h1>นโยบาย Escrow (การเก็บเงินกลาง) และ Wallet</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. เงินอยู่ที่ไหน</h2>
<p>เงินที่ Client ชำระจะถูกเก็บไว้ในบัญชี Escrow ของแพลตฟอร์ม (หรือบัญชีที่ได้รับอนุญาตตามกฎหมาย) เงินใน Wallet ของผู้ใช้ถูกเก็บไว้ในบัญชีแยกตามที่กฎหมายกำหนด</p>

<h2>2. เงินเป็นของใคร</h2>
<p><strong>เงินใน Escrow:</strong> เป็นของ Client จนกว่าจะมีการปล่อยเงินให้ Provider ตามเงื่อนไขที่ตกลง</p>
<p><strong>เงินใน Wallet:</strong> เงินที่ปล่อยให้ Provider แล้ว เป็นของ Provider เงินที่ Client เติมเข้า Wallet เป็นของ Client</p>

<h2>3. แพลตฟอร์มถือเงินในฐานะอะไร</h2>
<p>AQOND ถือเงินในฐานะ <strong>ตัวกลาง (Escrow Agent)</strong> ตาม Escrow Legal Clause ไม่มีสิทธิ์ใช้เงินเพื่อวัตถุประสงค์อื่นนอกจากเก็บรักษาและโอนตามข้อตกลง</p>

<h2>4. Flow กฎหมาย</h2>
<p>Client → เงินเข้า AQOND → Lock เงินใน Escrow → งานเสร็จ/ยืนยันรับงาน → ปล่อยเงินให้ Provider ตามเงื่อนไข</p>

<h2>5. การถอนเงินทำอย่างไร</h2>
<p>Provider สามารถถอนเงินจาก Wallet ได้ผ่านระบบ Payout Request เมื่อ: (ก) เงินถูกปล่อยจาก Escrow เข้า Wallet แล้ว (ข) ผ่านการตรวจสอบ KYC ตามที่กำหนด (ค) บัญชีไม่ถูกระงับหรือแบน</p>
<p>การถอนต้องมีบัญชีธนาคารที่ลงทะเบียน และอาจมีค่าธรรมเนียมตามที่แพลตฟอร์มกำหนด</p>

<h2>6. เงินประกันงานคืออะไร</h2>
<p>เงินใน Escrow เป็นเงินประกันงาน (Job Deposit) ที่ Client ชำระไว้เพื่อรับประกันการทำงาน เมื่องานเสร็จครบ Client ยืนยันรับงาน เงินจะถูกปล่อยให้ Provider (หักค่าธรรมเนียมแพลตฟอร์ม)</p>

<h2>7. กรณีข้อพิพาท</h2>
<p>เมื่อมีข้อพิพาท เงินจะถูกเก็บไว้จนกว่าจะมีคำตัดสินจาก AQOND ตาม Dispute Policy</p>

<h2>8. ติดต่อเรา</h2>
<p>legal@aqond.com | support@aqond.com</p>',
true, NOW(), 'v2.0 - Escrow & Wallet Policy ตัวเต็ม')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 4. Dispute Resolution Policy v2.0
UPDATE compliance_policies SET is_active = false WHERE type = 'dispute';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('dispute', '2.0', '<h1>นโยบายการระงับข้อพิพาท (Dispute Resolution Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. เปิด Dispute ได้เมื่อไร</h2>
<p>สามารถเปิด dispute ได้เมื่อ:</p>
<ul>
  <li>งานไม่ส่งมอบครบหรือตามที่ตกลง</li>
  <li>คุณภาพงานไม่ตรงตามที่ตกลง</li>
  <li>มีการฉ้อโกงหรือการกระทำผิด</li>
  <li>มีการยกเลิกงานโดยไม่เป็นธรรม</li>
</ul>
<p>ต้องแจ้งภายใน <strong>7 วัน</strong> หลังเหตุการณ์หรือหลังครบกำหนดส่งมอบ</p>

<h2>2. หลักฐานอะไรใช้ตัดสิน</h2>
<ul>
  <li>ข้อความแชทระหว่าง Client กับ Provider</li>
  <li>รูปภาพ ไฟล์ หรือหลักฐานการส่งมอบ</li>
  <li>รายละเอียดของ Job/Contract</li>
  <li>หลักฐานการชำระเงิน</li>
</ul>
<p>การให้หลักฐานที่เท็จหรือปลอมแปลงอาจนำไปสู่การระงับบัญชี</p>

<h2>3. ใครเป็นผู้ตัดสิน</h2>
<p>ทีม Trust & Safety ของ AQOND เป็นผู้พิจารณาและตัดสินตามหลักฐานที่ได้รับ คำตัดสินเป็นไปตามนโยบายและข้อกำหนดของแพลตฟอร์ม</p>

<h2>4. ใช้เวลานานแค่ไหน</h2>
<p>โดยทั่วไปทีมจะพิจารณาอย่างเร็วที่สุดภายใน <strong>14 วันทำการ</strong> สำหรับกรณีเร่งด่วน (เช่น ความปลอดภัย การฉ้อโกง) อาจพิจารณาก่อน</p>

<h2>5. การตัดสิน</h2>
<p>คำตัดสินอาจรวมถึง: ปล่อยเงินทั้งหมด/บางส่วนให้ Provider, คืนเงินให้ Client, หรือแบ่งตามสัดส่วน ตามหลักฐานและความเหมาะสม</p>

<h2>6. การอุทธรณ์</h2>
<p>สามารถอุทธรณ์ได้ภายใน 7 วัน ผ่าน support@aqond.com พร้อมหลักฐานเพิ่มเติม</p>

<h2>7. ติดต่อเรา</h2>
<p>support@aqond.com</p>',
true, NOW(), 'v2.0 - Dispute Resolution Policy ตัวเต็ม')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 5. High-Risk Services Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('high_risk_services_policy', '1.0', '<h1>นโยบายบริการความเสี่ยงสูง (High-Risk Services Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>แพลตฟอร์ม AQOND มีบริการประเภทที่ต้องควบคุมเป็นพิเศษ</p>

<h2>1. อะไรทำได้</h2>
<ul>
  <li><strong>Home Service:</strong> บริการที่บ้าน Client ได้ — ต้องปฏิบัติตาม Safety & Night Work Policy และนัดพบในสถานที่ปลอดภัย</li>
  <li><strong>Night Job:</strong> งานกลางคืน — ต้องเป็นไปตามความยินยอมทั้งสองฝ่าย และปฏิบัติตาม Safety & Night Work Policy</li>
  <li><strong>Event & Entertainment:</strong> งานอีเวนต์ พาร์ตี้ งานแสดง — ต้องไม่ละเมิดกฎหมายหรือ Prohibited Services</li>
  <li><strong>Model:</strong> งานถ่ายแบบ — ต้องไม่เป็นเนื้อหาลามก อนาจาร หรือผิดกฎหมาย</li>
</ul>

<h2>2. อะไรทำไม่ได้</h2>
<ul>
  <li>บริการที่ผิดกฎหมายไทย</li>
  <li>บริการที่เกี่ยวข้องกับการค้ามนุษย์ หรือแสวงหาประโยชน์ทางเพศ</li>
  <li>บริการที่เกี่ยวข้องกับการพนัน หรือการผิดกฎหมาย</li>
  <li>บริการที่ต้องมีใบอนุญาตวิชาชีพโดยไม่มีใบอนุญาต</li>
</ul>

<h2>3. อะไรผิดกฎหมาย</h2>
<p>บริการที่ต้องห้ามตามกฎหมายไทย และ Prohibited Services List รวมถึงบริการที่ละเมิดพระราชบัญญัติว่าด้วยการกระทำความผิดเกี่ยวกับคอมพิวเตอร์ พ.ศ. 2550</p>

<h2>4. อะไรต้อง KYC ระดับสูง</h2>
<p>บริการที่ต้องพบปะ Client ในสถานที่ส่วนตัว งานกลางคืน หรืองานที่เกี่ยวข้องกับเงินจำนวนมาก ต้องผ่าน KYC Level 2 (Full Verification) ก่อนให้บริการ</p>

<h2>5. Dating</h2>
<p>หากแพลตฟอร์มมีบริการ Dating ต้องปฏิบัติตามกฎหมายและ Community Guidelines อย่างเคร่งครัด ห้ามเนื้อหาลามกหรือการแสวงหาประโยชน์</p>

<h2>6. การรายงาน</h2>
<p>หากพบบริการที่ละเมิดนโยบายนี้ กรุณารายงานที่ report@aqond.com</p>

<h2>7. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'High-Risk Services Policy')
ON CONFLICT (type, version) DO NOTHING;

-- 6. Safety Incident Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('safety_incident_policy', '1.0', '<h1>นโยบายเหตุการณ์ความปลอดภัย (Safety Incident Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>เมื่อเกิดเหตุการณ์ที่ไม่ปลอดภัย แพลตฟอร์มมีขั้นตอนชัดเจนดังนี้</p>

<h2>1. ประเภทเหตุการณ์</h2>
<ul>
  <li><strong>การคุกคาม:</strong> ข่มขู่ ทำร้าย หรือแสวงหาประโยชน์</li>
  <li><strong>การลวนลาม:</strong> พฤติกรรมทางเพศที่ไม่เหมาะสม</li>
  <li><strong>การฉ้อโกง:</strong> หลอกลวง รับงานแล้วหนี</li>
  <li><strong>อันตราย:</strong> เหตุการณ์ที่อาจเป็นอันตรายต่อชีวิตหรือทรัพย์สิน</li>
</ul>

<h2>2. ขั้นตอนเมื่อเกิดเหตุ</h2>
<ol>
  <li><strong>แจ้งเหตุทันที:</strong> ผ่านปุ่ม Report ในแอป หรือ report@aqond.com หรือสายด่วน (ถ้ามี)</li>
  <li><strong>ทีม Trust & Safety รับเรื่อง:</strong> จัดระดับความเร่งด่วน (P0-P3)</li>
  <li><strong>ระงับเงิน (ถ้าจำเป็น):</strong> ระงับ Wallet/Escrow ของผู้เกี่ยวข้องระหว่างการตรวจสอบ</li>
  <li><strong>รวบรวมหลักฐาน:</strong> Chat log, หลักฐานการพบปะ, รายงานจากผู้ใช้</li>
  <li><strong>ตัดสินและดำเนินการ:</strong> ระงับบัญชี, แบน, หรือรายงานหน่วยงานที่เกี่ยวข้อง</li>
</ol>

<h2>3. การรายงานหน่วยงานรัฐ</h2>
<p>เมื่อเหตุการณ์เกี่ยวข้องกับความผิดทางกฎหมาย (เช่น ฉ้อโกง คุกคาม) AQOND จะส่งข้อมูลให้เจ้าหน้าที่รัฐตามที่กฎหมายกำหนด</p>

<h2>4. ความเป็นส่วนตัว</h2>
<p>การดำเนินการเป็นไปตาม Privacy Policy ข้อมูลจะถูกใช้เฉพาะเพื่อวัตถุประสงค์ที่จำเป็น</p>

<h2>5. ติดต่อเรา</h2>
<p>report@aqond.com | safety@aqond.com | trust-safety@aqond.com</p>',
true, NOW(), 'Safety Incident Policy')
ON CONFLICT (type, version) DO NOTHING;

-- 7. Trust & Safety Manual v2.0 (เพิ่ม Trust & Safety Framework)
UPDATE compliance_policies SET is_active = false WHERE type = 'trust_safety_manual';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('trust_safety_manual', '2.0', '<h1>Trust & Safety Framework (กรอบความปลอดภัยและความน่าเชื่อถือ)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. ระบบตรวจจับโกง</h2>
<p>AQOND มีระบบตรวจจับพฤติกรรมที่น่าสงสัย:</p>
<ul>
  <li>การสร้างบัญชีหลายบัญชีโดยบุคคลเดียวกัน</li>
  <li>การโอนเงินผิดปกติหรือซ้ำๆ ในช่วงเวลาสั้น</li>
  <li>การยกเลิกงานบ่อยผิดปกติ</li>
  <li>การให้คะแนนหรือรีวิวที่ผิดปกติ (ปั่นรีวิว)</li>
</ul>

<h2>2. Risk Scoring</h2>
<p>แพลตฟอร์มใช้ Risk Score สำหรับบัญชีและธุรกรรม:</p>
<ul>
  <li><strong>Account Risk:</strong> จากประวัติการใช้งาน KYC level และพฤติกรรม</li>
  <li><strong>Transaction Risk:</strong> จากขนาดธุรกรรม ความถี่ และรูปแบบ</li>
  <li><strong>Behavior Risk:</strong> จากรายงาน การยกเลิก และการโต้ตอบ</li>
</ul>
<p>บัญชีที่มี Risk สูงอาจถูกระงับหรือตรวจสอบเพิ่มเติม</p>

<h2>3. Account Monitoring</h2>
<p>การติดตามบัญชี:</p>
<ul>
  <li>การเข้าถึงจากอุปกรณ์หรือ IP ผิดปกติ</li>
  <li>การเปลี่ยนแปลงข้อมูลบัญชีอย่างรวดเร็ว</li>
  <li>การรายงานที่เกี่ยวข้องกับบัญชี</li>
</ul>

<h2>4. ประเภทรายงานและระดับความเร่งด่วน</h2>
<ul>
  <li><strong>P0 - เร่งด่วนสูง:</strong> ความปลอดภัยทันที การคุกคาม ความรุนแรง — ดำเนินการภายใน 24 ชม.</li>
  <li><strong>P1 - เร่งด่วน:</strong> การฉ้อโกง การละเมิดร้ายแรง — ดำเนินการภายใน 72 ชม.</li>
  <li><strong>P2 - ปกติ:</strong> การละเมิดทั่วไป เนื้อหาที่ไม่เหมาะสม — ดำเนินการภายใน 7 วัน</li>
  <li><strong>P3 - ต่ำ:</strong> คำถามหรือข้อร้องเรียนทั่วไป — ดำเนินการภายใน 14 วัน</li>
</ul>

<h2>5. ขั้นตอนการตรวจสอบ</h2>
<ol>
  <li>รับรายงานและจัดระดับความเร่งด่วน</li>
  <li>รวบรวมหลักฐาน (chat log, transaction, profile)</li>
  <li>วิเคราะห์ตามนโยบายที่เกี่ยวข้อง</li>
  <li>ตัดสินใจและดำเนินการ (เตือน/ระงับ/รายงาน)</li>
  <li>บันทึกและติดตามผล</li>
</ol>

<h2>6. การตัดสินใจและอำนาจ</h2>
<p>การระงับบัญชีชั่วคราว: ทีม Trust & Safety | การระงับบัญชีถาวร: ต้องได้รับการอนุมัติจาก Lead/Manager | การรายงานหน่วยงาน: ต้องได้รับการอนุมัติจาก Compliance/Legal</p>

<h2>7. การอุทธรณ์</h2>
<p>ผู้ใช้สามารถอุทธรณ์ได้ภายใน 14 วัน ผ่าน appeal@aqond.com</p>

<h2>8. ติดต่อเรา</h2>
<p>trust-safety@aqond.com | compliance@aqond.com</p>',
true, NOW(), 'v2.0 - Trust & Safety Framework ตัวเต็ม')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;
