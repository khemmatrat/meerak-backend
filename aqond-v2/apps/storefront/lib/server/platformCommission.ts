import type { DatabaseSync } from 'node:sqlite';
import type { PoolClient } from 'pg';
import { MARKETPLACE_PAYMENT_ESCROW_REASON } from '@/lib/server/escrowDbStore';

export type CommissionLedgerStatus = 'accrued' | 'released';

export type PlatformCommissionLedgerRow = {
  id: string;
  order_id: string;
  hold_id: string;
  merchant_id: string;
  gross_amount_micro: number;
  commission_rate: number;
  commission_micro: number;
  net_amount_micro: number;
  status: CommissionLedgerStatus;
  created_at: string;
  released_at: string | null;
};

export type AccrueCommissionResult = {
  id: string;
  duplicate: boolean;
  commission_micro: number;
  net_amount_micro: number;
  commission_rate: number;
};

export type ReleaseCommissionResult = {
  released: boolean;
  duplicate: boolean;
  net_amount_micro: number | null;
  commission_micro: number | null;
};

/** Frozen at hold time from PLATFORM_COMMISSION_RATE (default 2.2%). */
export function getPlatformCommissionRate(): number {
  const raw = Number(process.env.PLATFORM_COMMISSION_RATE ?? 0.022);
  if (!Number.isFinite(raw)) return 0.022;
  return Math.min(1, Math.max(0, raw));
}

export function shouldAccrueMarketplaceCommission(reason: string): boolean {
  return reason === MARKETPLACE_PAYMENT_ESCROW_REASON;
}

export function computeCommissionAmounts(
  grossAmountMicro: number,
  rate: number = getPlatformCommissionRate(),
): { commission_micro: number; net_amount_micro: number; commission_rate: number } {
  const commission_micro = Math.floor(grossAmountMicro * rate);
  const net_amount_micro = grossAmountMicro - commission_micro;
  return { commission_micro, net_amount_micro, commission_rate: rate };
}

function commissionLedgerId(holdId: string): string {
  return `pcl-${holdId}`;
}

export function accruePlatformCommissionSqlite(
  database: DatabaseSync,
  params: {
    order_id: string;
    hold_id: string;
    merchant_id: string;
    gross_amount_micro: number;
    commission_rate?: number;
  },
): AccrueCommissionResult {
  const { commission_micro, net_amount_micro, commission_rate } = computeCommissionAmounts(
    params.gross_amount_micro,
    params.commission_rate,
  );
  const id = commissionLedgerId(params.hold_id);
  const now = new Date().toISOString();

  const prior = database
    .prepare(`SELECT id FROM platform_commission_ledger WHERE hold_id = ?`)
    .get(params.hold_id) as { id: string } | undefined;
  if (prior) {
    const row = database
      .prepare(
        `SELECT commission_micro, net_amount_micro, commission_rate FROM platform_commission_ledger WHERE hold_id = ?`,
      )
      .get(params.hold_id) as {
      commission_micro: number;
      net_amount_micro: number;
      commission_rate: number;
    };
    return {
      id: prior.id,
      duplicate: true,
      commission_micro: row.commission_micro,
      net_amount_micro: row.net_amount_micro,
      commission_rate: row.commission_rate,
    };
  }

  database
    .prepare(
      `INSERT INTO platform_commission_ledger
        (id, order_id, hold_id, merchant_id, gross_amount_micro, commission_rate,
         commission_micro, net_amount_micro, status, created_at, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accrued', ?, NULL)`,
    )
    .run(
      id,
      params.order_id,
      params.hold_id,
      params.merchant_id,
      params.gross_amount_micro,
      commission_rate,
      commission_micro,
      net_amount_micro,
      now,
    );

  return { id, duplicate: false, commission_micro, net_amount_micro, commission_rate };
}

export function releasePlatformCommissionSqlite(
  database: DatabaseSync,
  holdId: string,
): ReleaseCommissionResult {
  const accrued = database
    .prepare(
      `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
       WHERE hold_id = ? AND status = 'accrued'`,
    )
    .get(holdId) as { commission_micro: number; net_amount_micro: number } | undefined;

  if (!accrued) {
    const released = database
      .prepare(
        `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
         WHERE hold_id = ? AND status = 'released'`,
      )
      .get(holdId) as { commission_micro: number; net_amount_micro: number } | undefined;
    if (released) {
      return {
        released: true,
        duplicate: true,
        net_amount_micro: released.net_amount_micro,
        commission_micro: released.commission_micro,
      };
    }
    return { released: false, duplicate: false, net_amount_micro: null, commission_micro: null };
  }

  const now = new Date().toISOString();
  const update = database
    .prepare(
      `UPDATE platform_commission_ledger SET status = 'released', released_at = ?
       WHERE hold_id = ? AND status = 'accrued'`,
    )
    .run(now, holdId);

  if (update.changes === 0) {
    const again = database
      .prepare(
        `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
         WHERE hold_id = ? AND status = 'released'`,
      )
      .get(holdId) as { commission_micro: number; net_amount_micro: number } | undefined;
    if (again) {
      return {
        released: true,
        duplicate: true,
        net_amount_micro: again.net_amount_micro,
        commission_micro: again.commission_micro,
      };
    }
    return { released: false, duplicate: false, net_amount_micro: null, commission_micro: null };
  }

  return {
    released: true,
    duplicate: false,
    net_amount_micro: accrued.net_amount_micro,
    commission_micro: accrued.commission_micro,
  };
}

export async function accruePlatformCommissionPg(
  tx: PoolClient,
  params: {
    order_id: string;
    hold_id: string;
    merchant_id: string;
    gross_amount_micro: number;
    commission_rate?: number;
  },
): Promise<AccrueCommissionResult> {
  const { commission_micro, net_amount_micro, commission_rate } = computeCommissionAmounts(
    params.gross_amount_micro,
    params.commission_rate,
  );
  const id = commissionLedgerId(params.hold_id);

  const prior = await tx.query(`SELECT id FROM platform_commission_ledger WHERE hold_id = $1`, [params.hold_id]);
  if (prior.rows[0]?.id) {
    const row = await tx.query(
      `SELECT commission_micro, net_amount_micro, commission_rate FROM platform_commission_ledger WHERE hold_id = $1`,
      [params.hold_id],
    );
    return {
      id: prior.rows[0].id as string,
      duplicate: true,
      commission_micro: Number(row.rows[0]?.commission_micro ?? 0),
      net_amount_micro: Number(row.rows[0]?.net_amount_micro ?? 0),
      commission_rate: Number(row.rows[0]?.commission_rate ?? commission_rate),
    };
  }

  await tx.query(
    `INSERT INTO platform_commission_ledger
      (id, order_id, hold_id, merchant_id, gross_amount_micro, commission_rate,
       commission_micro, net_amount_micro, status, created_at, released_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'accrued',NOW(),NULL)`,
    [
      id,
      params.order_id,
      params.hold_id,
      params.merchant_id,
      params.gross_amount_micro,
      commission_rate,
      commission_micro,
      net_amount_micro,
    ],
  );

  return { id, duplicate: false, commission_micro, net_amount_micro, commission_rate };
}

export async function releasePlatformCommissionPg(
  tx: PoolClient,
  holdId: string,
): Promise<ReleaseCommissionResult> {
  const accrued = await tx.query(
    `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
     WHERE hold_id = $1 AND status = 'accrued' FOR UPDATE`,
    [holdId],
  );
  const row = accrued.rows[0] as { commission_micro: number; net_amount_micro: number } | undefined;

  if (!row) {
    const released = await tx.query(
      `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
       WHERE hold_id = $1 AND status = 'released'`,
      [holdId],
    );
    if (released.rows[0]) {
      return {
        released: true,
        duplicate: true,
        net_amount_micro: Number(released.rows[0].net_amount_micro),
        commission_micro: Number(released.rows[0].commission_micro),
      };
    }
    return { released: false, duplicate: false, net_amount_micro: null, commission_micro: null };
  }

  const updated = await tx.query(
    `UPDATE platform_commission_ledger SET status = 'released', released_at = NOW()
     WHERE hold_id = $1 AND status = 'accrued'`,
    [holdId],
  );
  if ((updated.rowCount ?? 0) === 0) {
    const again = await tx.query(
      `SELECT commission_micro, net_amount_micro FROM platform_commission_ledger
       WHERE hold_id = $1 AND status = 'released'`,
      [holdId],
    );
    if (again.rows[0]) {
      return {
        released: true,
        duplicate: true,
        net_amount_micro: Number(again.rows[0].net_amount_micro),
        commission_micro: Number(again.rows[0].commission_micro),
      };
    }
    return { released: false, duplicate: false, net_amount_micro: null, commission_micro: null };
  }

  return {
    released: true,
    duplicate: false,
    net_amount_micro: Number(row.net_amount_micro),
    commission_micro: Number(row.commission_micro),
  };
}
