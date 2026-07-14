import type {
  ReceiptConfig,
  ReceiptEngineResult,
  ReceiptMetadataEnvelope,
  ReceiptRenderRequest,
  ReceiptValidationResult,
} from './types';
import { composeReceiptDocument } from './template';
import { renderUnicodePdf, THAI_SAMPLE, validatePdfBytes, validateSinglePage, validateUnicodePreserved } from './pdf/unicodePdf';
import { assertReceiptCoreVersion } from './validate';

function validateMetadataEnvelope(meta: ReceiptMetadataEnvelope): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const required: (keyof ReceiptMetadataEnvelope)[] = [
    'receipt_version',
    'template_id',
    'template_version',
    'receipt_type',
    'language',
    'currency',
    'timezone',
    'generated_at',
    'generated_by',
    'environment',
  ];
  for (const key of required) {
    const val = meta[key];
    if (val == null || val === '') errors.push(`metadata.${key} missing`);
  }
  return { ok: errors.length === 0, errors };
}

export type ReceiptEngineOptions = {
  config: ReceiptConfig;
  fontBytes: Uint8Array;
  latinFontBytes?: Uint8Array;
  logoBytes?: Uint8Array;
  environment?: string;
};

export async function renderReceiptEngine(
  options: ReceiptEngineOptions,
  request: ReceiptRenderRequest,
): Promise<ReceiptEngineResult> {
  const engineErrors: string[] = [];
  try {
    assertReceiptCoreVersion(options.config);
  } catch (e) {
    engineErrors.push(e instanceof Error ? e.message : String(e));
  }

  const data = {
    ...request.data,
    merchant: { name: request.data?.merchant?.name ?? THAI_SAMPLE, ...request.data?.merchant },
    header: {
      title: 'RECEIPT',
      receipt_number: 'AQ-ENGINE-PREVIEW-001',
      status: 'Engine Preview',
      ...request.data?.header,
    },
  };

  const document = composeReceiptDocument(
    options.config,
    request.template_id,
    data,
    {
      environment: request.environment ?? options.environment,
      generated_by: request.generated_by ?? 'AQOND',
    },
  );

  const pdf = await renderUnicodePdf(document, {
    fontBytes: options.fontBytes,
    latinFontBytes: options.latinFontBytes,
    logoBytes: options.logoBytes,
  });
  const metaVal = validateMetadataEnvelope(document.metadata);
  const pdfVal = validatePdfBytes(pdf);
  const pageVal =
    document.layout === 'marketplace' ? validateSinglePage(pdf) : { ok: true, errors: [] as string[], pages: 0 };
  const allText = document.sections.flatMap((s) => s.lines.map((l) => l.text)).join('\n');
  const thaiProbe = /[\u0E00-\u0E7F]/.test(allText) ? allText : `${THAI_SAMPLE}\n${allText}`;
  const unicodeVal = validateUnicodePreserved(thaiProbe, pdf);

  const validation: ReceiptValidationResult = {
    ok: engineErrors.length === 0 && metaVal.ok && pdfVal.ok && unicodeVal.ok && pageVal.ok,
    metadata: metaVal,
    unicode: { ...unicodeVal, sample_thai: THAI_SAMPLE },
    pdf: { ...pdfVal, byte_length: pdf.byteLength, single_page: pageVal.ok, pages: pageVal.pages },
    engine: { ok: engineErrors.length === 0, errors: [...engineErrors, ...pageVal.errors] },
  };

  return { document, pdf, validation };
}
