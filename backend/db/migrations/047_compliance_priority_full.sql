-- =================================================================================
-- 047: Compliance Policies ครบทั้ง 3 Priority
-- Priority 1: Terms ตัวเต็ม, Talent Category Rules, Off-Platform, Escrow Legal, Liability, Safety & Night Work
-- Priority 2: (มีครบแล้ว - ขยายเนื้อหาให้ครบ)
-- Priority 3: AML, Risk Monitoring, Trust & Safety Manual
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

-- 2. Platform Terms of Service ตัวเต็ม (v3.0)
UPDATE compliance_policies SET is_active = false WHERE type = 'terms';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('terms', '3.0', '<h1>ข้อกำหนดและเงื่อนไขการใช้บริการ AQOND (Platform Terms of Service)</h1>
<p><strong>เวอร์ชัน:</strong> 3.0 | <strong>อัปเดตล่าสุด:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>เอกสารนี้จัดทำตามพระราชบัญญัติธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544 และกฎหมายที่เกี่ยวข้อง</p>

<h2>สถานะทางกฎหมายของแพลตฟอร์ม (Platform Legal Status)</h2>
<p><strong>AQOND เป็น Digital Intermediary Platform</strong> ที่ทำหน้าที่เป็นตัวกลางเชื่อมต่อระหว่าง Client (ผู้ว่าจ้าง) กับ Provider/Talent (ผู้ให้บริการ) โดยแพลตฟอร์มไม่เป็นนายจ้างของ Talent ตามประมวลกฎหมายแพ่งและพาณิชย์ และไม่มีความสัมพันธ์ทางกฎหมายในฐานะนายจ้าง-ลูกจ้างกับผู้ให้บริการบนแพลตฟอร์ม</p>

<h2>1. การยอมรับข้อกำหนด</h2>
<p>การใช้บริการ AQOND แสดงว่าคุณยอมรับข้อกำหนดและเงื่อนไขทั้งหมด รวมถึงนโยบายที่อ้างอิงในเอกสารนี้ การสมัครสมาชิกหรือใช้บริการถือเป็นการยอมรับที่มีผลผูกพันทางกฎหมาย</p>

<h2>2. คุณสมบัติผู้ใช้</h2>
<p>คุณต้องมีอายุไม่ต่ำกว่า 18 ปี มีความสามารถตามกฎหมาย และมีสิทธิ์ทำสัญญาได้อย่างถูกต้อง การใช้บริการโดยผู้เยาว์ต้องมีผู้แทนโดยชอบธรรมให้ความยินยอม</p>

<h2>3. การสมัครและบัญชี</h2>
<p>คุณต้องให้ข้อมูลที่ถูกต้อง ครบถ้วน และเป็นปัจจุบัน การให้ข้อมูลเท็จอาจนำไปสู่การระงับบัญชีและความรับผิดทางกฎหมาย คุณรับผิดชอบในการรักษาความลับของบัญชีและรหัสผ่าน</p>

<h2>4. การใช้บริการ</h2>
<p>AQOND เป็นแพลตฟอร์มเชื่อมต่อ Client กับ Talent เพื่อการทำงานอิสระ คุณต้องใช้บริการอย่างสุจริต ไม่ละเมิดสิทธิผู้อื่น ปฏิบัติตามกฎหมายไทย และนโยบายของแพลตฟอร์ม รวมถึง Talent Category Rules และ Prohibited Services</p>

<h2>5. การชำระเงินและ Escrow</h2>
<p>การชำระเงินทั้งหมดต้องดำเนินการผ่านระบบ Escrow ของแพลตฟอร์มเท่านั้น ห้ามชำระเงินหรือรับชำระเงินนอกแพลตฟอร์ม (ดู Off-Platform Transaction Policy) ค่าธรรมเนียมแพลตฟอร์มจะถูกหักจากรายได้ของ Talent ตามระดับ Tier</p>

<h2>6. ข้อจำกัดความรับผิด (Liability Limitation)</h2>
<p>AQOND เป็นตัวกลางเท่านั้น ไม่รับผิดชอบต่อการกระทำ ข้อความ หรือการให้บริการของ User แต่ละราย แพลตฟอร์มไม่รับประกันคุณภาพงาน ความถูกต้องของข้อมูล หรือผลลัพธ์ใดๆ ความรับผิดสูงสุดของแพลตฟอร์มจำกัดตามนโยบาย Liability Limitation</p>

<h2>7. ทรัพย์สินทางปัญญา</h2>
<p>สิทธิในเนื้อหา แบรนด์ และทรัพย์สินทางปัญญาของ AQOND เป็นของ AQOND โดยสมบูรณ์ ผู้ใช้ไม่ได้รับสิทธิ์ในการใช้โดยไม่ได้รับอนุญาต</p>

<h2>8. การระงับและยกเลิกบัญชี</h2>
<p>AQOND ขอสงวนสิทธิ์ในการระงับหรือยกเลิกบัญชีของผู้ใช้ที่ฝ่าฝืนข้อกำหนด หรือเมื่อเห็นสมควร คุณสามารถยกเลิกบัญชีได้ผ่านการตั้งค่า โดยต้องชำระภาระผูกพันที่ค้างอยู่ก่อน</p>

<h2>9. การเปลี่ยนแปลงข้อกำหนด</h2>
<p>AQOND ขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อกำหนด โดยจะแจ้งให้ทราบผ่านแพลตฟอร์มหรืออีเมล การใช้บริการต่อหลังการเปลี่ยนแปลงถือเป็นการยอมรับ เวอร์ชันใหม่มีผลทันทีที่ประกาศ</p>

<h2>10. การบังคับใช้</h2>
<p>การไม่บังคับใช้ข้อกำหนดใดๆ ไม่ถือเป็นการสละสิทธิ์ การบังคับใช้เป็นไปตาม Platform Enforcement Policy</p>

<h2>11. กฎหมายที่ใช้บังคับและเขตอำนาจศาล</h2>
<p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย ศาลไทยมีอำนาจพิจารณาคดีแต่เพียงผู้เดียว</p>

<h2>12. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'v3.0 - Platform Terms ตัวเต็ม')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 3. Talent Category Rules
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('talent_category_rules', '1.0', '<h1>กฎ Talent Category Rules</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. วัตถุประสงค์</h2>
<p>กฎนี้กำหนดข้อกำหนดเฉพาะสำหรับ Talent ในแต่ละ Category เพื่อความปลอดภัย คุณภาพ และความสอดคล้องกับกฎหมาย</p>

<h2>2. ข้อกำหนดทั่วไปทุก Category</h2>
<ul>
  <li>อายุไม่ต่ำกว่า 18 ปี (หรือตามที่กฎหมายกำหนดสำหรับงานเฉพาะ)</li>
  <li>ผ่านการยืนยันตัวตน (KYC) ครบถ้วน</li>
  <li>ให้ข้อมูลโปรไฟล์และพอร์ตโฟลิโอที่ถูกต้อง ไม่ปลอมแปลง</li>
  <li>ปฏิบัติตาม Prohibited Services และ Community Guidelines</li>
</ul>

<h2>3. Category พิเศษและข้อกำหนดเพิ่มเติม</h2>

<h3>3.1 Beauty & Wellness</h3>
<p>ต้องมีใบอนุญาตหรือหลักฐานความสามารถตามกฎหมาย (ถ้ากฎหมายกำหนด) ห้ามให้บริการที่ต้องมีใบประกอบโรคศิลปะโดยไม่มีใบอนุญาต</p>

<h3>3.2 Tech & IT</h3>
<p>งานที่เกี่ยวข้องกับข้อมูลส่วนบุคคลต้องปฏิบัติตาม PDPA และนโยบายความลับของ Client</p>

<h3>3.3 Event & Entertainment</h3>
<p>งานกลางคืนหรืองานที่ต้องพบปะ Client ต้องปฏิบัติตาม Safety & Night Work Policy</p>

<h3>3.4 Professional Services</h3>
<p>งานที่ต้องมีใบอนุญาตวิชาชีพ (เช่น กฎหมาย บัญชี สถาปัตยกรรม) ต้องแสดงหลักฐานการขึ้นทะเบียน</p>

<h2>4. การเปลี่ยนแปลง</h2>
<p>AQOND อาจเพิ่มหรือแก้ไขกฎ Category ได้ โดยจะแจ้งให้ทราบล่วงหน้า</p>

<h2>5. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'Talent Category Rules')
ON CONFLICT (type, version) DO NOTHING;

-- 4. Off-Platform Transaction Policy
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('off_platform_transaction', '1.0', '<h1>นโยบายการทำธุรกรรมนอกแพลตฟอร์ม (Off-Platform Transaction Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. หลักการ</h2>
<p><strong>การชำระเงินทั้งหมดระหว่าง Client กับ Talent ต้องดำเนินการผ่านระบบ Escrow ของ AQOND เท่านั้น</strong> การชำระเงินหรือรับชำระเงินนอกแพลตฟอร์ม (เช่น โอนตรง โอนนอกระบบ แชทส่วนตัว นัดจ่ายเงินสด) เป็นการฝ่าฝืนนโยบายนี้</p>

<h2>2. การกระทำที่ห้าม</h2>
<ul>
  <li>ชักชวนหรือตกลงชำระเงินนอกแพลตฟอร์ม</li>
  <li>แชร์ข้อมูลติดต่อ (เบอร์ โซเชียล) เพื่อหลีกเลี่ยงการชำระผ่านแพลตฟอร์ม</li>
  <li>รับเงินสด โอนธนาคารตรง หรือช่องทางอื่นนอกระบบ AQOND</li>
  <li>เสนอส่วนลดหรือ incentive เพื่อให้ Client ชำระนอกแพลตฟอร์ม</li>
</ul>

<h2>3. เหตุผล</h2>
<p>การชำระผ่านแพลตฟอร์มช่วยคุ้มครองทั้งสองฝ่าย ผ่าน Escrow และระบบระงับข้อพิพาท การชำระนอกแพลตฟอร์มทำให้ไม่ได้รับความคุ้มครองและเพิ่มความเสี่ยงการฉ้อโกง</p>

<h2>4. ผลที่ตามมา</h2>
<p>การฝ่าฝืนจะนำไปสู่: คำเตือน, ระงับบัญชีชั่วคราว, หรือระงับบัญชีถาวร ตามความรุนแรง และอาจต้องคืนค่าธรรมเนียมที่หลีกเลี่ยง</p>

<h2>5. การรายงาน</h2>
<p>หากมีผู้ใช้ชักชวนคุณทำธุรกรรมนอกแพลตฟอร์ม กรุณารายงานที่ report@aqond.com</p>

<h2>6. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'Off-Platform Transaction Policy')
ON CONFLICT (type, version) DO NOTHING;

-- 5. Escrow Legal Clause
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('escrow_legal_clause', '1.0', '<h1>Escrow Legal Clause (ข้อกำหนดทางกฎหมายการเก็บเงินกลาง)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. คำนิยาม</h2>
<p><strong>Escrow</strong> หมายถึง การเก็บเงินที่ Client ชำระไว้กับ AQOND ในฐานะตัวกลาง จนกว่าจะครบเงื่อนไขการปล่อยเงินตามที่ตกลงกันระหว่าง Client กับ Talent</p>

<h2>2. สิทธิในเงิน Escrow</h2>
<p>เงินใน Escrow เป็นของ Client จนกว่าจะมีการปล่อยเงินให้ Talent ตามเงื่อนไข AQOND ไม่มีสิทธิ์ใช้เงินดังกล่าวเพื่อวัตถุประสงค์อื่นนอกจากเก็บรักษาและโอนตามข้อตกลง</p>

<h2>3. เงื่อนไขการปล่อยเงิน</h2>
<p>เงินจะถูกปล่อยให้ Talent เมื่อ: (ก) Client ยืนยันการรับงานครบถ้วน (ข) ครบกำหนดเวลาที่ตกลงโดยไม่มีข้อพิพาท (ค) มีคำตัดสินจาก Dispute Resolution ให้ปล่อยเงิน</p>

<h2>4. กรณีข้อพิพาท</h2>
<p>เมื่อมีข้อพิพาท เงินจะถูกเก็บไว้จนกว่าจะมีคำตัดสินจาก AQOND ตาม Dispute Policy คำตัดสินเป็นไปตามหลักฐานที่ได้รับและเป็นข้อตัดสินสุดท้าย (subject to appeal)</p>

<h2>5. กรณียกเลิกงาน</h2>
<p>การยกเลิกก่อนเริ่มงานหรือตามเงื่อนไขที่กำหนด อาจส่งผลให้คืนเงินให้ Client ตาม Refund Policy โดยหักค่าธรรมเนียมตามที่กำหนด</p>

<h2>6. ความรับผิดของแพลตฟอร์ม</h2>
<p>AQOND ทำหน้าที่เป็นตัวกลางในการเก็บและโอนเงินเท่านั้น ไม่รับผิดชอบต่อคุณภาพงาน ความล่าช้า หรือความเสียหายที่เกิดจากฝ่ายใดฝ่ายหนึ่ง</p>

<h2>7. กฎหมายที่ใช้บังคับ</h2>
<p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย</p>

<h2>8. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'Escrow Legal Clause')
ON CONFLICT (type, version) DO NOTHING;

-- 6. Liability Limitation
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('liability_limitation', '1.0', '<h1>ข้อจำกัดความรับผิด (Liability Limitation)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. บทบาทของ AQOND</h2>
<p>AQOND เป็น Digital Intermediary Platform ที่เชื่อมต่อ Client กับ Talent เท่านั้น ไม่ใช่ผู้ให้บริการโดยตรง ไม่ใช่นายจ้างของ Talent และไม่รับประกันคุณภาพงานหรือผลลัพธ์ใดๆ</p>

<h2>2. ข้อจำกัดความรับผิด</h2>
<p>ในขอบเขตที่กฎหมายอนุญาต AQOND ไม่รับผิดชอบต่อ:</p>
<ul>
  <li>ความเสียหายทางอ้อม  consequential damages หรือ lost profits</li>
  <li>การกระทำ ข้อความ หรือการให้บริการของ User แต่ละราย</li>
  <li>ความล่าช้า ความผิดพลาด หรือการหยุดให้บริการชั่วคราว</li>
  <li>ความเสียหายที่เกิดจากการใช้หรือไม่สามารถใช้แพลตฟอร์ม</li>
</ul>

<h2>3. ขีดจำกัดความรับผิด</h2>
<p>ในกรณีที่ AQOND มีความรับผิดตามกฎหมาย ความรับผิดสูงสุดจะจำกัดไม่เกินจำนวนค่าธรรมเนียมที่ AQOND ได้รับจากผู้ใช้รายนั้นในระยะเวลา 12 เดือนก่อนเหตุการณ์ หรือจำนวนที่กฎหมายกำหนด (แล้วแต่จำนวนใดน้อยกว่า)</p>

<h2>4. การยกเว้น</h2>
<p>ข้อจำกัดนี้ไม่ใช้กับความรับผิดที่เกิดจากความประมาทร้ายแรง การฉ้อโกง หรือการกระทำที่ผิดกฎหมายโดยตรงของ AQOND</p>

<h2>5. กฎหมายที่ใช้บังคับ</h2>
<p>ข้อกำหนดนี้อยู่ภายใต้กฎหมายไทย</p>

<h2>6. ติดต่อเรา</h2>
<p>legal@aqond.com</p>',
true, NOW(), 'Liability Limitation')
ON CONFLICT (type, version) DO NOTHING;

-- 7. อัปเดต Safety & Night Work Policy (night_work_policy v2.0)
UPDATE compliance_policies SET is_active = false WHERE type = 'night_work_policy';

INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('night_work_policy', '2.0', '<h1>นโยบายความปลอดภัยและการทำงานกลางคืน (Safety & Night Work Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>จัดทำตามพระราชบัญญัติคุ้มครองแรงงานและกฎหมายที่เกี่ยวข้อง</p>

<h2>1. ขอบเขต</h2>
<p>นโยบายนี้ใช้กับงานที่ดำเนินการในช่วงเวลากลางคืน (หลัง 22:00 - ก่อน 06:00) หรืองานที่ต้องพบปะ Client ในสถานที่ส่วนตัวหรือนอกสถานที่</p>

<h2>2. ข้อกำหนดการทำงานกลางคืน</h2>
<ul>
  <li>การทำงานกลางคืนต้องเป็นไปตามความยินยอมของทั้ง Client และ Talent</li>
  <li>ควรนัดพบในสถานที่สาธารณะหรือสถานที่ทำงานที่ปลอดภัย</li>
  <li>แจ้งผู้ติดต่อฉุกเฉินหรือเพื่อนเมื่อต้องพบปะในที่ส่วนตัว</li>
  <li>หลีกเลี่ยงการพบปะในที่เปลี่ยวหรือไม่มีคนอื่น</li>
</ul>

<h2>3. ความปลอดภัยทั่วไป</h2>
<ul>
  <li>ทั้ง Client และ Talent ต้องปฏิบัติต่อกันด้วยความเคารพ</li>
  <li>ห้ามคุกคาม ข่มขู่ หรือบังคับ</li>
  <li>หากรู้สึกไม่ปลอดภัย ให้ยุติการพบปะและแจ้งแพลตฟอร์ม</li>
</ul>

<h2>4. การรายงาน</h2>
<p>หากเกิดเหตุการณ์ที่ไม่ปลอดภัย กรุณารายงานทันทีที่ report@aqond.com หรือผ่านปุ่ม Report ในแอป</p>

<h2>5. ผลที่ตามมา</h2>
<p>การฝ่าฝืนอาจนำไปสู่การระงับบัญชีตาม Platform Enforcement Policy</p>

<h2>6. ติดต่อเรา</h2>
<p>safety@aqond.com | compliance@aqond.com</p>',
true, NOW(), 'v2.0 - Safety & Night Work Policy')
ON CONFLICT (type, version) DO UPDATE SET content = EXCLUDED.content, is_active = EXCLUDED.is_active, published_at = EXCLUDED.published_at, notes = EXCLUDED.notes;

-- 8. AML Policy (Priority 3)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('aml_policy', '1.0', '<h1>นโยบายการป้องกันการฟอกเงิน (AML Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>จัดทำตามพระราชบัญญัติป้องกันและปราบปรามการฟอกเงิน พ.ศ. 2542 และพระราชบัญญัติป้องกันและปราบปรามการสนับสนุนทางการเงินแก่การก่อการร้ายและการแพร่ขยายอาวุธที่มีอานุภาพทำลายล้างสูง พ.ศ. 2559</p>

<h2>1. วัตถุประสงค์</h2>
<p>AQOND มีนโยบายต่อต้านการฟอกเงิน (AML) และการสนับสนุนการก่อการร้าย (CFT) อย่างเคร่งครัด</p>

<h2>2. การตรวจสอบตัวตน (KYC)</h2>
<p>เราดำเนินการ KYC กับผู้ใช้ตาม Identity Verification Policy และเก็บเอกสารตามระยะเวลาที่กฎหมายกำหนด</p>

<h2>3. การตรวจสอบธุรกรรมน่าสงสัย</h2>
<p>เราติดตามและวิเคราะห์ธุรกรรมที่อาจเกี่ยวข้องกับการฟอกเงิน เช่น ธุรกรรมขนาดใหญ่ผิดปกติ การโอนเงินซ้ำๆ ในช่วงเวลาสั้น การใช้บัญชีหลายบัญชีโดยบุคคลเดียวกัน</p>

<h2>4. การรายงาน</h2>
<p>เมื่อพบธุรกรรมหรือพฤติกรรมน่าสงสัย เราจะรายงานต่อหน่วยงานที่เกี่ยวข้องตามกฎหมาย (เช่น ปปง. - สำนักงานป้องกันและปราบปรามการฟอกเงิน)</p>

<h2>5. การเก็บรักษาข้อมูล</h2>
<p>ข้อมูลและบันทึกที่เกี่ยวข้องกับ AML ถูกเก็บรักษาตามระยะเวลาที่กฎหมายกำหนด (ไม่น้อยกว่า 5 ปี)</p>

<h2>6. การฝึกอบรม</h2>
<p>พนักงานที่เกี่ยวข้องได้รับการฝึกอบรมเรื่อง AML/CFT อย่างสม่ำเสมอ</p>

<h2>7. ติดต่อเรา</h2>
<p>aml@aqond.com | compliance@aqond.com</p>',
true, NOW(), 'AML Policy')
ON CONFLICT (type, version) DO NOTHING;

-- 9. Risk Monitoring Policy (Priority 3)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('risk_monitoring_policy', '1.0', '<h1>นโยบายการติดตามความเสี่ยง (Risk Monitoring Policy)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>

<h2>1. วัตถุประสงค์</h2>
<p>AQOND มีระบบติดตามความเสี่ยงเพื่อปกป้องผู้ใช้และแพลตฟอร์มจากพฤติกรรมที่เป็นอันตราย การฉ้อโกง และการละเมิดนโยบาย</p>

<h2>2. ประเภทความเสี่ยงที่ติดตาม</h2>
<ul>
  <li><strong>ความเสี่ยงทางการเงิน:</strong> ธุรกรรมผิดปกติ การโอนเงินซ้ำๆ การใช้บัญชีหลายบัญชี</li>
  <li><strong>ความเสี่ยงด้านพฤติกรรม:</strong> การรายงานซ้ำ การยกเลิกงานบ่อย การให้คะแนนต่ำผิดปกติ</li>
  <li><strong>ความเสี่ยงด้านความปลอดภัย:</strong> การเข้าถึงจากอุปกรณ์หรือ IP ผิดปกติ</li>
  <li><strong>ความเสี่ยงด้านเนื้อหา:</strong> เนื้อหาที่ละเมิด Community Guidelines หรือ Prohibited Services</li>
</ul>

<h2>3. วิธีการติดตาม</h2>
<p>เราใช้ระบบอัตโนมัติและทีม Trust & Safety ในการวิเคราะห์ข้อมูล การแจ้งเตือน และการดำเนินการเมื่อพบความเสี่ยง</p>

<h2>4. การดำเนินการ</h2>
<p>เมื่อพบความเสี่ยง เราอาจ: ส่งคำเตือน, ระงับบัญชีชั่วคราว, ระงับบัญชีถาวร, หรือรายงานหน่วยงานที่เกี่ยวข้อง ตามความรุนแรง</p>

<h2>5. ความเป็นส่วนตัว</h2>
<p>การติดตามดำเนินการตาม Privacy Policy และใช้ข้อมูลเฉพาะเพื่อวัตถุประสงค์ที่จำเป็น</p>

<h2>6. ติดต่อเรา</h2>
<p>compliance@aqond.com</p>',
true, NOW(), 'Risk Monitoring Policy')
ON CONFLICT (type, version) DO NOTHING;

-- 10. Trust & Safety Operations Manual (Priority 3)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('trust_safety_manual', '1.0', '<h1>Trust & Safety Operations Manual (คู่มือปฏิบัติงาน Trust & Safety)</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || TO_CHAR(NOW(), 'YYYY-MM-DD') || '</p>
<p>เอกสารนี้เป็นคู่มือสำหรับทีม Trust & Safety ในการดำเนินการตามนโยบายของแพลตฟอร์ม</p>

<h2>1. ขอบเขต</h2>
<p>คู่มือนี้ครอบคลุมกระบวนการตรวจสอบ รายงาน และดำเนินการกับพฤติกรรมที่ละเมิดนโยบาย</p>

<h2>2. ประเภทรายงานและระดับความเร่งด่วน</h2>
<ul>
  <li><strong>P0 - เร่งด่วนสูง:</strong> ความปลอดภัยทันที การคุกคาม ความรุนแรง — ดำเนินการภายใน 24 ชม.</li>
  <li><strong>P1 - เร่งด่วน:</strong> การฉ้อโกง การละเมิดร้ายแรง — ดำเนินการภายใน 72 ชม.</li>
  <li><strong>P2 - ปกติ:</strong> การละเมิดทั่วไป เนื้อหาที่ไม่เหมาะสม — ดำเนินการภายใน 7 วัน</li>
  <li><strong>P3 - ต่ำ:</strong> คำถามหรือข้อร้องเรียนทั่วไป — ดำเนินการภายใน 14 วัน</li>
</ul>

<h2>3. ขั้นตอนการตรวจสอบ</h2>
<ol>
  <li>รับรายงานและจัดระดับความเร่งด่วน</li>
  <li>รวบรวมหลักฐาน (chat log, transaction, profile)</li>
  <li>วิเคราะห์ตามนโยบายที่เกี่ยวข้อง</li>
  <li>ตัดสินใจและดำเนินการ (เตือน/ระงับ/รายงาน)</li>
  <li>บันทึกและติดตามผล</li>
</ol>

<h2>4. การตัดสินใจและอำนาจ</h2>
<p>การระงับบัญชีชั่วคราว: ทีม Trust & Safety | การระงับบัญชีถาวร: ต้องได้รับการอนุมัติจาก Lead/Manager | การรายงานหน่วยงาน: ต้องได้รับการอนุมัติจาก Compliance/Legal</p>

<h2>5. การอุทธรณ์</h2>
<p>ผู้ใช้สามารถอุทธรณ์ได้ภายใน 14 วัน ผ่าน appeal@aqond.com ทีมจะพิจารณาอีกครั้งตามหลักฐานเพิ่มเติม</p>

<h2>6. การบันทึกและ Audit</h2>
<p>ทุกการดำเนินการต้องบันทึกในระบบ Audit Log เพื่อความโปร่งใสและตรวจสอบได้</p>

<h2>7. ติดต่อเรา</h2>
<p>trust-safety@aqond.com | compliance@aqond.com</p>',
true, NOW(), 'Trust & Safety Operations Manual')
ON CONFLICT (type, version) DO NOTHING;
