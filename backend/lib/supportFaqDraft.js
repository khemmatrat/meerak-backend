/**
 * สร้างคู่ FAQ จากบทสนทนา Support (Gemini) — ใช้ข้อความที่ mask PII แล้ว
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

export async function generateFaqFromTranscript({ subject, transcriptText }) {
  const text = String(transcriptText || '').trim();
  if (!text) return null;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  if (!genAI || !process.env.GEMINI_API_KEY) {
    const q = subject || 'สรุปจากตั๋วสนับสนุน';
    return {
      question: q.slice(0, 200),
      answer: text.slice(0, 1500),
      category: 'General',
      source: 'fallback',
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { temperature: 0.35, maxOutputTokens: 2048 },
    });
    const prompt = `คุณคือ Minnie ผู้ช่วยสร้างคลังความรู้ AQOND
จากบทสนทนาสนับสนุนลูกค้าด้านล่าง ให้สรุปเป็นคู่ FAQ หนึ่งคู่ (คำถามสั้นชัด + คำตอบใช้งานได้จริง เป็นข้อๆ ได้)
หัวข้อตั๋ว: ${subject || '(ไม่มี)'}

บทสนทนา:
${text.slice(0, 12000)}

ตอบกลับเป็น JSON เท่านั้น รูปแบบ:
{"question":"...","answer":"...","category":"General|Billing|Technical|Account"}
ห้ามใส่ markdown หรือข้อความนอก JSON`;

    const result = await model.generateContent(prompt);
    const raw = (await result.response.text()).trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      question: String(parsed.question || '').trim(),
      answer: String(parsed.answer || '').trim(),
      category: ['Billing', 'Technical', 'Account', 'General'].includes(parsed.category) ? parsed.category : 'General',
      source: 'gemini',
    };
  } catch (e) {
    console.error('generateFaqFromTranscript:', e?.message);
    return null;
  }
}
