/**
 * Chat image anti-bypass — deterministic tests via dependency injection (no Gemini / Sharp I/O files).
 */
import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectChatUploadedImageForAntiBypass,
  getAntiBypassImageFilterMode,
} from '../lib/chatImageAntiBypass.js';

describe('getAntiBypassImageFilterMode', () => {
  const prev = process.env.ANTI_BYPASS_IMAGE_FILTER;

  afterEach(() => {
    if (prev === undefined) delete process.env.ANTI_BYPASS_IMAGE_FILTER;
    else process.env.ANTI_BYPASS_IMAGE_FILTER = prev;
  });

  test('defaults off', () => {
    delete process.env.ANTI_BYPASS_IMAGE_FILTER;
    assert.equal(getAntiBypassImageFilterMode(), 'off');
  });

  test('block literal', () => {
    process.env.ANTI_BYPASS_IMAGE_FILTER = 'block';
    assert.equal(getAntiBypassImageFilterMode(), 'block');
  });
});

describe('inspectChatUploadedImageForAntiBypass', () => {
  const prevImg = process.env.ANTI_BYPASS_IMAGE_FILTER;

  afterEach(() => {
    if (prevImg === undefined) delete process.env.ANTI_BYPASS_IMAGE_FILTER;
    else process.env.ANTI_BYPASS_IMAGE_FILTER = prevImg;
  });

  test('skips QR/OCR when image filter off', async () => {
    process.env.ANTI_BYPASS_IMAGE_FILTER = 'off';
    let ran = false;
    const r = await inspectChatUploadedImageForAntiBypass(Buffer.from('noop'), 'image/jpeg', {
      scanQr: async () => {
        ran = true;
        return { found: false };
      },
    });
    assert.equal(ran, false);
    assert.equal(r.ok, true);
    assert.equal(r.skipped, true);
  });

  test('block rejects when QR detected', async () => {
    process.env.ANTI_BYPASS_IMAGE_FILTER = 'block';
    const r = await inspectChatUploadedImageForAntiBypass(Buffer.from('x'), 'image/jpeg', {
      dbRules: [],
      scanQr: async () => ({ found: true }),
      extractOcr: async () => ({ ok: true, text: '' }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'CHAT_IMAGE_QR_REJECTED');
  });

  test('block rejects Thai mobile in OCR text (built-ins)', async () => {
    process.env.ANTI_BYPASS_IMAGE_FILTER = 'block';
    const r = await inspectChatUploadedImageForAntiBypass(Buffer.from('x'), 'image/jpeg', {
      dbRules: [],
      scanQr: async () => ({ found: false }),
      extractOcr: async () => ({ ok: true, text: 'เบอร์ 0891234567 ค่ะ' }),
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'ANTI_BYPASS_BLOCKED');
  });

  test('allows clean OCR text', async () => {
    process.env.ANTI_BYPASS_IMAGE_FILTER = 'block';
    const r = await inspectChatUploadedImageForAntiBypass(Buffer.from('x'), 'image/jpeg', {
      dbRules: [],
      scanQr: async () => ({ found: false }),
      extractOcr: async () => ({ ok: true, text: 'NO_TEXT' }),
    });
    assert.equal(r.ok, true);
  });
});
