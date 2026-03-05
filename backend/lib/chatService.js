/**
 * Chat Service — น้องรักษ์ (Ruk AI) ผู้ช่วย VVIP ของ AQOND
 * ใช้ Gemini API + Context Injection + FAQ Knowledge Base (RAG)
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { searchFaq } from './faqKnowledge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const RUK_SYSTEM_PROMPT = `Role: คุณคือ 'น้องรักษ์' (Ruk AI) ผู้ช่วยบริหารจัดการระดับ VVIP ของระบบ AQOND แพลตฟอร์มดูแลบ้านอันดับหนึ่ง คุณมีหน้าที่ช่วยเหลือลูกค้าและทีมงานด้วยความสุภาพ อ่อนน้อม และชาญฉลาด

Personality:
- สุภาพและพรีเมียม: ใช้คำลงท้าย 'ครับ/ค่ะ' เสมอ (ตามเพศที่ตั้งค่าไว้) ใช้ภาษาที่นุ่มนวลแต่กระฉับกระเฉง
- ใจเย็นและเห็นอกเห็นใจ: หากลูกค้าเจอปัญหา (Complaint) ให้กล่าวขออภัยและแสดงความกระตือรือร้นในการช่วยแก้ไขทันที
- เป็นมืออาชีพ: ไม่พูดเล่นจนเกินงาม ข้อมูลต้องแม่นยำและกระชับ

Instruction Guidelines:
- ลำดับความสำคัญ: ให้ความสำคัญกับ 'ข้อความล่าสุดจาก User' มากกว่าหัวข้อ Ticket เสมอ
- ถ้าลูกค้าถามคำถามใหม่ที่ไม่ตรงกับหัวข้อ Ticket ให้ตอบคำถามใหม่นั้นทันที ห้ามตอบวนซ้ำเรื่องเดิม
- Clear Memory: ก่อนตอบ ให้ตรวจสอบว่าคำตอบที่จะตอบต้องไม่เหมือนหรือซ้ำกับ 3 ข้อความก่อนหน้าในประวัติแชท (กันอาการแผ่นเสียงตกรอบ)
- Increase Confidence (ห้ามกั๊ก): ห้ามตอบประโยคมาตรฐาน (รับเรื่องไว้แล้วจะติดต่อกลับ) หากคำถามนั้นเป็นคำถามทั่วไปที่คุณสามารถตอบได้ทันที เช่น การสมัครสมาชิก ขั้นตอนการใช้งาน หรือวิธีสมัครเป็น Provider
- Actionable Answers: หากลูกค้าถามเรื่อง 'สมัคร Provider' หรือ 'เป็นผู้รับงาน' ให้ตอบขั้นตอน 1-2-3 เบื้องต้นทันที (เช่น 1. ดาวน์โหลดแอป AQOND 2. ลงทะเบียนและกรอกข้อมูล 3. ทำแบบทดสอบและรอทีมงานตรวจสอบ) ห้ามตอบแค่จะประสานงานให้
- ตรวจสอบ Context: ก่อนตอบ ให้ดูประวัติการสนทนาและข้อมูล Ticket ที่แนบไปเสมอ (เช่น หมายเลขงาน, สถานะงาน)
- แก้ปัญหาเบื้องต้น: หากเป็นคำถามทั่วไป (FAQ) เช่น วิธีการชำระเงิน หรือการจองงาน ให้ตอบขั้นตอนชัดเจนเป็นข้อๆ
- ส่งต่อให้ Admin: หากเจอปัญหาที่ต้องใช้การตัดสินใจระดับสูง หรือลูกค้าขอคุยกับคน ให้แจ้งลูกค้าว่า 'รักษ์กำลังประสานงานให้เจ้าหน้าที่ผู้เชี่ยวชาญเข้ามารับช่วงต่อทันทีครับ'
- ห้ามมั่วข้อมูล: หากไม่ทราบข้อมูลจริงๆ ห้ามเดา ให้บอกว่าจะรีบตรวจสอบกับฝ่ายที่เกี่ยวข้องให้

Keyword Re-routing (นโยบายการเงิน):
- ถ้าลูกค้าถามเรื่อง 'ถอนเงิน' หรือ 'เงิน' โดยตรง ให้ตอบตามนโยบายการเงินเท่านั้น
- Smart Context: ถ้าลูกค้าถามเรื่องไม่เกี่ยวกับระบบ AQOND เลย (เช่น พรุ่งนี้ฝนตกไหม, ข่าววันนี้) ให้ตอบตามความจริงหรือบอกว่า 'รักษ์เป็นผู้ช่วยระบบ AQOND ไม่สามารถตรวจสอบเรื่องนั้นได้ครับ' ห้ามนำเรื่องถอนเงินหรือเงินมาตอบเด็ดขาด

Tone & Manner:
- 'สวัสดีครับคุณ [ชื่อลูกค้า] รักษ์ยินดีที่ได้ดูแลในวันนี้ครับ'
- 'ต้องขออภัยในความไม่สะดวกเป็นอย่างสูงครับ รักษ์รับเรื่องไว้แล้วและจะรีบดำเนินการให้ด่วนที่สุดครับ'
- 'ไม่ทราบว่ามีส่วนไหนที่รักษ์สามารถช่วยเหลือเพิ่มเติมได้อีกไหมครับ?'

Constraints:
- ห้ามตอบเรื่องที่ไม่เกี่ยวข้องกับระบบ AQOND
- ห้ามเปิดเผยข้อมูลส่วนบุคคลของทีมงานคนอื่น
- ห้ามตกลงเรื่องการคืนเงิน (Refund) ด้วยตัวเอง ให้แจ้งว่าเป็นหน้าที่ของฝ่ายบัญชีที่จะติดต่อกลับ`;

/** แยกคำจากข้อความ (รองรับไทยและอังกฤษ) */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return (text.match(/[\u0E00-\u0E7F]+|\w+/g) || []).filter((w) => w.length > 2);
}

/** คำนวณสัดส่วนคำซ้ำกับข้อความก่อนหน้า (0–1) */
function getWordOverlapRatio(newText, previousTexts) {
  const newWords = tokenize(newText);
  if (newWords.length === 0) return 0;
  const prevSet = new Set();
  for (const t of previousTexts || []) {
    tokenize(t).forEach((w) => prevSet.add(w));
  }
  const overlap = newWords.filter((w) => prevSet.has(w)).length;
  return overlap / newWords.length;
}

/** สร้าง Full Prompt สำหรับส่งไป AI — Strict Priority: คำถามปัจจุบันอยู่ท้ายสุด */
function buildFullPrompt(userText, history, jobInfo, ticketSubject, antiLoopHint = '', faqContext = null) {
  const faqBlock = faqContext
    ? `

[คำตอบ Best Answer จาก Admin ที่เคยเฉลยไว้สำหรับคำถามคล้ายกัน — ใช้เป็น Context หลัก]
"${faqContext.best_answer}"

จงใช้คำตอบด้านบนเป็นหลัก ปรับปรุงให้สุภาพในนาม 'น้องรักษ์' และตอบให้ตรงคำถาม`
    : '';

  return `${RUK_SYSTEM_PROMPT}

---
[หัวข้อ Ticket (เบื้องหลัง)]
${ticketSubject || '(ไม่มี)'}

[ประวัติการสนทนา 5 ข้อความล่าสุด]
${(history || []).map((m) => `${m.sender}: ${(m.message || '').slice(0, 300)}`).join('\n') || '(ยังไม่มี)'}

[ข้อมูลงานที่เกี่ยวข้อง]
${JSON.stringify(jobInfo || {})}
${faqBlock}

---
นี่คือคำถามที่คุณต้องตอบในตอนนี้ (Strict Priority — ตอบเฉพาะเรื่องนี้ ห้ามตอบวนซ้ำเรื่องอื่น):
"${userText || ''}"
${antiLoopHint ? `\n\n⚠️ สำคัญ: ${antiLoopHint}` : ''}

จงตอบคำถามด้านบนในนาม 'น้องรักษ์' ให้สุภาพและแม่นยำที่สุด:`;
}

/**
 * Rule-based fallback (ใช้เมื่อ AI ล่มหรือไม่มี GEMINI_API_KEY)
 */
function getRuleBasedReply(text, last5Messages, jobInfo) {
  const latestMsg = (text || '').toLowerCase();
  const ctx = (last5Messages || []).map((m) => `${m.sender}: ${(m.message || '').slice(0, 200)}`).join(' | ');
  const fullCtx = [text || '', ctx, jobInfo ? `Job #${jobInfo.id}: ${jobInfo.title || ''} ${jobInfo.category || ''} ${jobInfo.status || ''}` : ''].filter(Boolean).join(' ').toLowerCase();

  if (/429|rate limit|ถูกล็อก|ลองใหม่อีก|too many request/.test(fullCtx)) {
    return `สวัสดีครับ สำหรับข้อความ **429 (Rate Limit)** ระบบจำกัดจำนวนครั้งในการลองเพื่อความปลอดภัย\n\n**วิธีแก้:**\n1. รอเวลาตามที่แอปแจ้ง (มัก 1–15 นาที) แล้วลองเข้าสู่ระบบใหม่\n2. ถ้าลืมรหัสผ่าน: กด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัส\n3. ถ้ายังติดอยู่: แจ้งเบอร์โทรหรืออีเมลที่ใช้สมัครมา เราจะตรวจสอบและปลดล็อกให้\n\nหากทำตามแล้วยังไม่ได้ผล แจ้งเพิ่มได้เลยครับ เราจะดำเนินการให้จนแก้ไขสิ้นสุด`;
  }
  if (/403|forbidden|ไม่มีสิทธิ์|เข้าถึงไม่ได้|payment.*lock|เงินถูกล็อก/.test(fullCtx)) {
    return `สวัสดีครับ สำหรับข้อความ **403 (Forbidden / ไม่มีสิทธิ์)**\n\n**กรณีทั่วไป:**\n• ตรวจสอบว่าเข้าสู่ระบบแล้ว และบัญชีไม่ถูกระงับ\n• ลองออกจากระบบแล้วเข้าสู่ระบบใหม่\n\n**กรณี "เงินถูกล็อก" / ปล่อยเงินไม่ได้:**\n• ถ้ามีการยื่น Dispute งานนั้น ระบบจะล็อกเงินไว้จนกว่าแอดมินจะตัดสิน\n• รอทีมงานพิจารณา Dispute (24–48 ชม.) แล้วสถานะจะอัปเดต\n\nถ้าเป็นกรณีอื่น แจ้งรายละเอียด (เช่น หน้าที่เจอ งานที่เกี่ยวข้อง) เราจะตรวจและแก้ให้จนสิ้นสุดครับ`;
  }
  if (/ถอนเงิน|เงิน/.test(latestMsg)) return 'สำหรับเรื่องเงินและการถอน: การถอนเงินจะทำได้เมื่องานได้รับการอนุมัติและปล่อยเงินแล้วครับ คุณสามารถตรวจสอบสถานะได้ที่รายละเอียดงาน หากมี Dispute ระบบจะล็อกเงินไว้จนกว่าแอดมินจะพิจารณาครับ';
  if (/โอน|เงินไม่เข้า|ยอดไม่ขึ้น|สลิป/.test(fullCtx)) return 'ขอบคุณที่แจ้งมา ระบบได้รับข้อมูลแล้ว กรุณาส่งสลิปโอนเงินหรือหลักฐานมาด้วยนะครับ ทีมงานจะตรวจสอบให้ภายใน 1-2 วันทำการ';
  if (/รหัสผ่าน|ลืมรหัส|reset password/.test(fullCtx)) return 'คุณสามารถกด "ลืมรหัสผ่าน" ที่หน้า Login เพื่อรีเซ็ตรหัสผ่านได้ครับ';
  if (/ถอนเงิน|withdraw/.test(fullCtx)) return 'การถอนเงินจะทำได้เมื่องานได้รับการอนุมัติและปล่อยเงินแล้ว คุณสามารถตรวจสอบสถานะได้ที่รายละเอียดงานครับ';
  if (/สมัคร.*provider|provider.*สมัคร|เป็นผู้รับงาน|สมัครรับงาน/.test(fullCtx)) {
    return 'สำหรับการสมัครเป็นผู้รับงาน (Provider) ขั้นตอนเบื้องต้นมีดังนี้ครับ:\n\n1. ดาวน์โหลดแอป AQOND จาก App Store หรือ Google Play\n2. ลงทะเบียนและกรอกข้อมูลส่วนตัวให้ครบถ้วน\n3. ทำแบบทดสอบความรู้ตามหมวดงานที่สนใจ\n4. รอทีมงานตรวจสอบและอนุมัติ (โดยทั่วไป 24–48 ชม.)\n\nหากมีข้อสงสัยเพิ่มเติม แจ้งได้เลยครับ';
  }
  if (/kyc|ยืนยันตัวตน|ไม่ผ่าน/.test(fullCtx)) return 'สำหรับปัญหา KYC กรุณาตรวจสอบว่าได้อัปโหลดรูปบัตรประชาชนครบและชัดเจน หากยังไม่ผ่าน ทีมงานจะติดต่อกลับภายใน 24 ชม. ครับ';
  if (/ dispute|พิพาท|ข้อพิพาท/.test(fullCtx)) return 'เราได้รับเรื่องข้อพิพาทของคุณแล้ว ทีมงานจะพิจารณาภายใน 24-48 ชั่วโมง และจะติดต่อกลับทางแอปหรืออีเมลครับ';
  if (/สวัสดี|hello|ครับ|ค่ะ/.test(fullCtx) && fullCtx.length < 80) return 'สวัสดีครับ มีอะไรให้ช่วยไหมครับ? แจ้งปัญหาหรือคำถามได้เลยนะครับ';
  if (jobInfo && /งาน|job|เบอร์|#\d+/.test(fullCtx)) {
    const jobRef = `งาน #${jobInfo.id}`;
    if (/ทำความสะอาด|cleaning|maid/.test(fullCtx)) return `สวัสดีครับ สำหรับ${jobRef} (ทำความสะอาด) ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ`;
    if (/ซ่อม|repair|ช่าง/.test(fullCtx)) return `สวัสดีครับ สำหรับ${jobRef} (ซ่อมแซม) ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ`;
    return `สวัสดีครับ สำหรับ${jobRef} (${jobInfo.title || jobInfo.category || 'งาน'}) ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ`;
  }
  return null;
}

/**
 * getAutoReplyWithContext — RAG: ค้นหา FAQ ก่อน → เรียก Gemini AI หรือ rule-based fallback
 * @param {object} pool - PostgreSQL pool (สำหรับค้นหา faq_knowledge)
 * @param {string} userText - คำถามปัจจุบันจากลูกค้า (ให้ความสำคัญสูงสุด)
 * @param {Array} last5Messages - ประวัติ 5 ข้อความล่าสุด
 * @param {object} jobInfo - ข้อมูลงาน
 * @param {string} ticketSubject - หัวข้อ Ticket (เบื้องหลัง)
 */
const ANTI_LOOP_HINT = `คำตอบที่คุณจะส่งต้องไม่ซ้ำกับข้อความก่อนหน้าในแชทเกิน 70% — ตอบใหม่ทั้งหมดโดยใช้คำและประโยคเริ่มต้นที่แตกต่างอย่างสิ้นเชิง (เช่น เริ่มด้วย 'ครับ' หรือ 'ค่ะ' แทน 'สวัสดีครับ' หรือใช้โครงสร้างประโยคใหม่ทั้งหมด)`;

async function getAutoReplyWithContext(pool, userText, last5Messages, jobInfo, ticketSubject) {
  let faqMatch = null;
  if (pool && userText) {
    faqMatch = await searchFaq(pool, userText);
  }

  try {
    if (genAI && process.env.GEMINI_API_KEY) {
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.7,
          frequencyPenalty: 0.8,
        },
      });

      const prevTexts = (last5Messages || [])
        .filter((m) => m.sender !== 'User' && m.sender !== 'USER' && m.message)
        .map((m) => m.message)
        .slice(-3);

      const faqContext = faqMatch && faqMatch.score >= 0.4 ? faqMatch : null;
      let finalPrompt = buildFullPrompt(userText, last5Messages, jobInfo, ticketSubject, '', faqContext);
      let result = await model.generateContent(finalPrompt);
      let response = await result.response;
      let aiText = (response.text() || '').trim();

      if (aiText) {
        const overlap = getWordOverlapRatio(aiText, prevTexts);
        if (overlap > 0.7 && prevTexts.length > 0) {
          finalPrompt = buildFullPrompt(userText, last5Messages, jobInfo, ticketSubject, ANTI_LOOP_HINT, faqContext);
          result = await model.generateContent(finalPrompt);
          response = await result.response;
          const retryText = (response.text() || '').trim();
          if (retryText) aiText = retryText;
        }
        return {
          text: aiText,
          source: faqContext ? 'faq_match' : 'ai_generated',
          score: faqContext ? Math.round((faqContext.score || 0) * 100) : null,
        };
      }
    }
  } catch (error) {
    const is429 = error?.message && /429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(error.message);
    if (is429) console.error('🐯 ชัยเตือน: โควต้า Gemini เต็มแล้วครับเจ้านาย!');
    else console.error('Gemini AI Error:', error?.message);
  }

  const fallback = getRuleBasedReply(userText, last5Messages, jobInfo);
  return {
    text: fallback || 'สวัสดีครับ ขอบคุณที่ติดต่อเรา รักษ์รับเรื่องไว้แล้ว ทีมงานจะตรวจสอบและติดต่อกลับโดยเร็วครับ',
    source: 'ai_generated',
    score: null,
  };
}

export {
  RUK_SYSTEM_PROMPT,
  buildFullPrompt,
  getAutoReplyWithContext,
  getRuleBasedReply,
};
