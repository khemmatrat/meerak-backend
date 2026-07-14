import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import type { ReceiptDocument, ReceiptRenderData } from '../types';
import { drawMixedText, embedReceiptFonts, type ReceiptFonts } from './fontDraw';

/** Mobile portrait receipt — 9:16 (360×640 pt). */
export const MOBILE_RECEIPT_PAGE_W = 360;
export const MOBILE_RECEIPT_PAGE_H = 640;
const MARGIN = 22;
const FOOTER_H = 92;

function parseHex(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function hr(page: PDFPage, y: number, pageW: number, color = rgb(0.82, 0.84, 0.88)) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: pageW - MARGIN, y },
    thickness: 0.6,
    color,
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** R001 — 9:16 mobile receipt layout (single page). */
export async function renderMarketplacePdf(
  document: ReceiptDocument,
  data: ReceiptRenderData,
  options: {
    fontBytes: Uint8Array;
    latinFontBytes?: Uint8Array;
    logoBytes?: Uint8Array;
    qrPng?: Uint8Array;
  },
): Promise<Uint8Array> {
  const PAGE_W = MOBILE_RECEIPT_PAGE_W;
  const PAGE_H = MOBILE_RECEIPT_PAGE_H;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const pdf = await PDFDocument.create();
  const fonts = await embedReceiptFonts(pdf, options.fontBytes, options.latinFontBytes);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const theme = document.theme;
  const primary = parseHex(theme.primary_color);
  const muted = rgb(0.5, 0.52, 0.56);
  const textDark = rgb(0.12, 0.14, 0.18);
  const textMid = rgb(0.35, 0.38, 0.42);

  const h = data.header ?? {};
  const m = data.merchant ?? {};
  const c = data.customer ?? {};
  const items = data.items ?? [];
  const t = data.totals ?? {};
  const p = data.payment ?? {};
  const d = data.delivery ?? {};
  const subtitle = data.brand?.subtitle ?? 'AQOND Marketplace';

  let y = PAGE_H - MARGIN;

  // ── Header ──
  const logoSize = 42;
  if (options.logoBytes) {
    const logo = await pdf.embedPng(options.logoBytes);
    page.drawImage(logo, { x: MARGIN, y: y - logoSize, width: logoSize, height: logoSize });
  }

  const brandX = MARGIN + logoSize + 10;
  drawMixedText(page, theme.brand_title, brandX, y - 12, 15, fonts, primary);
  drawMixedText(page, subtitle, brandX, y - 26, 8.5, fonts, textMid);
  drawMixedText(page, h.title ?? 'ใบเสร็จ / RECEIPT', brandX, y - 38, 8, fonts, muted);

  y -= logoSize + 10;
  hr(page, y, PAGE_W);
  y -= 12;

  drawMixedText(page, `Receipt  ${h.receipt_number ?? '-'}`, MARGIN, y, 7.5, fonts, textDark);
  y -= 11;
  drawMixedText(page, `Order  ${h.order_number ?? '-'}`, MARGIN, y, 7.5, fonts, textDark);
  y -= 11;
  drawMixedText(page, `Date  ${h.issue_date ?? '-'}`, MARGIN, y, 7.5, fonts, textMid);
  drawMixedText(page, `Status  ${h.status ?? '-'}`, MARGIN + 150, y, 7.5, fonts, rgb(0.1, 0.55, 0.32));
  y -= 14;
  hr(page, y, PAGE_W);
  y -= 12;

  // ── Merchant + Customer ──
  const half = MARGIN + CONTENT_W / 2;
  drawMixedText(page, 'MERCHANT', MARGIN, y, 7, fonts, muted);
  drawMixedText(page, 'CUSTOMER', half, y, 7, fonts, muted);
  y -= 11;
  drawMixedText(page, truncate(m.name ?? '-', 22), MARGIN, y, 8.5, fonts, textDark);
  drawMixedText(page, truncate(c.name ?? '-', 18), half, y, 8.5, fonts, textDark);
  y -= 11;
  drawMixedText(page, truncate(`ID ${m.merchant_id ?? '-'}`, 24), MARGIN, y, 7, fonts, textMid);
  y -= 12;
  hr(page, y, PAGE_W);
  y -= 11;

  // ── Items ──
  const colQty = PAGE_W - MARGIN - 52;
  const colAmt = PAGE_W - MARGIN - 26;
  drawMixedText(page, 'ITEMS', MARGIN, y, 7, fonts, muted);
  y -= 10;
  drawMixedText(page, 'Description', MARGIN, y, 7, fonts, rgb(0.55, 0.58, 0.62));
  drawMixedText(page, 'Qty', colQty, y, 7, fonts, rgb(0.55, 0.58, 0.62));
  drawMixedText(page, 'Amt', colAmt, y, 7, fonts, rgb(0.55, 0.58, 0.62));
  y -= 8;
  hr(page, y, PAGE_W, rgb(0.9, 0.91, 0.93));
  y -= 10;

  const itemSize = items.length > 10 ? 7.5 : 8;
  const rowH = itemSize + 4;
  const minContentY = FOOTER_H + 16;
  for (const it of items) {
    if (y < minContentY + rowH) break;
    drawMixedText(page, truncate(it.title, 30), MARGIN, y, itemSize, fonts, textDark);
    drawMixedText(page, String(it.qty), colQty + 4, y, itemSize, fonts, textDark);
    drawMixedText(page, it.amount, colAmt, y, itemSize, fonts, textDark);
    y -= rowH;
  }

  y -= 2;
  hr(page, y, PAGE_W);
  y -= 11;

  // ── Totals ──
  const totalsX = PAGE_W - MARGIN - 118;
  const totalsValX = PAGE_W - MARGIN - 42;
  const totalRows: [string, string, boolean?][] = [
    ['Subtotal', t.subtotal ?? '0.00'],
    ['Delivery', t.delivery ?? '0.00'],
    ['Discount', t.discount ?? '0.00'],
    ['VAT (7%)', t.vat ?? '0.00'],
    ['TOTAL', `${t.total ?? '0.00'} THB`, true],
  ];
  for (const [lbl, val, bold] of totalRows) {
    if (y < minContentY) break;
    const size = bold ? 10 : 8;
    const color = bold ? primary : textMid;
    drawMixedText(page, lbl, totalsX, y, size, fonts, color);
    drawMixedText(page, val, totalsValX, y, size, fonts, bold ? primary : textDark);
    y -= bold ? 14 : 11;
  }

  y -= 2;
  hr(page, y, PAGE_W);
  y -= 11;

  // ── Payment + Delivery ──
  if (y > minContentY + 40) {
    drawMixedText(page, 'PAYMENT', MARGIN, y, 7, fonts, muted);
    drawMixedText(page, 'DELIVERY', half, y, 7, fonts, muted);
    y -= 11;
    drawMixedText(page, truncate(`${p.method ?? '-'} (${p.status ?? '-'})`, 20), MARGIN, y, 8, fonts, textDark);
    drawMixedText(page, truncate(d.method ?? '-', 18), half, y, 8, fonts, textDark);
    y -= 10;
    drawMixedText(page, `Paid ${p.paid_at ?? '-'}`, MARGIN, y, 7, fonts, textMid);
    drawMixedText(page, `Fee ${d.fee ?? '0.00'}`, half, y, 7, fonts, textMid);
    y -= 8;
  }

  // ── Footer (fixed bottom band) ──
  const footerBase = FOOTER_H - 8;
  const j = data.jarvis_audit;
  if (j?.audit_id) {
    const jarvisY = FOOTER_H + 22;
    drawMixedText(page, `Jarvis ${j.audit_id}`, MARGIN, jarvisY + 10, 7, fonts, textMid);
    drawMixedText(
      page,
      `${j.integrity ?? 'Verified'} · Risk ${j.risk_score ?? '-'}`,
      MARGIN,
      jarvisY,
      6.5,
      fonts,
      textMid,
    );
  }

  hr(page, footerBase + 72, PAGE_W);

  const qrSize = 56;
  const qrX = PAGE_W - MARGIN - qrSize;
  const qrY = footerBase + 10;

  if (options.qrPng) {
    const qrImage = await pdf.embedPng(options.qrPng);
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    drawMixedText(page, 'Verify', qrX + 10, qrY - 10, 6.5, fonts, textMid);
  }

  drawMixedText(page, 'Need Help?', MARGIN, footerBase + 58, 7, fonts, textMid);
  drawMixedText(page, theme.support_email, MARGIN, footerBase + 46, 8, fonts, primary);
  drawMixedText(page, theme.support_web, MARGIN, footerBase + 34, 7, fonts, textMid);
  drawMixedText(page, theme.footer_text, MARGIN, footerBase + 14, 7.5, fonts, textDark);

  pdf.setTitle(`AQOND Receipt ${document.metadata.template_id}`);
  pdf.setSubject(JSON.stringify(document.metadata));
  pdf.setProducer('AQOND Receipt Core');
  pdf.setCreator(document.metadata.generated_by);

  return pdf.save();
}

export function countPdfPages(pdf: Uint8Array): number {
  const text = Buffer.from(pdf).toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
  if (counts.length > 0) return Math.max(...counts);
  const pages = text.match(/\/Type\s*\/Page(?!\s*s)/g);
  return pages?.length ?? 1;
}
