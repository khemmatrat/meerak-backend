/**
 * Minimal single-page PDF (Helvetica, ASCII-safe lines).
 * @deprecated B2.6-S002 — use Receipt Core (`@aqond/receipt-core`) via `/api/orders/{id}/receipt.pdf`.
 * Retained for backward compatibility reference only; do not use for new receipts.
 */
export function buildMinimalPdf(lines: string[]): Buffer {
  const esc = (s: string) =>
    s.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').slice(0, 100);

  const contentParts = ['BT', '/F1 11 Tf', '50 780 Td'];
  lines.forEach((line, i) => {
    if (i > 0) contentParts.push('0 -16 Td');
    contentParts.push(`(${esc(line)}) Tj`);
  });
  contentParts.push('ET');
  const stream = contentParts.join('\n');

  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj;
  }
  const xrefPos = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objs.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}
