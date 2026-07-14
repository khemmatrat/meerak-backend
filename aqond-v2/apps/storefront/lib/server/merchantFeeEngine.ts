import fs from 'fs/promises';
import path from 'path';
import { computeDailyFees, feePolicySummaryTh, type DailyFeeBreakdown } from '@/lib/merchantFees';
import { listMerchantOrders, type MerchantOrderView } from '@/lib/server/merchantOrders';
import { resolveShopStartDate } from '@/lib/server/merchantShops';
import {
  bangkokDateKey,
  bangkokMonthKey,
  isShopFirstYear,
  shopMonthIndex,
} from '@/lib/server/thaiTime';

const LEDGER_FILE = path.join(process.cwd(), '.data', 'dev', 'merchant-fee-ledger.json');

export type FeeLedgerDay = DailyFeeBreakdown & { merchant_id: string; synced_at: string };

type LedgerStore = Record<string, FeeLedgerDay[]>;

async function readLedger(): Promise<LedgerStore> {
  try {
    return JSON.parse(await fs.readFile(LEDGER_FILE, 'utf8'));
  } catch {
    return {};
  }
}

async function writeLedger(store: LedgerStore) {
  await fs.mkdir(path.dirname(LEDGER_FILE), { recursive: true });
  await fs.writeFile(LEDGER_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function orderTimestamp(o: MerchantOrderView): string | undefined {
  return o.delivered_at || o.created_at;
}

function isDelivered(o: MerchantOrderView): boolean {
  return o.fulfillment_status === 'delivered' || o.status === 'completed';
}

function revenueByBangkokDate(orders: MerchantOrderView[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const ts = orderTimestamp(o);
    if (!ts) continue;
    const key = bangkokDateKey(new Date(ts));
    map.set(key, (map.get(key) || 0) + (o.amount_micro || 0));
  }
  return map;
}

function monthlyRevenueUpTo(
  revenueByDate: Map<string, number>,
  monthKey: string,
  throughDate: string,
): number {
  let sum = 0;
  for (const [date, amt] of revenueByDate) {
    if (date.startsWith(monthKey) && date <= throughDate) sum += amt;
  }
  return sum;
}

function cumulativeRevenueUpTo(revenueByDate: Map<string, number>, throughDate: string): number {
  let sum = 0;
  for (const [date, amt] of revenueByDate) {
    if (date <= throughDate) sum += amt;
  }
  return sum;
}

export async function syncMerchantFeeLedger(merchantId: string): Promise<FeeLedgerDay[]> {
  const shopStart = await resolveShopStartDate(merchantId);
  const { orders } = await listMerchantOrders(merchantId);
  const revenueByDate = revenueByBangkokDate(orders);
  const dates = [...revenueByDate.keys()].sort();

  const store = await readLedger();
  const existing = store[merchantId] || [];
  const existingByDate = new Map(existing.map((e) => [e.date, e]));

  const monthRentAcc = new Map<string, { charged: number; days: number }>();
  const rebuilt: FeeLedgerDay[] = [];

  for (const date of dates) {
    const monthKey = date.slice(0, 7);
    const monthIndex = shopMonthIndex(shopStart, new Date(`${date}T12:00:00+07:00`));
    const dailyRevenue = revenueByDate.get(date) || 0;
    const monthlyRevenue = monthlyRevenueUpTo(revenueByDate, monthKey, date);
    const cumulative = cumulativeRevenueUpTo(revenueByDate, date);
    const acc = monthRentAcc.get(monthKey) || { charged: 0, days: 0 };

    const breakdown = computeDailyFees({
      date,
      monthIndex,
      dailyRevenueMicro: dailyRevenue,
      monthlyRevenueMicro: monthlyRevenue,
      cumulativeRevenueMicro: cumulative,
      rentChargedThisMonthMicro: acc.charged,
      rentDaysChargedThisMonth: acc.days,
      isFirstYear: isShopFirstYear(shopStart, new Date(`${date}T12:00:00+07:00`)),
    });

    const entry: FeeLedgerDay = {
      merchant_id: merchantId,
      ...breakdown,
      synced_at: existingByDate.get(date)?.synced_at || new Date().toISOString(),
    };
    rebuilt.push(entry);

    if (breakdown.rent_fee_micro > 0) {
      acc.charged += breakdown.rent_fee_micro;
      acc.days += 1;
      monthRentAcc.set(monthKey, acc);
    }
  }

  // วันนี้ที่ยังไม่มียอดขาย — อาจมีค่าเช่ารายวัน (หักแม้ไม่มียอด)
  const today = bangkokDateKey();
  if (!dates.includes(today)) {
    const monthKey = bangkokMonthKey();
    const monthIndex = shopMonthIndex(shopStart);
    const monthlyRevenue = monthlyRevenueUpTo(revenueByDate, monthKey, today);
    const cumulative = cumulativeRevenueUpTo(revenueByDate, today);
    const acc = monthRentAcc.get(monthKey) || { charged: 0, days: 0 };

    const breakdown = computeDailyFees({
      date: today,
      monthIndex,
      dailyRevenueMicro: 0,
      monthlyRevenueMicro: monthlyRevenue,
      cumulativeRevenueMicro: cumulative,
      rentChargedThisMonthMicro: acc.charged,
      rentDaysChargedThisMonth: acc.days,
      isFirstYear: isShopFirstYear(shopStart),
    });

    if (breakdown.total_fee_micro > 0 || breakdown.rent_tier !== 'none') {
      rebuilt.push({
        merchant_id: merchantId,
        ...breakdown,
        synced_at: new Date().toISOString(),
      });
    }
  }

  rebuilt.sort((a, b) => b.date.localeCompare(a.date));
  store[merchantId] = rebuilt;
  await writeLedger(store);
  return rebuilt;
}

export async function getMerchantFeeSummary(merchantId: string) {
  const shopStart = await resolveShopStartDate(merchantId);
  const ledger = await syncMerchantFeeLedger(merchantId);
  const today = bangkokDateKey();
  const todayEntry = ledger.find((e) => e.date === today);
  const monthKey = bangkokMonthKey();
  const monthLedger = ledger.filter((e) => e.date.startsWith(monthKey));

  const monthGross = monthLedger.reduce((s, e) => s + e.gross_revenue_micro, 0);
  const monthFees = monthLedger.reduce((s, e) => s + e.total_fee_micro, 0);
  const totalFees = ledger.reduce((s, e) => s + e.total_fee_micro, 0);
  const totalGross = ledger.reduce((s, e) => s + e.gross_revenue_micro, 0);

  return {
    merchant_id: merchantId,
    shop_started_at: shopStart,
    month_index: shopMonthIndex(shopStart),
    is_first_year: isShopFirstYear(shopStart),
    policy_lines: feePolicySummaryTh(),
    today: todayEntry || null,
    month: {
      key: monthKey,
      gross_micro: monthGross,
      fees_micro: monthFees,
      net_micro: monthGross - monthFees,
      rent_tier: todayEntry?.rent_tier || 'none',
    },
    totals: {
      gross_micro: totalGross,
      fees_micro: totalFees,
      net_micro: totalGross - totalFees,
    },
    ledger: ledger.slice(0, 45),
  };
}

export function sumFeesMicro(ledger: FeeLedgerDay[]): number {
  return ledger.reduce((s, e) => s + e.total_fee_micro, 0);
}
