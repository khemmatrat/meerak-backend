import type { ReceiptBlockId, ReceiptConfig, ReceiptTemplateConfig } from './types';
import { RECEIPT_CORE_VERSION } from './metadata';

export class ReceiptConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptConfigError';
  }
}

const ALL_BLOCKS: ReceiptBlockId[] = [
  'header',
  'brand',
  'merchant',
  'customer',
  'items',
  'totals',
  'payment',
  'delivery',
  'wallet',
  'verify',
  'jarvis_audit',
  'footer',
];

export function validateReceiptConfig(raw: unknown): ReceiptConfig {
  if (!raw || typeof raw !== 'object') {
    throw new ReceiptConfigError('config must be an object');
  }
  const cfg = raw as Record<string, unknown>;
  if (cfg.schema_version !== 1) {
    throw new ReceiptConfigError('schema_version must be 1');
  }
  if (typeof cfg.receipt_core_version !== 'string' || !cfg.receipt_core_version) {
    throw new ReceiptConfigError('receipt_core_version required');
  }
  if (!cfg.theme || typeof cfg.theme !== 'object') {
    throw new ReceiptConfigError('theme required');
  }
  if (!cfg.blocks || typeof cfg.blocks !== 'object') {
    throw new ReceiptConfigError('blocks required');
  }
  if (!cfg.templates || typeof cfg.templates !== 'object') {
    throw new ReceiptConfigError('templates required');
  }

  const theme = cfg.theme as Record<string, unknown>;
  for (const key of ['id', 'brand_title', 'tagline', 'primary_color', 'footer_text'] as const) {
    if (typeof theme[key] !== 'string' || !theme[key]) {
      throw new ReceiptConfigError(`theme.${key} required`);
    }
  }

  const blocks = cfg.blocks as Record<string, { enabled?: boolean }>;
  for (const blockId of ALL_BLOCKS) {
    if (typeof blocks[blockId]?.enabled !== 'boolean') {
      throw new ReceiptConfigError(`blocks.${blockId}.enabled must be boolean`);
    }
  }

  const templates = cfg.templates as Record<string, ReceiptTemplateConfig>;
  for (const [id, tpl] of Object.entries(templates)) {
    if (!tpl || typeof tpl !== 'object') {
      throw new ReceiptConfigError(`templates.${id} invalid`);
    }
    if (typeof tpl.enabled !== 'boolean') {
      throw new ReceiptConfigError(`templates.${id}.enabled must be boolean`);
    }
    if (!Array.isArray(tpl.blocks) || tpl.blocks.length === 0) {
      throw new ReceiptConfigError(`templates.${id}.blocks must be non-empty`);
    }
    for (const b of tpl.blocks) {
      if (!ALL_BLOCKS.includes(b)) {
        throw new ReceiptConfigError(`templates.${id} unknown block ${String(b)}`);
      }
      if (!blocks[b]?.enabled) {
        throw new ReceiptConfigError(`templates.${id} references disabled block ${b}`);
      }
    }
  }

  return cfg as unknown as ReceiptConfig;
}

export function isTemplateEnabled(config: ReceiptConfig, templateId: string): boolean {
  return Boolean(config.templates[templateId]?.enabled);
}

export function getTemplate(config: ReceiptConfig, templateId: string): ReceiptTemplateConfig {
  const tpl = config.templates[templateId];
  if (!tpl) {
    throw new ReceiptConfigError(`unknown template: ${templateId}`);
  }
  if (!tpl.enabled) {
    throw new ReceiptConfigError(`template disabled: ${templateId}`);
  }
  return tpl;
}

export function assertReceiptCoreVersion(config: ReceiptConfig): void {
  if (config.receipt_core_version !== RECEIPT_CORE_VERSION) {
    throw new ReceiptConfigError(
      `receipt_core_version mismatch: expected ${RECEIPT_CORE_VERSION}, got ${config.receipt_core_version}`,
    );
  }
}
