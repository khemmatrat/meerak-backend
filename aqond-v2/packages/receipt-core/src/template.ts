import type { ReceiptConfig, ReceiptDocument, ReceiptRenderData, ReceiptTemplateConfig } from './types';
import { buildMetadataEnvelope } from './metadata';
import { renderBlock } from './blocks';
import { getTemplate } from './validate';

export function composeReceiptDocument(
  config: ReceiptConfig,
  templateId: string,
  data: ReceiptRenderData,
  options?: { environment?: string; generated_by?: string },
): ReceiptDocument {
  const tpl: ReceiptTemplateConfig = getTemplate(config, templateId);
  const metadata = buildMetadataEnvelope({
    template_id: templateId,
    template_version: tpl.template_version,
    receipt_type: tpl.receipt_type,
    language: tpl.language,
    currency: tpl.currency,
    timezone: tpl.timezone,
    generated_by: options?.generated_by ?? 'AQOND',
    environment: options?.environment ?? config.environment_default,
  });

  const sections = tpl.blocks.map((blockId) =>
    renderBlock(blockId, data, config.theme, config),
  );

  return {
    metadata,
    theme: config.theme,
    sections: sections.filter((s) => s.lines.length > 0),
    verify_qr_url: data.verify?.url,
    layout: tpl.receipt_type === 'R001' ? 'marketplace' : 'linear',
    render_data: data,
  };
}
