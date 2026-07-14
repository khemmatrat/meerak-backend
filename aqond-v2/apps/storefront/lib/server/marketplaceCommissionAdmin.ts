import type { DatabaseSync } from 'node:sqlite';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import { getEscrowStorageBackend } from '@/lib/server/escrowStore';
import { getPlatformCommissionRate } from '@/lib/server/platformCommission';

export type CommissionPeriodGroup = 'day' | 'week' | 'month';

export type CommissionSummaryBucket = {
  bucket: string;
  accrued_commission_micro: number;
  released_commission_micro: number;
  gross_micro: number;
  order_count: number;
};

export type CommissionSummary = {
  ok: true;
  backend: 'sqlite' | 'postgres';
  commission_rate_default: number;
  from: string | null;
  to: string | null;
  group: CommissionPeriodGroup;
  totals: {
    accrued_commission_micro: number;
    released_commission_micro: number;
    gross_micro: number;
    accrued_order_count: number;
    released_order_count: number;
  };
  buckets: CommissionSummaryBucket[];
};

export type CommissionOrderRow = {
  id: string;
  order_id: string;
  hold_id: string;
  merchant_id: string;
  gross_amount_micro: number;
  commission_rate: number;
  commission_micro: number;
  net_amount_micro: number;
  status: 'accrued' | 'released';
  created_at: string;
  released_at: string | null;
};

export type CommissionOrdersResult = {
  ok: true;
  backend: 'sqlite' | 'postgres';
  from: string | null;
  to: string | null;
  status: string | null;
  limit: number;
  offset: number;
  total: number;
  orders: CommissionOrderRow[];
};

function parseIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseGroup(value: string | null | undefined): CommissionPeriodGroup {
  const g = String(value || 'day').toLowerCase();
  if (g === 'week' || g === 'month') return g;
  return 'day';
}

function bucketExprPg(group: CommissionPeriodGroup, column: string): string {
  if (group === 'week') return `date_trunc('week', ${column})::date`;
  if (group === 'month') return `date_trunc('month', ${column})::date`;
  return `(${column} AT TIME ZONE 'UTC')::date`;
}

function bucketExprSqlite(group: CommissionPeriodGroup, column: string): string {
  if (group === 'week') return `strftime('%Y-W%W', ${column})`;
  if (group === 'month') return `strftime('%Y-%m', ${column})`;
  return `strftime('%Y-%m-%d', ${column})`;
}

function mapCommissionOrderRow(row: Record<string, unknown>): CommissionOrderRow {
  return {
    id: String(row.id),
    order_id: String(row.order_id),
    hold_id: String(row.hold_id),
    merchant_id: String(row.merchant_id),
    gross_amount_micro: Number(row.gross_amount_micro ?? 0),
    commission_rate: Number(row.commission_rate ?? 0),
    commission_micro: Number(row.commission_micro ?? 0),
    net_amount_micro: Number(row.net_amount_micro ?? 0),
    status: row.status as 'accrued' | 'released',
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
    released_at:
      row.released_at == null
        ? null
        : row.released_at instanceof Date
          ? row.released_at.toISOString()
          : String(row.released_at),
  };
}

function mergeBuckets(
  released: CommissionSummaryBucket[],
  accrued: { bucket: string; accrued_commission_micro: number }[],
): CommissionSummaryBucket[] {
  const map = new Map<string, CommissionSummaryBucket>();
  for (const row of released) {
    map.set(row.bucket, { ...row });
  }
  for (const row of accrued) {
    const hit = map.get(row.bucket);
    if (hit) hit.accrued_commission_micro = row.accrued_commission_micro;
    else {
      map.set(row.bucket, {
        bucket: row.bucket,
        accrued_commission_micro: row.accrued_commission_micro,
        released_commission_micro: 0,
        gross_micro: 0,
        order_count: 0,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.bucket.localeCompare(a.bucket));
}

export async function getMarketplaceCommissionSummary(options?: {
  from?: string | null;
  to?: string | null;
  group?: CommissionPeriodGroup | string | null;
  database?: DatabaseSync;
}): Promise<CommissionSummary> {
  const backend = getEscrowStorageBackend();
  const from = parseIsoDate(options?.from ?? null);
  const to = parseIsoDate(options?.to ?? null);
  const group = parseGroup(options?.group ?? 'day');

  if (backend === 'postgres') {
    const pool = getEscrowPgPool();
    const totalsParams: unknown[] = [];
    let p = 1;
    const accruedParts = [`status = 'accrued'`];
    const releasedParts = [`status = 'released'`];
    if (from) {
      accruedParts.push(`created_at >= $${p}`);
      releasedParts.push(`released_at >= $${p}`);
      totalsParams.push(from);
      p += 1;
    }
    if (to) {
      accruedParts.push(`created_at < $${p}`);
      releasedParts.push(`released_at < $${p}`);
      totalsParams.push(to);
    }

    const totalsRes = await pool.query(
      `SELECT
         COALESCE((SELECT SUM(commission_micro) FROM platform_commission_ledger WHERE ${accruedParts.join(' AND ')}), 0)::bigint AS accrued_commission_micro,
         COALESCE((SELECT SUM(commission_micro) FROM platform_commission_ledger WHERE ${releasedParts.join(' AND ')}), 0)::bigint AS released_commission_micro,
         COALESCE((SELECT SUM(gross_amount_micro) FROM platform_commission_ledger WHERE ${accruedParts.join(' AND ')}), 0)::bigint AS gross_micro,
         COALESCE((SELECT COUNT(*) FROM platform_commission_ledger WHERE ${accruedParts.join(' AND ')}), 0)::int AS accrued_order_count,
         COALESCE((SELECT COUNT(*) FROM platform_commission_ledger WHERE ${releasedParts.join(' AND ')}), 0)::int AS released_order_count`,
      totalsParams,
    );

    const bucketReleased = bucketExprPg(group, 'released_at');
    const bucketAccrued = bucketExprPg(group, 'created_at');
    const releasedRes = await pool.query(
      `SELECT ${bucketReleased}::text AS bucket,
              SUM(commission_micro)::bigint AS released_commission_micro,
              SUM(gross_amount_micro)::bigint AS gross_micro,
              COUNT(*)::int AS order_count
       FROM platform_commission_ledger
       WHERE ${releasedParts.join(' AND ')}
       GROUP BY 1
       ORDER BY 1 DESC`,
      totalsParams,
    );
    const accruedRes = await pool.query(
      `SELECT ${bucketAccrued}::text AS bucket,
              SUM(commission_micro)::bigint AS accrued_commission_micro
       FROM platform_commission_ledger
       WHERE ${accruedParts.join(' AND ')}
       GROUP BY 1`,
      totalsParams,
    );

    const t = totalsRes.rows[0] || {};
    return {
      ok: true,
      backend,
      commission_rate_default: getPlatformCommissionRate(),
      from,
      to,
      group,
      totals: {
        accrued_commission_micro: Number(t.accrued_commission_micro ?? 0),
        released_commission_micro: Number(t.released_commission_micro ?? 0),
        gross_micro: Number(t.gross_micro ?? 0),
        accrued_order_count: Number(t.accrued_order_count ?? 0),
        released_order_count: Number(t.released_order_count ?? 0),
      },
      buckets: mergeBuckets(
        (releasedRes.rows || []).map((r) => ({
          bucket: String(r.bucket),
          accrued_commission_micro: 0,
          released_commission_micro: Number(r.released_commission_micro ?? 0),
          gross_micro: Number(r.gross_micro ?? 0),
          order_count: Number(r.order_count ?? 0),
        })),
        (accruedRes.rows || []).map((r) => ({
          bucket: String(r.bucket),
          accrued_commission_micro: Number(r.accrued_commission_micro ?? 0),
        })),
      ),
    };
  }

  const db = options?.database ?? (await import('@/lib/server/escrowDbStore')).getEscrowDatabase();
  const dateFilter = (col: string) => {
    const parts: string[] = [];
    if (from) parts.push(`${col} >= '${from}'`);
    if (to) parts.push(`${col} < '${to}'`);
    return parts.length ? parts.join(' AND ') : '1=1';
  };

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'accrued' AND ${dateFilter('created_at')} THEN commission_micro ELSE 0 END), 0) AS accrued_commission_micro,
         COALESCE(SUM(CASE WHEN status = 'released' AND ${dateFilter('released_at')} THEN commission_micro ELSE 0 END), 0) AS released_commission_micro,
         COALESCE(SUM(CASE WHEN status = 'accrued' AND ${dateFilter('created_at')} THEN gross_amount_micro ELSE 0 END), 0) AS gross_micro,
         COALESCE(SUM(CASE WHEN status = 'accrued' AND ${dateFilter('created_at')} THEN 1 ELSE 0 END), 0) AS accrued_order_count,
         COALESCE(SUM(CASE WHEN status = 'released' AND ${dateFilter('released_at')} THEN 1 ELSE 0 END), 0) AS released_order_count
       FROM platform_commission_ledger`,
    )
    .get() as Record<string, number>;

  const releasedBuckets = db
    .prepare(
      `SELECT ${bucketExprSqlite(group, 'released_at')} AS bucket,
              SUM(commission_micro) AS released_commission_micro,
              SUM(gross_amount_micro) AS gross_micro,
              COUNT(*) AS order_count
       FROM platform_commission_ledger
       WHERE status = 'released' AND ${dateFilter('released_at')}
       GROUP BY 1
       ORDER BY 1 DESC`,
    )
    .all() as CommissionSummaryBucket[];
  const accruedBuckets = db
    .prepare(
      `SELECT ${bucketExprSqlite(group, 'created_at')} AS bucket,
              SUM(commission_micro) AS accrued_commission_micro
       FROM platform_commission_ledger
       WHERE status = 'accrued' AND ${dateFilter('created_at')}
       GROUP BY 1`,
    )
    .all() as { bucket: string; accrued_commission_micro: number }[];

  return {
    ok: true,
    backend,
    commission_rate_default: getPlatformCommissionRate(),
    from,
    to,
    group,
    totals: {
      accrued_commission_micro: Number(totals.accrued_commission_micro ?? 0),
      released_commission_micro: Number(totals.released_commission_micro ?? 0),
      gross_micro: Number(totals.gross_micro ?? 0),
      accrued_order_count: Number(totals.accrued_order_count ?? 0),
      released_order_count: Number(totals.released_order_count ?? 0),
    },
    buckets: mergeBuckets(
      releasedBuckets.map((row) => ({
        bucket: String(row.bucket),
        accrued_commission_micro: 0,
        released_commission_micro: Number(row.released_commission_micro ?? 0),
        gross_micro: Number(row.gross_micro ?? 0),
        order_count: Number(row.order_count ?? 0),
      })),
      accruedBuckets.map((row) => ({
        bucket: String(row.bucket),
        accrued_commission_micro: Number(row.accrued_commission_micro ?? 0),
      })),
    ),
  };
}

export async function listMarketplaceCommissionOrders(options?: {
  from?: string | null;
  to?: string | null;
  status?: 'accrued' | 'released' | null;
  limit?: number;
  offset?: number;
  database?: DatabaseSync;
}): Promise<CommissionOrdersResult> {
  const backend = getEscrowStorageBackend();
  const from = parseIsoDate(options?.from ?? null);
  const to = parseIsoDate(options?.to ?? null);
  const status = options?.status ?? null;
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const offset = Math.max(options?.offset ?? 0, 0);

  if (backend === 'postgres') {
    const pool = getEscrowPgPool();
    const where: string[] = ['1=1'];
    const params: unknown[] = [];
    let p = 1;
    if (status) {
      where.push(`status = $${p++}`);
      params.push(status);
    }
    if (from) {
      where.push(`created_at >= $${p++}`);
      params.push(from);
    }
    if (to) {
      where.push(`created_at < $${p++}`);
      params.push(to);
    }
    const whereSql = where.join(' AND ');
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS c FROM platform_commission_ledger WHERE ${whereSql}`,
      params,
    );
    const rowsRes = await pool.query(
      `SELECT id, order_id, hold_id, merchant_id, gross_amount_micro, commission_rate,
              commission_micro, net_amount_micro, status, created_at, released_at
       FROM platform_commission_ledger
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${p++} OFFSET $${p}`,
      [...params, limit, offset],
    );
    return {
      ok: true,
      backend,
      from,
      to,
      status,
      limit,
      offset,
      total: Number(countRes.rows[0]?.c ?? 0),
      orders: (rowsRes.rows || []).map(mapCommissionOrderRow),
    };
  }

  const db = options?.database ?? (await import('@/lib/server/escrowDbStore')).getEscrowDatabase();
  const parts: string[] = ['1=1'];
  if (status) parts.push(`status = '${status}'`);
  if (from) parts.push(`created_at >= '${from}'`);
  if (to) parts.push(`created_at < '${to}'`);
  const whereSql = parts.join(' AND ');
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS c FROM platform_commission_ledger WHERE ${whereSql}`)
    .get() as { c: number };
  const rows = db
    .prepare(
      `SELECT id, order_id, hold_id, merchant_id, gross_amount_micro, commission_rate,
              commission_micro, net_amount_micro, status, created_at, released_at
       FROM platform_commission_ledger
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as CommissionOrderRow[];

  return {
    ok: true,
    backend,
    from,
    to,
    status,
    limit,
    offset,
    total: totalRow.c,
    orders: rows.map(mapCommissionOrderRow),
  };
}

export async function exportMarketplaceCommissionCsv(options?: {
  from?: string | null;
  to?: string | null;
  status?: 'accrued' | 'released' | null;
  database?: DatabaseSync;
}): Promise<string> {
  const { orders } = await listMarketplaceCommissionOrders({
    ...options,
    limit: 5000,
    offset: 0,
  });
  const header = [
    'id',
    'order_id',
    'hold_id',
    'merchant_id',
    'gross_amount_micro',
    'commission_rate',
    'commission_micro',
    'net_amount_micro',
    'status',
    'created_at',
    'released_at',
  ];
  const lines = [header.join(',')];
  for (const row of orders) {
    lines.push(
      [
        row.id,
        row.order_id,
        row.hold_id,
        row.merchant_id,
        row.gross_amount_micro,
        row.commission_rate,
        row.commission_micro,
        row.net_amount_micro,
        row.status,
        row.created_at,
        row.released_at ?? '',
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(','),
    );
  }
  return lines.join('\n');
}
