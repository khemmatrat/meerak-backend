import type { ReceiptMetadataEnvelope } from './types';

export const RECEIPT_CORE_VERSION = '1.0.0';

export type BuildMetadataInput = {
  template_id: string;
  template_version: string;
  receipt_type: string;
  language: string;
  currency: string;
  timezone: string;
  generated_by?: string;
  environment?: string;
  generated_at?: string;
};

export function buildMetadataEnvelope(input: BuildMetadataInput): ReceiptMetadataEnvelope {
  return {
    receipt_version: RECEIPT_CORE_VERSION,
    template_id: input.template_id,
    template_version: input.template_version,
    receipt_type: input.receipt_type,
    language: input.language,
    currency: input.currency,
    timezone: input.timezone,
    generated_at: input.generated_at ?? new Date().toISOString(),
    generated_by: input.generated_by ?? 'AQOND',
    environment: input.environment ?? 'production',
  };
}

export function resolveTemplateVersion(
  templates: Record<string, { template_version: string }>,
  templateId: string,
): string {
  return templates[templateId]?.template_version ?? '0.0.0';
}
