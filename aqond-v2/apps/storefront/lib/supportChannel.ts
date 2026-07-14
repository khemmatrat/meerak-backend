/** Support channel codes — visible in nexus-admin Support Admin `source` field. */
export type SupportChannelCode =
  | 'MKP' // marketplace buyer / shop chat
  | 'FMC' // food merchant / food order
  | 'RID' // rider / delivery job
  | 'MCH' // merchant seller back-office
  | 'SYS' // platform / general help
  | 'DSP'; // dispute escalation

export type SupportChannelContext = {
  channel: SupportChannelCode;
  userId: string;
  subject: string;
  message: string;
  category?: 'Billing' | 'Technical' | 'Account' | 'General';
  email?: string;
  full_name?: string;
  phone?: string;
  order_id?: string;
  merchant_id?: string;
  shop_id?: string;
  job_id?: string;
};

const CHANNEL_LABELS: Record<SupportChannelCode, string> = {
  MKP: 'Marketplace',
  FMC: 'Food',
  RID: 'Rider',
  MCH: 'Merchant',
  SYS: 'Platform',
  DSP: 'Dispute',
};

export function supportChannelLabel(code: SupportChannelCode): string {
  return CHANNEL_LABELS[code] || code;
}

export function formatSupportSubject(channel: SupportChannelCode, subject: string): string {
  const clean = subject.trim();
  if (clean.startsWith(`[${channel}]`)) return clean;
  return `[${channel}] ${clean}`;
}

export function parseSupportChannel(raw: string | null | undefined): SupportChannelCode {
  const v = String(raw || 'MKP').toUpperCase();
  if (v === 'FMC' || v === 'RID' || v === 'MCH' || v === 'SYS' || v === 'DSP') return v;
  return 'MKP';
}

export function inferOrderChannel(order: {
  order_type?: string;
  merchant_id?: string;
  carrier_id?: string;
}): SupportChannelCode {
  if (order.order_type === 'food' || String(order.merchant_id || '').startsWith('food-')) {
    return 'FMC';
  }
  if (order.carrier_id === 'aqond-rider') return 'RID';
  return 'MKP';
}
