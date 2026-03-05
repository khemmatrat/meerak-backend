-- Migration 030: Legal Compliance System
-- สร้างตาราง compliance_policies เพื่อเก็บ Terms of Service และ Privacy Policy
-- พร้อม Versioning และ Audit Trail

-- ตาราง compliance_policies: เก็บนโยบายทั้งหมด (Terms, Privacy)
CREATE TABLE IF NOT EXISTS compliance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL CHECK (type IN ('terms', 'privacy', 'cookie', 'refund', 'community_guidelines')),
  version VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  notes TEXT,
  UNIQUE (type, version)
);

-- Index สำหรับ query เร็ว
CREATE INDEX IF NOT EXISTS idx_compliance_policies_type_active ON compliance_policies(type, is_active);
CREATE INDEX IF NOT EXISTS idx_compliance_policies_created_at ON compliance_policies(created_at DESC);

-- ตาราง user_policy_acceptance: เก็บประวัติการยอมรับนโยบายของ User
CREATE TABLE IF NOT EXISTS user_policy_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES compliance_policies(id) ON DELETE CASCADE,
  policy_type VARCHAR(50) NOT NULL,
  policy_version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(100),
  user_agent TEXT,
  UNIQUE (user_id, policy_id)
);

-- Index สำหรับตรวจสอบว่า User ยอมรับนโยบายล่าสุดหรือยัง
CREATE INDEX IF NOT EXISTS idx_user_policy_acceptance_user_type ON user_policy_acceptance(user_id, policy_type);
CREATE INDEX IF NOT EXISTS idx_user_policy_acceptance_accepted_at ON user_policy_acceptance(accepted_at DESC);

-- เพิ่มคอลัมน์ใน users table เพื่อเก็บเวอร์ชันนโยบายที่ยอมรับล่าสุด (denormalized สำหรับ performance)
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_accepted_terms_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_accepted_privacy_version VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_terms_accepted_at TIMESTAMPTZ;

-- ใส่ข้อมูล Default Policy (Terms v1.0 และ Privacy v1.0)
INSERT INTO compliance_policies (type, version, content, is_active, published_at, notes) VALUES
('terms', '1.0', '<h1>ข้อกำหนดและเงื่อนไขการใช้บริการ aqond</h1>
<p><strong>อัปเดตล่าสุด:</strong> ' || NOW()::DATE || '</p>

<h2>1. การยอมรับข้อกำหนด</h2>
<p>การใช้บริการ aqond แสดงว่าคุณยอมรับข้อกำหนดและเงื่อนไขทั้งหมดตามที่ระบุในเอกสารนี้</p>

<h2>2. การใช้บริการ</h2>
<p>aqond เป็นแพลตฟอร์มเชื่อมต่อนายจ้างและ Talent เพื่อการทำงานอิสระและการให้บริการ</p>

<h2>3. ข้อจำกัดความรับผิด</h2>
<p>aqond ไม่รับผิดชอบต่อความเสียหายใดๆ ที่เกิดจากการใช้บริการ</p>

<h2>4. การเปลี่ยนแปลงข้อกำหนด</h2>
<p>aqond ขอสงวนสิทธิ์ในการเปลี่ยนแปลงข้อกำหนดโดยไม่ต้องแจ้งล่วงหน้า</p>

<h2>5. ติดต่อเรา</h2>
<p>หากมีข้อสงสัย กรุณาติดต่อ: legal@aqond.com</p>', 
true, 
NOW(), 
'เวอร์ชันแรก - Terms of Service'),

('privacy', '1.0', '<h1>นโยบายความเป็นส่วนตัว - AQOND Technology</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || NOW()::DATE || '</p>

<h2>1. ข้อมูลที่เราเก็บรวบรวม</h2>
<p>เราเก็บข้อมูลส่วนบุคคลของคุณเมื่อคุณสมัครใช้บริการ aqond รวมถึง:</p>
<ul>
  <li>ชื่อ-นามสกุล</li>
  <li>อีเมล</li>
  <li>หมายเลขโทรศัพท์</li>
  <li>ข้อมูลการชำระเงิน</li>
  <li>ข้อมูล KYC (Know Your Customer)</li>
</ul>

<h2>2. การใช้ข้อมูล</h2>
<p>เราใช้ข้อมูลของคุณเพื่อ:</p>
<ul>
  <li>ให้บริการแพลตฟอร์ม</li>
  <li>ประมวลผลธุรกรรม</li>
  <li>ปรับปรุงคุณภาพบริการ</li>
  <li>ป้องกันการฉ้อโกง</li>
</ul>

<h2>3. การแบ่งปันข้อมูล</h2>
<p>เราไม่ขายข้อมูลของคุณให้บุคคลที่สาม แต่อาจแบ่งปันกับ Payment Gateway และหน่วยงานกำกับดูแลตามกฎหมาย</p>

<h2>4. ความปลอดภัย</h2>
<p>เราใช้มาตรการรักษาความปลอดภัยระดับสูงในการปกป้องข้อมูลของคุณ</p>

<h2>5. สิทธิของคุณ</h2>
<p>คุณมีสิทธิ์ในการเข้าถึง แก้ไข หรือลบข้อมูลส่วนบุคคลของคุณ</p>

<h2>6. ติดต่อเรา</h2>
<p>หากมีข้อสงสัยเกี่ยวกับนโยบายนี้ กรุณาติดต่อ: privacy@aqond.com</p>', 
true, 
NOW(), 
'เวอร์ชันแรก - Privacy Policy'),

('cookie', '1.0', '<h1>นโยบายคุกกี้ - AQOND Technology</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || NOW()::DATE || '</p>

<h2>1. คุกกี้คืออะไร</h2>
<p>คุกกี้เป็นไฟล์ข้อความขนาดเล็กที่เว็บไซต์ส่งไปยังเบราว์เซอร์ของคุณ เพื่อช่วยให้เว็บไซต์จดจำการตั้งค่าและพฤติกรรมการใช้งานของคุณ</p>

<h2>2. เราใช้คุกกี้อย่างไร</h2>
<p>aqond ใช้คุกกี้เพื่อ:</p>
<ul>
  <li><strong>คุกกี้ที่จำเป็น (Essential Cookies):</strong> เพื่อให้เว็บไซต์ทำงานได้อย่างปกติ รวมถึงการเข้าสู่ระบบและความปลอดภัย</li>
  <li><strong>คุกกี้การวิเคราะห์ (Analytics Cookies):</strong> เพื่อวิเคราะห์การใช้งานเว็บไซต์และปรับปรุงประสบการณ์ของคุณ</li>
  <li><strong>คุกกี้การทำงาน (Functional Cookies):</strong> เพื่อจดจำการตั้งค่าของคุณ เช่น ภาษา</li>
</ul>

<h2>3. การควบคุมคุกกี้</h2>
<p>คุณสามารถจัดการหรือปฏิเสธคุกกี้ได้ผ่านการตั้งค่าเบราว์เซอร์ของคุณ อย่างไรก็ตาม การปิดคุกกี้อาจส่งผลต่อการใช้งานบางส่วนของเว็บไซต์</p>

<h2>4. ติดต่อเรา</h2>
<p>หากมีข้อสงสัยเกี่ยวกับนโยบายคุกกี้ กรุณาติดต่อ: privacy@aqond.com</p>', 
true, 
NOW(), 
'เวอร์ชันแรก - Cookie Policy'),

('refund', '1.0', '<h1>นโยบายการคืนเงิน - aqond</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || NOW()::DATE || '</p>

<h2>1. กรณีที่สามารถขอคืนเงินได้</h2>
<p>aqond อนุญาตให้ขอคืนเงินในกรณีต่อไปนี้:</p>
<ul>
  <li><strong>ชำระเงินผิดพลาด:</strong> หากคุณเติมเงินเกินโดยไม่ตั้งใจ สามารถขอคืนเงินภายใน 7 วัน</li>
  <li><strong>บริการไม่ได้รับตามที่ตกลง:</strong> หาก Talent ไม่สามารถให้บริการตามที่ตกลงไว้ในสัญญา</li>
  <li><strong>ยกเลิกงานก่อนเริ่ม:</strong> หากงานยังไม่เริ่มดำเนินการ คุณสามารถขอคืนเงินได้ (หักค่าธรรมเนียมแพลตฟอร์ม 5%)</li>
</ul>

<h2>2. กรณีที่ไม่สามารถขอคืนเงินได้</h2>
<ul>
  <li>งานเสร็จสมบูรณ์และส่งมอบแล้ว</li>
  <li>ผู้ใช้เปลี่ยนใจหลังจากยืนยันงานแล้ว</li>
  <li>ไม่ได้แจ้งปัญหาภายในระยะเวลาที่กำหนด (7 วัน)</li>
</ul>

<h2>3. ระยะเวลาการคืนเงิน</h2>
<p>หลังจากคำขอคืนเงินได้รับการอนุมัติ เงินจะถูกโอนกลับภายใน <strong>7-14 วันทำการ</strong> ขึ้นอยู่กับช่องทางการชำระเงิน</p>

<h2>4. วิธีการขอคืนเงิน</h2>
<p>กรุณาติดต่อทีมสนับสนุนผ่าน:</p>
<ul>
  <li>อีเมล: support@aqond.com</li>
  <li>โทร: 02-xxx-xxxx</li>
  <li>แชทในแอป aqond</li>
</ul>

<h2>5. ติดต่อเรา</h2>
<p>หากมีข้อสงสัยเกี่ยวกับนโยบายการคืนเงิน กรุณาติดต่อ: support@aqond.com</p>', 
true, 
NOW(), 
'เวอร์ชันแรก - Refund Policy'),

('community_guidelines', '1.0', '<h1>แนวทางปฏิบัติของชุมชน aqond</h1>
<p><strong>มีผลตั้งแต่:</strong> ' || NOW()::DATE || '</p>

<h2>1. การปฏิบัติต่อกันด้วยความเคารพ</h2>
<p>สมาชิกทุกคนของชุมชน aqond ต้องปฏิบัติต่อกันด้วยความเคารพ ไม่เลือกปฏิบัติ และมีมารยาทที่ดี</p>
<ul>
  <li>ห้ามใช้ภาษาที่ไม่เหมาะสม ด่าทอ หรือสร้างความขัดแย้ง</li>
  <li>ห้ามทำให้ผู้อื่นเสียหาย ทั้งทางร่างกายและจิตใจ</li>
  <li>ให้เคารพความคิดเห็นและวัฒนธรรมที่แตกต่าง</li>
</ul>

<h2>2. ความซื่อสัตย์และความโปร่งใส</h2>
<p>การทำงานบนแพลตฟอร์ม aqond ต้องดำเนินการด้วยความซื่อสัตย์:</p>
<ul>
  <li><strong>ห้ามปลอมแปลงข้อมูล:</strong> ทั้งข้อมูลประวัติส่วนตัว พอร์ตโฟลิโอ หรือรีวิว</li>
  <li><strong>ตรงต่อเวลา:</strong> ปฏิบัติงานและส่งมอบงานตามเวลาที่ตกลงไว้</li>
  <li><strong>สื่อสารอย่างชัดเจน:</strong> แจ้งปัญหาหรืออุปสรรคให้ทราบล่วงหน้า</li>
</ul>

<h2>3. ห้ามการกระทำที่ผิดกฎหมาย</h2>
<p>สมาชิกต้องปฏิบัติตามกฎหมายของประเทศไทยและกฎของแพลตฟอร์ม:</p>
<ul>
  <li>ห้ามใช้แพลตฟอร์มเพื่อกิจกรรมที่ผิดกฎหมาย (เช่น การฟอกเงิน การค้ามนุษย์ ฯลฯ)</li>
  <li>ห้ามแชร์หรือขายข้อมูลส่วนบุคคลของผู้อื่น</li>
  <li>ห้ามละเมิดลิขสิทธิ์หรือทรัพย์สินทางปัญญา</li>
</ul>

<h2>4. การรายงานพฤติกรรมที่ไม่เหมาะสม</h2>
<p>หากคุณพบพฤติกรรมที่ไม่เหมาะสมหรือผิดกฎ กรุณารายงานผ่าน:</p>
<ul>
  <li>ปุ่ม "Report" ในโปรไฟล์หรือในแชท</li>
  <li>อีเมล: report@aqond.com</li>
</ul>

<h2>5. ผลที่ตามมาจากการละเมิดแนวทาง</h2>
<p>หากสมาชิกฝ่าฝืนแนวทางนี้ อาจได้รับการดำเนินการดังนี้:</p>
<ul>
  <li><strong>คำเตือน:</strong> สำหรับการฝ่าฝืนครั้งแรก</li>
  <li><strong>ระงับบัญชีชั่วคราว:</strong> 7-30 วัน</li>
  <li><strong>ระงับบัญชีถาวร:</strong> สำหรับการฝ่าฝืนร้ายแรงหรือซ้ำซาก</li>
</ul>

<h2>6. ติดต่อเรา</h2>
<p>หากมีข้อสงสัยเกี่ยวกับแนวทางปฏิบัติของชุมชน กรุณาติดต่อ: community@aqond.com</p>', 
true, 
NOW(), 
'เวอร์ชันแรก - Community Guidelines')
ON CONFLICT (type, version) DO NOTHING;

-- Comment
COMMENT ON TABLE compliance_policies IS 'เก็บ Legal Documents ทั้งหมด (Terms, Privacy) พร้อม Versioning';
COMMENT ON TABLE user_policy_acceptance IS 'บันทึกประวัติการยอมรับนโยบายของ User';
