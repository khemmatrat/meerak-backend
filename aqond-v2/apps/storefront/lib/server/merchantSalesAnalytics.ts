import { listMerchantOrders, type MerchantOrderView } from '@/lib/server/merchantOrders';
import { bangkokDateKey, bangkokMonthKey } from '@/lib/server/thaiTime';

function isDelivered(o: MerchantOrderView): boolean {
  return o.fulfillment_status === 'delivered' || o.status === 'completed';
}

function orderTs(o: MerchantOrderView): Date | null {
  const raw = o.delivered_at || o.created_at;
  return raw ? new Date(raw) : null;
}

function bangkokHour(d: Date): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    hour12: false,
  }).format(d);
  return parseInt(h, 10);
}

function dateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    keys.push(bangkokDateKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return keys;
}

function weekStartKey(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return bangkokDateKey(d);
}

export async function getMerchantSalesAnalytics(merchantId: string) {
  const { orders } = await listMerchantOrders(merchantId);
  const delivered = orders.filter(isDelivered);

  const todayKey = bangkokDateKey();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = bangkokDateKey(yesterday);

  const weekStart = weekStartKey();
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekStartKey = weekStartKey(lastWeekStart);
  const lastWeekEnd = new Date();
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
  const lastWeekEndKey = bangkokDateKey(lastWeekEnd);

  const revenueOn = (key: string) =>
    delivered
      .filter((o) => {
        const ts = orderTs(o);
        return ts && bangkokDateKey(ts) === key;
      })
      .reduce((s, o) => s + (o.amount_micro || 0), 0);

  const revenueRange = (fromKey: string, toKey: string) =>
    delivered
      .filter((o) => {
        const ts = orderTs(o);
        if (!ts) return false;
        const k = bangkokDateKey(ts);
        return k >= fromKey && k <= toKey;
      })
      .reduce((s, o) => s + (o.amount_micro || 0), 0);

  const todayRev = revenueOn(todayKey);
  const yesterdayRev = revenueOn(yesterdayKey);
  const thisWeekRev = revenueRange(weekStart, todayKey);
  const lastWeekRev = revenueRange(lastWeekStartKey, lastWeekEndKey);

  const menuCounts = new Map<string, { title: string; qty: number; revenue_micro: number }>();
  const hourCounts = new Array(24).fill(0) as number[];

  for (const o of delivered) {
    const ts = orderTs(o);
    if (ts) {
      const h = bangkokHour(ts);
      hourCounts[h] += o.amount_micro || 0;
    }
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items as { title?: string; product_id?: string; qty?: number; unit_price_micro?: number }[]) {
      const title = it.title || it.product_id || 'unknown';
      const qty = it.qty || 1;
      const rev = (it.unit_price_micro || 0) * qty;
      const cur = menuCounts.get(title) || { title, qty: 0, revenue_micro: 0 };
      cur.qty += qty;
      cur.revenue_micro += rev || (o.amount_micro || 0) / Math.max(1, items.length);
      menuCounts.set(title, cur);
    }
  }

  const bestSellers = [...menuCounts.values()]
    .sort((a, b) => b.qty - a.qty || b.revenue_micro - a.revenue_micro)
    .slice(0, 8);

  const peakHours = hourCounts
    .map((revenue_micro, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, revenue_micro }))
    .filter((h) => h.revenue_micro > 0)
    .sort((a, b) => b.revenue_micro - a.revenue_micro);

  const peakTop = peakHours.slice(0, 5);
  const maxPeak = peakTop[0]?.revenue_micro || 1;

  const monthKey = bangkokMonthKey();
  const monthDays = dateKeysBetween(new Date(`${monthKey}-01T12:00:00+07:00`), new Date()).slice(-14);
  const dailyTrend = monthDays.map((date) => ({
    date,
    revenue_micro: revenueOn(date),
    orders: delivered.filter((o) => {
      const ts = orderTs(o);
      return ts && bangkokDateKey(ts) === date;
    }).length,
  }));

  return {
    merchant_id: merchantId,
    compare: {
      today_micro: todayRev,
      yesterday_micro: yesterdayRev,
      today_vs_yesterday_pct:
        yesterdayRev > 0 ? Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100) : null,
      this_week_micro: thisWeekRev,
      last_week_micro: lastWeekRev,
      week_vs_week_pct:
        lastWeekRev > 0 ? Math.round(((thisWeekRev - lastWeekRev) / lastWeekRev) * 100) : null,
    },
    best_sellers: bestSellers,
    peak_hours: peakTop.map((p) => ({ ...p, pct: Math.round((p.revenue_micro / maxPeak) * 100) })),
    daily_trend: dailyTrend,
    totals: {
      orders: delivered.length,
      revenue_micro: delivered.reduce((s, o) => s + (o.amount_micro || 0), 0),
    },
  };
}
