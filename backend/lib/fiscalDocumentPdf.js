/**
 * Render issued fiscal documents to PDF (shared by tax routes + course marketplace).
 */
import PDFDocument from 'pdfkit';

const ISSUED_STATUSES = new Set(['issued', 'exported', 'credit_note_issued']);

export function isFiscalDocumentPdfReady(document) {
  return ISSUED_STATUSES.has(String(document?.status || '').toLowerCase());
}

export function fiscalDocumentPdfFilename(document) {
  const type = String(document?.document_type || 'document');
  const no = document?.document_no || document?.id || 'draft';
  return `${type}-${no}.pdf`;
}

function documentTitle(document) {
  const type = String(document?.document_type || '').toLowerCase();
  if (type === 'credit_note') return 'Credit Note / ใบลดหนี้';
  if (type === 'withholding_certificate') return 'หนังสือรับรองการหักภาษี ณ ที่จ่าย';
  if (type === 'tax_invoice') return 'Tax Invoice / ใบกำกับภาษี';
  if (type === 'receipt') return 'Receipt / ใบเสร็จรับเงิน';
  return type || 'Fiscal Document';
}

/**
 * @param {object} document — from getDocumentWithLines
 * @returns {Promise<Buffer>}
 */
export async function renderFiscalDocumentPdf(document) {
  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const seller = document.seller_snapshot || {};
  const buyer = document.buyer_snapshot || {};

  doc.fontSize(18).font('Helvetica-Bold').text(documentTitle(document), { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica');
  doc.text(`เลขที่เอกสาร / Document No: ${document.document_no || '-'}`);
  doc.text(`สถานะ / Status: ${document.status || '-'}`);
  doc.text(`วันที่ออก / Issued At: ${document.issued_at || '-'}`);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('ผู้ขาย / Seller');
  doc.font('Helvetica').fontSize(10);
  doc.text(`${seller.legal_name || 'AQOND Technology Co., Ltd.'}`);
  doc.text(`Tax ID: ${seller.tax_id || '-'}`);
  doc.text(`Branch: ${seller.branch_code || '-'} ${seller.branch_name || ''}`);
  doc.text(`Address: ${seller.registered_address || '-'}`);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('ลูกค้า / Customer');
  doc.font('Helvetica').fontSize(10);
  doc.text(`${buyer.legal_name || '-'}`);
  doc.text(`Tax ID: ${buyer.tax_id || '-'}`);
  doc.text(`Branch: ${buyer.branch_code || '-'} ${buyer.branch_name || ''}`);
  doc.text(`Address: ${buyer.registered_address || '-'}`);
  doc.moveDown();

  doc.fontSize(12).font('Helvetica-Bold').text('รายการ / Lines');
  doc.moveDown(0.25);
  (document.lines || []).forEach((line) => {
    const displayAmount = line.metadata?.display_amount;
    const amountText = Number(line.total_amount || 0) !== 0
      ? `THB ${Number(line.total_amount || 0).toFixed(2)}`
      : (displayAmount != null ? `Display THB ${Number(displayAmount || 0).toFixed(2)}` : 'THB 0.00');
    doc.fontSize(10).font('Helvetica').text(`${line.line_no}. ${line.description} - ${amountText}`);
    if (Number(line.vat_amount || 0) !== 0) {
      doc.text(`   VAT base THB ${Number(line.taxable_amount || 0).toFixed(2)} | VAT ${Number(line.vat_rate_percent || 0).toFixed(2)}% = THB ${Number(line.vat_amount || 0).toFixed(2)}`);
    }
    if (Number(line.wht_amount || 0) !== 0) {
      doc.text(`   WHT ${Number(line.wht_rate_percent || 0).toFixed(2)}% = THB ${Number(line.wht_amount || 0).toFixed(2)}`);
    }
  });

  doc.moveDown();
  doc.fontSize(11).font('Helvetica-Bold');
  doc.text(`Subtotal: THB ${Number(document.subtotal_amount || 0).toFixed(2)}`);
  doc.font('Helvetica');
  doc.text(`VAT: THB ${Number(document.vat_amount || 0).toFixed(2)}`);
  doc.text(`WHT: THB ${Number(document.wht_amount || 0).toFixed(2)}`);
  doc.fontSize(12).font('Helvetica-Bold').text(`Total: THB ${Number(document.total_amount || 0).toFixed(2)}`);
  doc.moveDown();
  doc.fontSize(8).fillColor('gray').font('Helvetica').text(
    'Generated from immutable fiscal document snapshot. ใช้ยื่นภาษีเมื่อเอกสารมีเลขที่ออกแล้วเท่านั้น.',
    { width: 500 },
  );

  doc.end();
  return done;
}

export async function pipeFiscalDocumentPdf(document, res) {
  const filename = fiscalDocumentPdfFilename(document);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const buffer = await renderFiscalDocumentPdf(document);
  res.send(buffer);
}
