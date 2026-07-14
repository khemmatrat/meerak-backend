import { PDFDocument, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import type { ReceiptDocument } from '../types';
import { drawMixedText, embedReceiptFonts } from './fontDraw';
import { countPdfPages, renderMarketplacePdf } from './marketplacePdf';

export type UnicodePdfOptions = {
  fontBytes: Uint8Array;
  latinFontBytes?: Uint8Array;
  logoBytes?: Uint8Array;
  pageWidth?: number;
  pageHeight?: number;
};

/** Unicode-safe PDF renderer — marketplace layout or linear fallback. */
export async function renderUnicodePdf(
  document: ReceiptDocument,
  options: UnicodePdfOptions,
): Promise<Uint8Array> {
  if (document.layout === 'marketplace' && document.render_data) {
    let qrPng: Uint8Array | undefined;
    if (document.verify_qr_url) {
      qrPng = await QRCode.toBuffer(document.verify_qr_url, {
        type: 'png',
        margin: 1,
        width: 140,
        errorCorrectionLevel: 'M',
      });
    }
    return renderMarketplacePdf(document, document.render_data, {
      fontBytes: options.fontBytes,
      latinFontBytes: options.latinFontBytes,
      logoBytes: options.logoBytes,
      qrPng,
    });
  }

  const pdf = await PDFDocument.create();
  const fonts = await embedReceiptFonts(pdf, options.fontBytes, options.latinFontBytes);
  const pageW = options.pageWidth ?? 595;
  const pageH = options.pageHeight ?? 842;

  let page = pdf.addPage([pageW, pageH]);
  let y = 800;

  for (const section of document.sections) {
    for (const line of section.lines) {
      const size = line.style?.size ?? 11;
      if (y < 60) {
        page = pdf.addPage([pageW, pageH]);
        y = 800;
      }
      const color = rgb(0.1, 0.1, 0.1);
      if (line.text) {
        drawMixedText(page, line.text, 50, y, size, fonts, color);
      }
      y -= size + 6;
    }
  }

  if (document.verify_qr_url) {
    const qrPng = await QRCode.toBuffer(document.verify_qr_url, {
      type: 'png',
      margin: 1,
      width: 120,
      errorCorrectionLevel: 'M',
    });
    const qrImage = await pdf.embedPng(qrPng);
    if (y < 140) {
      page = pdf.addPage([pageW, pageH]);
      y = 800;
    }
    page.drawImage(qrImage, { x: 50, y: y - 120, width: 100, height: 100 });
  }

  pdf.setTitle(`AQOND Receipt ${document.metadata.template_id}`);
  pdf.setSubject(JSON.stringify(document.metadata));
  pdf.setProducer('AQOND Receipt Core');
  pdf.setCreator(document.metadata.generated_by);

  return pdf.save();
}

export function validatePdfBytes(pdf: Uint8Array): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (pdf.byteLength < 100) errors.push('pdf too small');
  const head = Buffer.from(pdf.slice(0, 8)).toString('ascii');
  if (!head.startsWith('%PDF')) errors.push('missing PDF magic');
  const tail = Buffer.from(pdf.slice(-32)).toString('ascii');
  if (!tail.includes('%%EOF')) errors.push('missing EOF marker');
  return { ok: errors.length === 0, errors };
}

export function validateSinglePage(pdf: Uint8Array): { ok: boolean; errors: string[]; pages: number } {
  const pages = countPdfPages(pdf);
  const errors: string[] = [];
  if (pages !== 1) errors.push(`expected 1 page, got ${pages}`);
  return { ok: errors.length === 0, errors, pages };
}

export const THAI_SAMPLE = 'กรุงเทพมหานคร';

export function validateUnicodePreserved(text: string, pdf: Uint8Array): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/[\u0E00-\u0E7F]/.test(line) && /\?{2,}/.test(line)) {
      errors.push('thai line shows replacement question marks');
    }
  }
  const ascii = Buffer.from(pdf).toString('latin1');
  if (ascii.includes('?????')) {
    errors.push('pdf contains question-mark replacement');
  }
  return { ok: errors.length === 0, errors };
}
