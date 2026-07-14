import { renderEnginePreview } from '../apps/storefront/lib/server/receiptEngine';

async function main() {
  const r = await renderEnginePreview();
  console.log(JSON.stringify({ validation: r.validation, pdfLen: r.pdf.byteLength }, null, 2));
  process.exit(r.validation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
