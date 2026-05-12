/**
 * ตรวจรูปหลักฐานงาน (ก่อน/หลัง) ด้วย Gemini Vision — NSFW, meme/การ์ตูน, ภาพไม่สมจริง
 * คืน contentSha256 ของไฟล์ภาพหลักเสมอเมื่อผ่านการดึงไฟล์และขนาดขั้นต่ำ (ใช้บันทึกใน DB)
 */
import crypto from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '..', '.env') });

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

const MIN_BYTES = 8000;

function parseJsonObject(text) {
  const raw = String(text || '').trim();
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no_json_in_response');
  return JSON.parse(m[0]);
}

async function fetchImageBuffer(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) throw new Error('invalid_image_url');
  const res = await fetch(u, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`fetch_image_${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
  return { buf, mime };
}

/**
 * @param {object} opts
 * @param {string} opts.imageUrl
 * @param {'before'|'after'} opts.phase
 * @param {string} [opts.compareUrl]
 * @param {string} [opts.jobTitle]
 * @param {string} [opts.jobCategory]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, contentSha256?: string, reasons?: string[], code?: string, details?: object, message?: string }>}
 */
export async function verifyJobProofImages(opts) {
  const {
    imageUrl,
    phase = 'before',
    compareUrl,
    jobTitle = '',
    jobCategory = '',
  } = opts || {};

  let buf;
  let mime;
  try {
    const r = await fetchImageBuffer(imageUrl);
    buf = r.buf;
    mime = r.mime;
  } catch (e) {
    return {
      ok: false,
      skipped: false,
      reasons: ['ไม่สามารถโหลดภาพจาก URL ได้'],
      code: 'fetch_failed',
    };
  }

  if (buf.length < MIN_BYTES) {
    return {
      ok: false,
      skipped: false,
      reasons: ['ไฟล์ภาพเล็กหรือไม่สมบูรณ์เกินไป'],
      code: 'image_too_small',
    };
  }

  const contentSha256 = crypto.createHash('sha256').update(buf).digest('hex');

  const visionEnabled = process.env.JOB_PROOF_VISION_ENABLED !== '0';
  if (!visionEnabled || !genAI || !process.env.GEMINI_API_KEY) {
    return {
      ok: true,
      skipped: true,
      contentSha256,
      reasons: [],
      message: 'Vision check skipped (no GEMINI_API_KEY or JOB_PROOF_VISION_ENABLED=0)',
    };
  }

  let comparePart = null;
  if (compareUrl && phase === 'after') {
    try {
      const second = await fetchImageBuffer(compareUrl);
      if (second.buf.length >= MIN_BYTES) {
        comparePart = {
          inlineData: {
            mimeType: second.mime.split(';')[0].trim() || 'image/jpeg',
            data: second.buf.toString('base64'),
          },
        };
      }
    } catch (e) {
      console.warn('jobProofVision: compareUrl fetch failed', e?.message);
    }
  }

  const modelName = process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const model = genAI.getGenerativeModel({ model: modelName });

  const prompt = `You are a strict job marketplace safety verifier. Analyze the image(s) for a service job proof photo (${phase} work).

Job context (may be empty): title="${String(jobTitle).slice(0, 200)}", category="${String(jobCategory).slice(0, 120)}".

Rules:
- Reject if: sexual/explicit adult content, graphic nudity, or strong NSFW.
- Reject if: obvious cartoon/anime meme, unrelated sticker art, or pure solid color/blank placeholder.
- Reject if: clearly a random stock photo/screenshot of unrelated content with no real-world task.
- Prefer real-world photos (phone camera) of a plausible job site.
- If TWO images are provided, the second should be "after" — they should be plausibly the same site/context as "before" (not a hard match, but flag if obviously different countries/scenes with no connection).

Return ONLY valid JSON (no markdown):
{
  "approved": boolean,
  "nsfw_level": number (0-10, 0=safe),
  "likely_cartoon_or_meme": boolean,
  "likely_unrelated_stock": boolean,
  "looks_like_real_world_photo": boolean,
  "pairing_ok": boolean | null,
  "reasons": string[] (short, English)
}`;

  const parts = [
    { text: prompt },
    {
      inlineData: {
        mimeType: mime.split(';')[0].trim() || 'image/jpeg',
        data: buf.toString('base64'),
      },
    },
  ];
  if (comparePart) {
    parts.push({ text: 'Second image (before / reference):' });
    parts.push(comparePart);
  }

  const result = await model.generateContent(parts);
  const outText = (await result.response.text()).trim();
  let parsed;
  try {
    parsed = parseJsonObject(outText);
  } catch (e) {
    console.warn('jobProofVision: JSON parse failed', outText?.slice(0, 200));
    return {
      ok: false,
      skipped: false,
      contentSha256,
      reasons: ['ไม่สามารถประเมินภาพอัตโนมัติได้ กรุณาลองใหม่'],
      code: 'vision_parse_error',
    };
  }

  const nsfw = Number(parsed.nsfw_level) || 0;
  const approved =
    parsed.approved === true &&
    nsfw <= 4 &&
    !parsed.likely_cartoon_or_meme &&
    !parsed.likely_unrelated_stock &&
    parsed.looks_like_real_world_photo !== false;

  let pairingOk = true;
  if (comparePart && parsed.pairing_ok === false) {
    pairingOk = false;
  }

  const finalOk = approved && pairingOk;
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];

  if (!finalOk) {
    return {
      ok: false,
      skipped: false,
      contentSha256,
      reasons: reasons.length ? reasons : ['ภาพไม่ผ่านการตรวจสอบอัตโนมัติ'],
      code: 'vision_rejected',
      details: {
        nsfw_level: nsfw,
        likely_cartoon_or_meme: !!parsed.likely_cartoon_or_meme,
        likely_unrelated_stock: !!parsed.likely_unrelated_stock,
        pairing_ok: parsed.pairing_ok,
      },
    };
  }

  return {
    ok: true,
    skipped: false,
    contentSha256,
    reasons: [],
    details: {
      nsfw_level: nsfw,
      looks_like_real_world_photo: parsed.looks_like_real_world_photo !== false,
    },
  };
}
