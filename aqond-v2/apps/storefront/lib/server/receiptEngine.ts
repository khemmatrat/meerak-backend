import fs from 'node:fs';
import path from 'node:path';
import {
  loadReceiptConfig,
  listTemplates,
  renderReceiptEngine,
  RECEIPT_CORE_VERSION,
  MARKETPLACE_RECEIPT_TEMPLATE_ID,
} from '@aqond/receipt-core';
import type { OrderDetail } from '@/lib/server/orderDetail';
import { buildMarketplaceReceiptData } from '@/lib/server/marketplaceReceipt';
import { buildSignedReceiptVerifyUrl } from '@/lib/server/receiptVerify';

const localDevPath = path.join(process.cwd(), '.data', 'dev', 'receipt-config.json');

function readFile(p: string) {
  return fs.readFileSync(p, 'utf8');
}

function exists(p: string) {
  return fs.existsSync(p);
}

function resolveFontPath(filename: string): string {
  const candidates = [
    process.env.RECEIPT_FONT_PATH && filename.includes('Thai') ? process.env.RECEIPT_FONT_PATH : null,
    path.join(process.cwd(), 'node_modules', '@aqond', 'receipt-core', 'assets', 'fonts', filename),
    path.join(process.cwd(), '..', '..', 'packages', 'receipt-core', 'assets', 'fonts', filename),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(`Receipt Core font not found (${filename})`);
}

export function receiptFontBytes(): Uint8Array {
  return new Uint8Array(fs.readFileSync(resolveFontPath('NotoSansThai-Regular.ttf')));
}

export function receiptLatinFontBytes(): Uint8Array {
  return new Uint8Array(fs.readFileSync(resolveFontPath('NotoSans-Regular.ttf')));
}

function resolveAssetPath(...parts: string[]): string {
  const candidates = [
    path.join(process.cwd(), 'node_modules', '@aqond', 'receipt-core', 'assets', ...parts),
    path.join(process.cwd(), '..', '..', 'packages', 'receipt-core', 'assets', ...parts),
  ];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(`Receipt Core asset not found (${parts.join('/')})`);
}

export function receiptLogoBytes(): Uint8Array {
  const optimized = resolveAssetPath('images', 'aqond-logo-receipt.png');
  if (exists(optimized)) return new Uint8Array(fs.readFileSync(optimized));
  return new Uint8Array(fs.readFileSync(resolveAssetPath('images', 'aqond-logo.png')));
}

export function loadServerReceiptConfig() {
  const localDev = process.env.AQOND_LOCAL_DEV === '1' || process.env.NODE_ENV === 'development';
  return loadReceiptConfig({
    envJson: process.env.RECEIPT_CONFIG_JSON,
    envPath: process.env.RECEIPT_CONFIG_PATH,
    localDev,
    localDevPath,
    readFile,
    exists,
  });
}

export async function renderEnginePreview(environment?: string) {
  const loaded = loadServerReceiptConfig();
  const fontBytes = receiptFontBytes();
  const latinFontBytes = receiptLatinFontBytes();
  const logoBytes = receiptLogoBytes();
  const result = await renderReceiptEngine(
    { config: loaded.config, fontBytes, latinFontBytes, logoBytes, environment },
    {
      template_id: 'engine-preview-v1',
      environment: environment ?? loaded.config.environment_default,
      generated_by: 'AQOND',
    },
  );

  return {
    core: 'receipt-core',
    mission: 'RECEIPT-CORE',
    scenario: 'B2.6-S001',
    receipt_core_version: RECEIPT_CORE_VERSION,
    config_source: loaded.source,
    templates: listTemplates(loaded.config),
    metadata: result.document.metadata,
    theme: result.document.theme,
    block_count: result.document.sections.length,
    validation: result.validation,
    pdf_byte_length: result.pdf.byteLength,
    pdf: result.pdf,
  };
}

export async function renderMarketplaceOrderReceipt(
  order: OrderDetail,
  options?: { baseUrl?: string; environment?: string },
) {
  const loaded = loadServerReceiptConfig();
  const fontBytes = receiptFontBytes();
  const latinFontBytes = receiptLatinFontBytes();
  const logoBytes = receiptLogoBytes();
  const baseUrl =
    options?.baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.STOREFRONT_INTERNAL_URL ||
    'http://127.0.0.1:3003';
  const verifyUrl = buildSignedReceiptVerifyUrl(order.order_id, baseUrl, order.buyer_id);
  const data = buildMarketplaceReceiptData(order, verifyUrl);

  const result = await renderReceiptEngine(
    { config: loaded.config, fontBytes, latinFontBytes, logoBytes, environment: options?.environment },
    {
      template_id: MARKETPLACE_RECEIPT_TEMPLATE_ID,
      environment: options?.environment ?? loaded.config.environment_default,
      generated_by: 'AQOND',
      data,
    },
  );

  return {
    core: 'receipt-core',
    mission: 'RECEIPT-CORE',
    scenario: 'B2.6-S002',
    receipt_core_version: RECEIPT_CORE_VERSION,
    config_source: loaded.source,
    template_id: MARKETPLACE_RECEIPT_TEMPLATE_ID,
    receipt_type: 'R001',
    verify_url: verifyUrl,
    jarvis_audit_id: data.jarvis_audit?.audit_id,
    metadata: result.document.metadata,
    validation: result.validation,
    pdf_byte_length: result.pdf.byteLength,
    pdf: result.pdf,
  };
}
