/**
 * PR-3 — Chat image upload: QR reject + OCR + anti-bypass rules (scope image_ocr).
 * Only runs when ANTI_BYPASS_IMAGE_FILTER=block; otherwise skipped (parity).
 */

import sharp from 'sharp';
import jsQR from 'jsqr';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { evaluateAntiBypassText } from './antiBypassTextFilter.js';
import { recordAntiBypassReasons } from './antiBypassTelemetry.js';

const MAX_QR_DECODE_EDGE = 920;

export function getAntiBypassImageFilterMode() {
  const v = String(process.env.ANTI_BYPASS_IMAGE_FILTER || 'off').toLowerCase();
  return v === 'block' ? 'block' : 'off';
}

/**
 * @param {Buffer} imageBuffer
 * @returns {Promise<{ found: boolean }>}
 */
export async function scanImageBufferForQrSharp(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize({
        width: MAX_QR_DECODE_EDGE,
        height: MAX_QR_DECODE_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = info.width;
    const h = info.height;
    const clamped = new Uint8ClampedArray(
      data.buffer,
      data.byteOffset,
      data.byteLength,
    );
    const code = jsQR(clamped, w, h, { inversionAttempts: 'attemptBoth' });
    return { found: !!code };
  } catch {
    return { found: false };
  }
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} mimeType
 * @returns {Promise<{ ok: boolean, text?: string, unavailable?: boolean }>}
 */
export async function extractChatImageOcrTextGemini(imageBuffer, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return { ok: false, unavailable: true, text: '' };
  }
  try {
    const genAI = new GoogleGenerativeAI(key);
    const modelName =
      process.env.CHAT_IMAGE_OCR_MODEL ||
      process.env.GEMINI_VISION_MODEL ||
      process.env.GEMINI_MODEL ||
      'gemini-2.0-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `Extract visible text from this image for a safety filter. Return PLAIN TEXT ONLY (no JSON, no markdown).
If you see no readable text, answer exactly: NO_TEXT
Transcribe phone numbers, URLs, social handles, and labels. Do not describe the scene.`;
    const mt = String(mimeType || 'image/jpeg').split(';')[0].trim() || 'image/jpeg';
    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mt,
          data: imageBuffer.toString('base64'),
        },
      },
    ]);
    const text = result.response.text();
    return { ok: true, text: String(text || '').trim() };
  } catch {
    return { ok: false, unavailable: true, text: '' };
  }
}

/**
 * @param {Buffer} imageBuffer
 * @param {string} [mimeType]
 * @param {{ dbRules?: any[], scanQr?: Function, extractOcr?: Function }} [opts]
 */
export async function inspectChatUploadedImageForAntiBypass(
  imageBuffer,
  mimeType = 'image/jpeg',
  opts = {},
) {
  const mode = getAntiBypassImageFilterMode();
  if (mode !== 'block') {
    return { ok: true, skipped: true };
  }

  const scanQr = opts.scanQr ?? scanImageBufferForQrSharp;
  const qr = await scanQr(imageBuffer);
  if (qr.found) {
    recordAntiBypassReasons('image_ocr', ['chat_image_qr']);
    return {
      ok: false,
      status: 403,
      error: 'ไม่อนุญาตให้อัปโหลดรูปที่มี QR code ในแชท',
      code: 'CHAT_IMAGE_QR_REJECTED',
    };
  }

  const extractOcr = opts.extractOcr ?? extractChatImageOcrTextGemini;
  const ocr = await extractOcr(imageBuffer, mimeType);
  const failOpen =
    String(process.env.CHAT_IMAGE_OCR_FAIL_OPEN || '').toLowerCase() === '1';

  if (!ocr.ok && ocr.unavailable) {
    if (failOpen) {
      return { ok: true, skipped: true, ocr_skipped: true };
    }
    return {
      ok: false,
      status: 503,
      error: 'ระบบตรวจข้อความในรูปชั่วคราวไม่พร้อม',
      code: 'CHAT_IMAGE_OCR_UNAVAILABLE',
    };
  }

  const ocrText = ocr.text || '';
  const dbRules = Array.isArray(opts.dbRules) ? opts.dbRules : [];

  const evalResult = evaluateAntiBypassText(ocrText, {
    filterMode: 'block',
    scope: 'image_ocr',
    dbRules,
  });

  if (evalResult.blocked) {
    recordAntiBypassReasons('image_ocr', evalResult.reasons);
    return {
      ok: false,
      status: 403,
      error: 'ข้อความในรูปไม่ผ่านการตรวจสอบความปลอดภัย',
      code: evalResult.code || 'ANTI_BYPASS_BLOCKED',
      reasons: evalResult.reasons,
      matchedMasked: evalResult.matchedMasked,
    };
  }

  return { ok: true };
}
