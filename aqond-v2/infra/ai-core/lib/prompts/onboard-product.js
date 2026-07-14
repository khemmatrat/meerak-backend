export function visionPrompt(merchantHint = "") {
  const hint = merchantHint ? `\nคำใบ้จากผู้ขาย: ${merchantHint}` : "";
  return `คุณเป็นผู้เชี่ยวชาญตลาดไทย อธิบายสินค้าในรูปภาพเป็นภาษาไทยอย่างละเอียด
ระบุ: ชนิดสินค้า, สี, ขนาด/ปริมาณโดยประมาณ, สภาพ, จุดขาย, กลุ่มลูกค้าเป้าหมาย${hint}
ตอบเป็นย่อหน้าเดียว ไม่ใส่ JSON`;
}

export function structuredPrompt(visionDescription, merchantHint = "", retryHint = "") {
  const hint = merchantHint ? `\nคำใบ้เพิ่มเติม: ${merchantHint}` : "";
  const retry = retryHint ? `\nครั้งก่อนผิด: ${retryHint}\nต้องมีครบทุก field โดยเฉพาะ inventory (จำนวนชิ้น)` : "";
  return `จากคำอธิบายสินค้าด้านล่าง สร้างข้อมูลสินค้าสำหรับ marketplace ไทย
ตอบเป็น JSON เท่านั้น ไม่มี markdown ไม่มีข้อความอื่น
Schema (ต้องมีครบทุก key):
{"title":"ชื่อสินค้าภาษาไทยดึงดูด","category":"หมวดหมู่","price_thb":99,"inventory":10,"description":"รายละเอียด","tags":["tag1"]}

กฎ:
- title ไม่เกิน 120 ตัวอักษร ภาษาไทย
- price_thb เป็นตัวเลขบาท (ประมาณการถ้าไม่ทราบ)
- inventory เป็นจำนวนชิ้น (integer) — ถ้าไม่ทราบให้ใส่ 1 เสมอ ห้าม omit
- description ต้องมีเสมอ
${hint}${retry}

คำอธิบายจากรูป:
${visionDescription}`;
}
