/**
 * Certified Statement PDF Generator — สร้าง PDF พร้อม QR Code สำหรับตรวจสอบ
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';

const UPLOADS_DIR = join(process.cwd(), 'uploads', 'statements');

/**
 * @param {Object} opts
 * @param {string} opts.userName - ชื่อผู้ใช้
 * @param {string} opts.periodFrom - YYYY-MM-DD
 * @param {string} opts.periodTo - YYYY-MM-DD
 * @param {string} opts.qrVerificationCode - รหัสสำหรับสแกน QR
 * @param {number} opts.feeAmount - ค่าธรรมเนียมที่หัก
 * @param {string} opts.statementId - UUID ของ statement
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateCertifiedStatementPdf(opts) {
  const { userName, periodFrom, periodTo, qrVerificationCode, feeAmount, statementId } = opts;

  const appUrl = process.env.APP_URL || 'https://app.aqond.com';
  const verifyUrl = `${appUrl}/#/verify?q=${encodeURIComponent(qrVerificationCode)}`;
  let qrBuffer;
  try {
    qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 120, margin: 1 });
  } catch {
    qrBuffer = null;
  }

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).font('Helvetica-Bold').text('ใบรับรองรายได้ (Certified Statement)', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica').text('AQOND Technology Co., Ltd.', { align: 'center' });
    doc.text('Bangkok, Thailand', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(12).font('Helvetica-Bold').text('ใบรับรองนี้ออกให้แก่', 50, doc.y);
    doc.font('Helvetica').text(userName || 'ผู้ใช้งาน', 50, doc.y + 20);
    doc.moveDown(1.5);

    doc.font('Helvetica').text(`ช่วงเวลา: ${periodFrom} ถึง ${periodTo}`, 50, doc.y);
    doc.text(`รหัสใบรับรอง: ${statementId}`, 50, doc.y + 18);
    doc.text(`ค่าธรรมเนียม: ฿${Number(feeAmount).toLocaleString()}`, 50, doc.y + 36);
    doc.moveDown(2);

    doc.fontSize(10).font('Helvetica').text('เอกสารนี้เป็นใบรับรองที่ออกโดยระบบ AQOND สำหรับใช้ประกอบการยื่นภาษี', 50, doc.y, { width: 500 });
    doc.moveDown(1);

    if (qrBuffer) {
      doc.image(qrBuffer, 50, doc.y, { width: 120, height: 120 });
      doc.fontSize(9).font('Helvetica').text('สแกน QR เพื่อตรวจสอบความถูกต้อง', 50, doc.y + 125, { width: 120, align: 'center' });
    } else {
      doc.fontSize(9).text(`Verification: ${qrVerificationCode}`, 50, doc.y);
    }
    doc.moveDown(2);

    doc.fontSize(8).text(`ออกรายงานเมื่อ: ${new Date().toLocaleString('th-TH')}`, 50, doc.y);
    doc.text(`Verification Code: ${qrVerificationCode}`, 50, doc.y + 12);

    doc.end();
  });
}

/**
 * บันทึก PDF ลงไฟล์และคืน path
 * @param {Buffer} buffer
 * @param {string} statementId
 * @returns {Promise<string>} path relative (statements/xxx.pdf)
 */
export async function saveCertifiedStatementPdf(buffer, statementId) {
  await mkdir(UPLOADS_DIR, { recursive: true });
  const filename = `stmt-${statementId}.pdf`;
  const filePath = join(UPLOADS_DIR, filename);
  await writeFile(filePath, buffer);
  return `statements/${filename}`;
}
