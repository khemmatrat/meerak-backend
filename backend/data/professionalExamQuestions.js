/**
 * แบบทดสอบมาตรฐานการบริการและความปลอดภัยของ Nexus — 55 ข้อ
 * ผ่าน ≥85%, ไม่ผ่านรอ 24 ชม.
 */
const QUESTIONS = [
  { id: 'nex-q1', text: 'เมื่อถึงบ้านลูกค้า ผู้ให้บริการควรทำอย่างไรก่อนเริ่มงาน?', options: [{ id: 'a', text: 'โทรแจ้งลูกค้าว่าถึงแล้ว แล้วเข้าได้เลย', isCorrect: false }, { id: 'b', text: 'ทักทาย แนะนำตัว และยืนยันรายละเอียดงานกับลูกค้าก่อน', isCorrect: true }, { id: 'c', text: 'เริ่มทำงานทันทีเพื่อประหยัดเวลา', isCorrect: false }, { id: 'd', text: 'ถ่ายรูปหน้าบ้านแล้วส่งให้แอดมิน', isCorrect: false }] },
  { id: 'nex-q2', text: 'หากลูกค้าไม่อยู่บ้านแต่มีการนัดหมายไว้ ผู้ให้บริการควรทำอย่างไร?', options: [{ id: 'a', text: 'เข้าไปทำงานในบ้านได้เลยถ้าประตูเปิด', isCorrect: false }, { id: 'b', text: 'โทรติดต่อลูกค้าและรอคำยืนยันก่อน ไม่เข้าโดยพลการ', isCorrect: true }, { id: 'c', text: 'ยกเลิกงานและกลับบ้าน', isCorrect: false }, { id: 'd', text: 'รอ 5 นาทีแล้วเข้าได้', isCorrect: false }] },
  { id: 'nex-q3', text: 'การเก็บข้อมูลส่วนตัวของลูกค้า (เบอร์ โทร ที่อยู่) ควรทำอย่างไร?', options: [{ id: 'a', text: 'แชร์ให้เพื่อนร่วมงานได้ถ้าต้องการ', isCorrect: false }, { id: 'b', text: 'ใช้เฉพาะเพื่อการติดต่อและดำเนินงานนั้นๆ ไม่นำไปใช้หรือเปิดเผยโดยไม่จำเป็น', isCorrect: true }, { id: 'c', text: 'บันทึกในโทรศัพท์ส่วนตัวได้ตามสะดวก', isCorrect: false }, { id: 'd', text: 'ส่งให้แอดมินเก็บไว้เท่านั้น', isCorrect: false }] },
  { id: 'nex-q4', text: 'หากงานที่ทำมีอันตราย (เช่น ไฟฟ้า สารเคมี) สิ่งที่ต้องทำก่อนเริ่มงานคือ?', options: [{ id: 'a', text: 'เริ่มทำงานได้เลยถ้ามีประสบการณ์', isCorrect: false }, { id: 'b', text: 'สวมใส่อุปกรณ์ป้องกันและตรวจสอบความปลอดภัยของพื้นที่ก่อน', isCorrect: true }, { id: 'c', text: 'ให้ลูกค้าทำแทน', isCorrect: false }, { id: 'd', text: 'ทำงานให้เร็วๆ เพื่อลดเวลาเสี่ยง', isCorrect: false }] },
  { id: 'nex-q5', text: 'เมื่อเกิดอุบัติเหตุหรือความเสียหายระหว่างทำงาน ควรทำอย่างไร?', options: [{ id: 'a', text: 'ไม่บอกใครและแก้ไขเองถ้าเป็นไปได้', isCorrect: false }, { id: 'b', text: 'แจ้งลูกค้าและแพลตฟอร์มทันที และบันทึกภาพ/หลักฐานตามสมควร', isCorrect: true }, { id: 'c', text: 'บอกเฉพาะลูกค้า', isCorrect: false }, { id: 'd', text: 'หยุดทำงานและกลับบ้าน', isCorrect: false }] },
];

const PASS_PERCENT = 85;
const COOLDOWN_HOURS = 24;
const COURSE_ID = 'nexus-standards';

function getQuestions() {
  return QUESTIONS.map((q) => ({
    id: q.id,
    text: q.text,
    type: 'mcq',
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: !!o.isCorrect })),
  }));
}

function scoreExam(answers) {
  let correct = 0;
  const total = QUESTIONS.length;
  for (const q of QUESTIONS) {
    const selectedId = answers[q.id];
    const correctOption = q.options.find((o) => o.isCorrect);
    if (correctOption && selectedId === correctOption.id) correct += 1;
  }
  const percent = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
  return { correct, total, percent };
}

export { getQuestions, scoreExam, PASS_PERCENT, COOLDOWN_HOURS, COURSE_ID, QUESTIONS };
