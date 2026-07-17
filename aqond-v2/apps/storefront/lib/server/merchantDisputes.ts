import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { DisputeCategory, DisputeOrderType, DisputeStatus } from '@/lib/disputePolicy';

const DISPUTES_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-disputes.json');

export type DisputeItemLine = {
  product_id: string;
  title: string;
  qty: number;
  unit_price_micro: number;
  received?: boolean;
};

export type DisputeTimelineEvent = {
  at: string;
  actor: 'customer' | 'merchant' | 'admin' | 'system';
  action: string;
  note?: string;
};

export type MerchantDisputeCase = {
  id: string;
  order_id: string;
  merchant_id: string;
  customer_id: string;
  order_type: DisputeOrderType;
  category: DisputeCategory;
  status: DisputeStatus;
  title: string;
  description: string;
  evidence_note?: string;
  items: DisputeItemLine[];
  order_total_micro: number;
  held_amount_micro: number;
  refund_amount_micro: number;
  charge_amount_micro: number;
  merchant_response?: string;
  resolution_note?: string;
  mutual_agreement: boolean;
  timeline: DisputeTimelineEvent[];
  replacement_order_id?: string;
  redispatch_job_id?: string;
  created_at: string;
  updated_at: string;
};

type Store = { cases: MerchantDisputeCase[] };

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(DISPUTES_FILE, 'utf8'));
  } catch {
    return { cases: seedCases() };
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(DISPUTES_FILE), { recursive: true });
  await fs.writeFile(DISPUTES_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function seedCases(): MerchantDisputeCase[] {
  const now = new Date().toISOString();
  const tl = (steps: Omit<DisputeTimelineEvent, 'at'>[]) =>
    steps.map((s, i) => ({ ...s, at: new Date(Date.now() - (steps.length - i) * 3600000).toISOString() }));

  return [
    {
      id: 'dsp-demo-001',
      order_id: 'ord-fashion-001',
      merchant_id: 'm-fashion-1',
      customer_id: 'guest',
      order_type: 'marketplace',
      category: 'not_as_described',
      status: 'awaiting_merchant',
      title: 'เสื้อไม่ตรงสีตามรูป',
      description: 'สั่งสีดำ ได้สี navy เข้มกว่าในรูปมาก',
      evidence_note: 'แนบรูปเปรียบเทียบ 3 รูป',
      items: [{ product_id: 'sku-top-1', title: 'เสื้อยืด Premium', qty: 1, unit_price_micro: 89000, received: true }],
      order_total_micro: 89000,
      held_amount_micro: 89000,
      refund_amount_micro: 89000,
      charge_amount_micro: 0,
      mutual_agreement: false,
      timeline: tl([
        { actor: 'customer', action: 'filed', note: 'ลูกค้าแจ้งไม่ตรงปก' },
        { actor: 'system', action: 'escrow_hold', note: 'พักเงิน ฿890' },
      ]),
      created_at: now,
      updated_at: now,
    },
    {
      id: 'dsp-food-001',
      order_id: '4542a748',
      merchant_id: 'food-jp-1',
      customer_id: 'guest',
      order_type: 'food',
      category: 'missing_items',
      status: 'under_review',
      title: 'ขาดซาชิมิ 2 ชิ้น',
      description: 'สั่งเซ็ต 12 ชิ้น ได้มา 10 ชิ้น',
      evidence_note: 'คลิป unboxing 30 วินาที',
      items: [
        { product_id: 'dish-sushi-set', title: 'เซ็ตซูชิ 12 ชิ้น', qty: 1, unit_price_micro: 24900, received: true },
        { product_id: 'dish-salmon', title: 'ซาชิมิแซลมอน (ขาด)', qty: 2, unit_price_micro: 9450, received: false },
      ],
      order_total_micro: 24900,
      held_amount_micro: 24900,
      refund_amount_micro: 18900,
      charge_amount_micro: 0,
      mutual_agreement: false,
      timeline: tl([
        { actor: 'customer', action: 'filed', note: 'แจ้งของไม่ครบ + แนบคลิป' },
        { actor: 'system', action: 'escrow_hold', note: 'พักเงินออเดอร์' },
        { actor: 'admin', action: 'review_clip', note: 'ทีมตรวจสอบคลิป' },
      ]),
      created_at: now,
      updated_at: now,
    },
  ];
}

export async function appendDisputeTimeline(
  caseId: string,
  actor: DisputeTimelineEvent['actor'],
  action: string,
  note?: string,
) {
  const store = await readStore();
  const hit = store.cases.find((c) => c.id === caseId);
  if (!hit) return null;
  if (!hit.timeline) hit.timeline = [];
  hit.timeline.push({ at: new Date().toISOString(), actor, action, note });
  hit.updated_at = new Date().toISOString();
  await writeStore(store);
  return hit;
}

export function computeDefaultResolution(input: {
  category: DisputeCategory;
  order_total_micro: number;
  items: DisputeItemLine[];
}): { refund_amount_micro: number; charge_amount_micro: number; note: string } {
  const { category, order_total_micro, items } = input;

  if (category === 'missing_items') {
    const refund = items
      .filter((i) => i.received === false)
      .reduce((s, i) => s + i.unit_price_micro * i.qty, 0);
    return {
      refund_amount_micro: refund,
      charge_amount_micro: 0,
      note: 'คืนเงินเฉพาะรายการที่ไม่ได้รับ',
    };
  }

  if (category === 'wrong_order_consumed') {
    return {
      refund_amount_micro: 0,
      charge_amount_micro: order_total_micro,
      note: 'เรียกเก็บตามยอดออเดอร์ที่บริโภค (เกณฑ์มาตรฐาน) — ยกเว้นยอมความร่วมกัน',
    };
  }

  if (category === 'wrong_order') {
    return {
      refund_amount_micro: order_total_micro,
      charge_amount_micro: 0,
      note: 'คืนเงินเต็มจำนวน — ออเดอร์ผิดและยังไม่บริโภค',
    };
  }

  if (category === 'wrong_menu' || category === 'damaged_food' || category === 'foreign_object') {
    return {
      refund_amount_micro: order_total_micro,
      charge_amount_micro: 0,
      note: 'คืนเงินเต็มจำนวน — ตรวจสอบหลักฐานแล้ว',
    };
  }

  if (category === 'wrong_rider_pickup') {
    return {
      refund_amount_micro: order_total_micro,
      charge_amount_micro: 0,
      note: 'คืนเงินเต็มจำนวน — ไรเดอร์รับออเดอร์ผิด',
    };
  }

  if (category === 'cancel_order') {
    return {
      refund_amount_micro: order_total_micro,
      charge_amount_micro: 0,
      note: 'คืนเงินตามนโยบายการยกเลิก',
    };
  }

  if (category === 'not_as_described' || category === 'shipping_damage' || category === 'doa') {
    return {
      refund_amount_micro: order_total_micro,
      charge_amount_micro: 0,
      note: 'คืนเงิน/คืนสินค้าตามผลการตรวจสอบ',
    };
  }

  return { refund_amount_micro: 0, charge_amount_micro: 0, note: '' };
}

export async function listMerchantDisputes(merchantId: string): Promise<MerchantDisputeCase[]> {
  const store = await readStore();
  if (store.cases.length === 0) {
    store.cases = seedCases();
    await writeStore(store);
  }
  return store.cases
    .filter((c) => c.merchant_id === merchantId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getDisputeCase(caseId: string): Promise<MerchantDisputeCase | null> {
  const store = await readStore();
  return store.cases.find((c) => c.id === caseId) || null;
}

export async function merchantRespondToDispute(
  caseId: string,
  input: {
    response: string;
    accept_platform?: boolean;
    propose_mutual?: boolean;
    mutual_refund_micro?: number;
  },
): Promise<MerchantDisputeCase | null> {
  const store = await readStore();
  const hit = store.cases.find((c) => c.id === caseId);
  if (!hit) return null;

  hit.merchant_response = input.response.trim();
  hit.updated_at = new Date().toISOString();
  if (!hit.timeline) hit.timeline = [];
  hit.timeline.push({
    at: new Date().toISOString(),
    actor: 'merchant',
    action: input.propose_mutual ? 'propose_mutual' : input.accept_platform ? 'accept_platform' : 'respond',
    note: input.response.trim().slice(0, 120),
  });

  if (input.propose_mutual) {
    hit.mutual_agreement = true;
    hit.status = 'awaiting_customer';
    if (Number.isFinite(input.mutual_refund_micro)) {
      hit.refund_amount_micro = Math.max(0, Math.round(input.mutual_refund_micro!));
      hit.charge_amount_micro = Math.max(0, hit.order_total_micro - hit.refund_amount_micro);
    }
    hit.resolution_note = 'ร้านเสนอยอมความ — รอลูกค้ายืนยัน';
  } else if (input.accept_platform) {
    const def = computeDefaultResolution(hit);
    hit.refund_amount_micro = def.refund_amount_micro;
    hit.charge_amount_micro = def.charge_amount_micro;
    hit.resolution_note = def.note;
    hit.status = def.refund_amount_micro > 0 ? 'resolved_refund' : 'resolved_charge';
  } else {
    hit.status = 'under_review';
    hit.resolution_note = 'ส่งให้ทีมตรวจสอบเพิ่มเติม';
  }

  await writeStore(store);
  return hit;
}

export async function createDisputeCase(input: {
  order_id: string;
  merchant_id: string;
  customer_id: string;
  order_type: DisputeOrderType;
  category: DisputeCategory;
  title: string;
  description: string;
  evidence_note?: string;
  order_total_micro: number;
  items: DisputeItemLine[];
}): Promise<MerchantDisputeCase> {
  const store = await readStore();
  const def = computeDefaultResolution({
    category: input.category,
    order_total_micro: input.order_total_micro,
    items: input.items,
  });

  const c: MerchantDisputeCase = {
    id: `dsp-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    order_id: input.order_id,
    merchant_id: input.merchant_id,
    customer_id: input.customer_id,
    order_type: input.order_type,
    category: input.category,
    status: 'awaiting_merchant',
    title: input.title,
    description: input.description,
    evidence_note: input.evidence_note,
    items: input.items,
    order_total_micro: input.order_total_micro,
    held_amount_micro: input.order_total_micro,
    refund_amount_micro: def.refund_amount_micro,
    charge_amount_micro: def.charge_amount_micro,
    mutual_agreement: false,
    resolution_note: def.note,
    timeline: [
      { at: new Date().toISOString(), actor: 'customer', action: 'filed', note: input.title },
      { at: new Date().toISOString(), actor: 'system', action: 'escrow_hold', note: `พักเงิน ${input.order_total_micro / 100} สต.` },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.cases.unshift(c);
  await writeStore(store);

  const { appendAqondEvent } = await import('@/lib/server/aqondEventBus');
  await appendAqondEvent({
    order_id: c.order_id,
    event_type: 'claim.opened',
    source: 'storefront',
    actor: input.customer_id,
    merchant_id: input.merchant_id,
    payload: {
      case_id: c.id,
      category: c.category,
      title: c.title,
    },
  });

  return c;
}

export async function getDisputeSummary(merchantId: string) {
  const cases = await listMerchantDisputes(merchantId);
  const open = cases.filter((c) => !['resolved_refund', 'resolved_charge', 'resolved_mutual', 'closed'].includes(c.status));
  const heldTotal = open.reduce((s, c) => s + c.held_amount_micro, 0);
  return { total: cases.length, open_count: open.length, held_total_micro: heldTotal, cases };
}

export async function updateDisputeCase(
  caseId: string,
  patch: Partial<MerchantDisputeCase>,
): Promise<MerchantDisputeCase | null> {
  const store = await readStore();
  const hit = store.cases.find((c) => c.id === caseId);
  if (!hit) return null;
  Object.assign(hit, patch, { updated_at: new Date().toISOString() });
  await writeStore(store);
  return hit;
}

export async function listDisputesForOrder(orderId: string): Promise<MerchantDisputeCase[]> {
  const store = await readStore();
  if (store.cases.length === 0) {
    store.cases = seedCases();
    await writeStore(store);
  }
  return store.cases
    .filter((c) => c.order_id === orderId)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
