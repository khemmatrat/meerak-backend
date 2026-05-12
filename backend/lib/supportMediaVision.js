/**
 * สรุปภาพด้วย Gemini Vision (URL ต้องเข้าถึงได้จากเซิร์ฟเวอร์)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

function isImageUrl(url) {
  const u = String(url || '').toLowerCase();
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u) || u.includes('image/');
}

export async function summarizeMediaUrl(url, typeHint = '') {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return null;
  const isVideo = /video|\.(mp4|webm|mov)(\?|$)/i.test(typeHint + u);
  if (isVideo) {
    return '[วิดีโอ] ระบบสรุปเชิงลึกจากวิดีโอยังไม่เปิดใช้ — กรุณาดูไฟล์โดยตรงหรือแนบภาพหน้าจอแทน';
  }
  if (!isImageUrl(u) && !typeHint.toLowerCase().includes('image')) {
    return null;
  }

  if (!genAI || !process.env.GEMINI_API_KEY) {
    return 'สรุปภาพ: ตั้งค่า GEMINI_API_KEY ใน backend เพื่อเปิดใช้ Vision';
  }

  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return `ไม่สามารถโหลดภาพ (${res.status})`;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get('content-type') || 'image/jpeg';
    const base64 = buf.toString('base64');
    const modelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent([
      {
        inlineData: { mimeType: mime.split(';')[0].trim() || 'image/jpeg', data: base64 },
      },
      {
        text: 'สรุปภาพนี้สั้นๆ 2–4 ประโยค ภาษาไทย สำหรับผู้ดูแล Support — เน้นสิ่งที่เกี่ยวกับปัญหาหรือหลักฐาน',
      },
    ]);
    const out = (await result.response.text()).trim();
    return out || null;
  } catch (e) {
    console.warn('summarizeMediaUrl:', e?.message);
    return null;
  }
}
