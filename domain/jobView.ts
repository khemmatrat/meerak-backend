export type JobView =
  | "POSTED"            // คนจ้าง: งานที่เราสร้าง
  | "WORKING"           // คนรับงาน: งานที่เรากำลังทำ
  | "HISTORY"           // งานที่จบแล้ว
  | "RECOMMENDED"       // งานแนะนำ
  | "PROVIDER_ACTIVE"   // Provider Dashboard: งานที่กำลังทำทั้งหมด
  | "PROVIDER_HISTORY"; // Provider Dashboard: ประวัติงาน
