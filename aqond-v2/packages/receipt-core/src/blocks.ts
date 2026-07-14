import type {
  ReceiptBlockId,
  ReceiptBlockSection,
  ReceiptConfig,
  ReceiptLine,
  ReceiptRenderData,
  ReceiptTheme,
} from './types';

export type BlockRenderer = (
  data: ReceiptRenderData,
  theme: ReceiptTheme,
  config: ReceiptConfig,
) => ReceiptLine[];

function divider(): ReceiptLine {
  return { text: '-------------------------------' };
}

function blockHeader(data: ReceiptRenderData): ReceiptLine[] {
  const h = data.header ?? {};
  const lines: ReceiptLine[] = [
    { text: h.title ?? 'RECEIPT', style: { bold: true, size: 14 } },
    { text: '' },
  ];
  if (h.receipt_number) {
    lines.push({ text: 'Receipt Number' });
    lines.push({ text: h.receipt_number, style: { bold: true } });
  }
  if (h.issue_date) {
    lines.push({ text: 'Issue Date' });
    lines.push({ text: h.issue_date });
  }
  if (h.order_number) {
    lines.push({ text: 'Order Number' });
    lines.push({ text: h.order_number, style: { bold: true } });
  } else if (h.receipt_number) {
    lines.push({ text: 'Order' });
    lines.push({ text: h.receipt_number, style: { bold: true } });
  }
  if (h.status) {
    lines.push({ text: h.status, style: { size: 10 } });
  }
  lines.push(divider());
  return lines;
}

function blockBrand(data: ReceiptRenderData, theme: ReceiptTheme): ReceiptLine[] {
  const subtitle = data.brand?.subtitle ?? theme.tagline;
  return [
    { text: theme.brand_title, style: { bold: true, size: 16, color: theme.primary_color } },
    { text: subtitle, style: { size: 10 } },
  ];
}

function blockMerchant(data: ReceiptRenderData): ReceiptLine[] {
  const m = data.merchant ?? {};
  return [
    { text: 'Merchant', style: { bold: true } },
    { text: m.name ?? 'ร้านตัวอย่าง AQOND' },
    { text: 'Merchant ID' },
    { text: m.merchant_id ?? 'AQM-PREVIEW' },
    divider(),
  ];
}

function blockCustomer(data: ReceiptRenderData): ReceiptLine[] {
  const c = data.customer ?? {};
  return [
    { text: 'Customer', style: { bold: true } },
    { text: c.name ?? 'ลูกค้าตัวอย่าง' },
    divider(),
  ];
}

function blockItems(data: ReceiptRenderData): ReceiptLine[] {
  const items = data.items ?? [
    { title: 'สินค้าตัวอย่าง', qty: 1, amount: '199.00' },
    { title: 'Sample Product EN', qty: 2, amount: '398.00' },
  ];
  const lines: ReceiptLine[] = [{ text: 'Items', style: { bold: true } }];
  for (const it of items) {
    lines.push({ text: `${it.title}  x${it.qty}  ${it.amount}` });
  }
  lines.push(divider());
  return lines;
}

function blockTotals(data: ReceiptRenderData): ReceiptLine[] {
  const t = data.totals ?? {
    subtotal: '597.00',
    delivery: '45.00',
    discount: '-50.00',
    vat: '41.79',
    total: '633.79',
  };
  return [
    { text: `Subtotal              ${t.subtotal ?? '0.00'}` },
    { text: `Delivery               ${t.delivery ?? '0.00'}` },
    { text: `Discount              ${t.discount ?? '0.00'}` },
    { text: `VAT (7%)               ${t.vat ?? '0.00'}` },
    { text: `Total                 ${t.total ?? '0.00'} THB`, style: { bold: true } },
    divider(),
  ];
}

function blockPayment(data: ReceiptRenderData): ReceiptLine[] {
  const p = data.payment ?? {
    method: 'PromptPay',
    status: 'Preview',
    reference: 'PP-ENGINE-PREVIEW',
    paid_at: '2026-07-02 09:41',
  };
  return [
    { text: p.method ?? 'Payment', style: { bold: true } },
    { text: p.status ?? '-' },
    { text: 'Reference' },
    { text: p.reference ?? '-' },
    { text: 'Paid At' },
    { text: p.paid_at ?? '-' },
    divider(),
  ];
}

function blockDelivery(data: ReceiptRenderData): ReceiptLine[] {
  const d = data.delivery ?? { method: 'Local Delivery (preview)', fee: '45.00' };
  return [
    { text: 'Delivery', style: { bold: true } },
    { text: d.method ?? '-' },
    { text: `Fee                    ${d.fee ?? '0.00'}` },
    divider(),
  ];
}

function blockWallet(data: ReceiptRenderData): ReceiptLine[] {
  const w = data.wallet ?? { balance: '0.00' };
  return [
    { text: 'Wallet', style: { bold: true } },
    { text: `Balance               ${w.balance ?? '0.00'} THB` },
    divider(),
  ];
}

function blockVerify(data: ReceiptRenderData): ReceiptLine[] {
  const v = data.verify ?? {};
  const lines: ReceiptLine[] = [{ text: 'Verify Receipt', style: { bold: true } }];
  if (v.url) lines.push({ text: v.url, style: { size: 8 } });
  return lines;
}

function blockJarvisAudit(data: ReceiptRenderData): ReceiptLine[] {
  const j = data.jarvis_audit;
  if (!j?.audit_id) return [];
  return [
    { text: 'Jarvis Audit', style: { bold: true, size: 8 } },
    { text: `ID ${j.audit_id} · ${j.integrity ?? 'Verified'}`, style: { size: 7.5 } },
    { text: `Risk ${j.risk_score ?? '-'} · ${j.fraud ?? 'None'}`, style: { size: 7.5 } },
  ];
}

function blockFooter(_data: ReceiptRenderData, theme: ReceiptTheme): ReceiptLine[] {
  return [
    { text: 'Need Help?' },
    { text: `support@${theme.support_web.replace(/^www\./, '')}` },
    { text: theme.support_web },
    { text: '' },
    { text: theme.footer_text, style: { bold: true } },
  ];
}

export const BLOCK_RENDERERS: Record<ReceiptBlockId, BlockRenderer> = {
  header: blockHeader,
  brand: (data, theme) => blockBrand(data, theme),
  merchant: blockMerchant,
  customer: blockCustomer,
  items: blockItems,
  totals: blockTotals,
  payment: blockPayment,
  delivery: blockDelivery,
  wallet: blockWallet,
  verify: (data) => blockVerify(data),
  jarvis_audit: (data) => blockJarvisAudit(data),
  footer: (_d, theme) => blockFooter(_d, theme),
};

export function renderBlock(
  blockId: ReceiptBlockId,
  data: ReceiptRenderData,
  theme: ReceiptTheme,
  config: ReceiptConfig,
): ReceiptBlockSection {
  if (!config.blocks[blockId]?.enabled) {
    return { block_id: blockId, lines: [] };
  }
  const renderer = BLOCK_RENDERERS[blockId];
  return { block_id: blockId, lines: renderer(data, theme, config) };
}
