export type {
  ReceiptBlockId,
  ReceiptConfig,
  ReceiptConfigSource,
  ReceiptDocument,
  ReceiptEngineResult,
  ReceiptLine,
  ReceiptMetadataEnvelope,
  ReceiptRenderData,
  ReceiptRenderRequest,
  ReceiptTemplateConfig,
  ReceiptTheme,
  ReceiptTypeId,
  ReceiptValidationResult,
  LoadedReceiptConfig,
} from './types';

export { MARKETPLACE_RECEIPT_TEMPLATE_ID } from './types';

export { RECEIPT_CORE_VERSION, buildMetadataEnvelope, resolveTemplateVersion } from './metadata';
export {
  ReceiptConfigError,
  validateReceiptConfig,
  isTemplateEnabled,
  getTemplate,
  assertReceiptCoreVersion,
} from './validate';
export { loadReceiptConfig, loadReceiptConfigFromObject, listTemplates, type ReceiptConfigLoadOptions } from './config';
export { composeReceiptDocument } from './template';
export { buildJarvisAuditEnvelope, jarvisAuditToRenderData } from './jarvisAudit';
export type { JarvisAuditInput, JarvisAuditResult } from './jarvisAudit';
export { renderBlock, BLOCK_RENDERERS } from './blocks';
export { renderReceiptEngine, type ReceiptEngineOptions } from './engine';
export {
  renderUnicodePdf,
  validatePdfBytes,
  validateUnicodePreserved,
  THAI_SAMPLE,
  type UnicodePdfOptions,
} from './pdf/unicodePdf';
