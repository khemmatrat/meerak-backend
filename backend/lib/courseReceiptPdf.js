/**
 * Course order receipt / seller statement PDF (Phase 8+).
 */
import PDFDocument from 'pdfkit';

function money(value) {
  return `THB ${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function payoutLabel(receipt) {
  const status = receipt.payoutStatus || 'held';
  if (receipt.status === 'refunded') return 'Refunded';
  if (status === 'released') return `Released${receipt.payoutReleasedAt ? ` · ${formatDate(receipt.payoutReleasedAt)}` : ''}`;
  if (status === 'blocked') return 'Blocked';
  if (receipt.payoutReleaseAt) return `Held until ${formatDate(receipt.payoutReleaseAt)}`;
  return 'Held';
}

/**
 * @param {object} receipt — mapped CourseOrderReceipt shape
 * @param {{ view?: 'buyer'|'instructor'|'admin' }} opts
 * @returns {Promise<Buffer>}
 */
export async function generateCourseOrderReceiptPdf(receipt, { view = 'buyer' } = {}) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const isSellerView = view === 'instructor';
  doc.fontSize(18).font('Helvetica-Bold').text(isSellerView ? 'Seller Statement (Course)' : 'Course Purchase Receipt', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).font('Helvetica').text('AQOND Course Marketplace', { align: 'center' });
  doc.moveDown(1);

  doc.fontSize(11).font('Helvetica-Bold').text('Document');
  doc.font('Helvetica').fontSize(10);
  doc.text(`Receipt No: ${receipt.receiptNo || receipt.orderId || '-'}`);
  doc.text(`Order ID: ${receipt.orderId || receipt.id || '-'}`);
  doc.text(`Date: ${formatDate(receipt.createdAt)}`);
  doc.text(`Payment: ${receipt.gateway || 'wallet'}`);
  doc.text(`Status: ${receipt.status || 'completed'}`);
  doc.moveDown(0.75);

  doc.font('Helvetica-Bold').fontSize(11).text('Course');
  doc.font('Helvetica').fontSize(10);
  doc.text(receipt.course?.title || 'Course');
  if (receipt.course?.subtitle) doc.text(receipt.course.subtitle);
  doc.moveDown(0.75);

  doc.font('Helvetica-Bold').text('Parties');
  doc.font('Helvetica');
  doc.text(`Learner: ${receipt.buyer?.name || '-'}`);
  doc.text(`Instructor: ${receipt.instructor?.name || '-'}`);
  doc.moveDown(0.75);

  doc.font('Helvetica-Bold').text('Amounts');
  doc.font('Helvetica');
  doc.text(`Gross: ${money(receipt.grossAmount)}`);
  doc.text(`Platform fee: ${money(receipt.platformFee)}`);
  doc.text(`Instructor net: ${money(receipt.instructorNet)}`);
  if (isSellerView || view === 'admin') {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('Payout');
    doc.font('Helvetica');
    doc.text(`Payout status: ${payoutLabel(receipt)}`);
    if (receipt.payoutReleaseAt) doc.text(`Scheduled release: ${formatDate(receipt.payoutReleaseAt)}`);
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor('gray').text(
    isSellerView
      ? 'Seller statement for instructor records. Platform fee VAT documents may be issued separately per fiscal policy.'
      : 'This receipt confirms course purchase via AQOND wallet/gateway ledger. Refund policy applies per marketplace terms.',
    { width: 500 },
  );

  doc.end();
  return done;
}
