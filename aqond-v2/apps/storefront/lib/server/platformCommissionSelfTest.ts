import type { DatabaseSync } from 'node:sqlite';
import {
  MARKETPLACE_PAYMENT_ESCROW_REASON,
  createEscrowDbAdapter,
  getEscrowStorageBackend,
  holdEscrowForOrder,
  openEscrowDatabaseAt,
  releaseEscrowForOrderAutoConfirm,
} from '@/lib/server/escrowStore';
import { getEscrowPgPool } from '@/lib/server/escrowPgStore';
import {
  computeCommissionAmounts,
  getPlatformCommissionRate,
} from '@/lib/server/platformCommission';

type LedgerSnapshot = {
  hold_id: string;
  status: string;
  commission_micro: number;
  net_amount_micro: number;
  commission_rate: number;
  gross_amount_micro: number;
};

async function readLedgerForHold(holdId: string, database?: DatabaseSync): Promise<LedgerSnapshot | null> {
  if (getEscrowStorageBackend() === 'postgres') {
    const res = await getEscrowPgPool().query(
      `SELECT hold_id, status, commission_micro, net_amount_micro, commission_rate, gross_amount_micro
       FROM platform_commission_ledger WHERE hold_id = $1`,
      [holdId],
    );
    const row = res.rows[0] as LedgerSnapshot | undefined;
    if (!row) return null;
    return {
      ...row,
      commission_micro: Number(row.commission_micro),
      net_amount_micro: Number(row.net_amount_micro),
      commission_rate: Number(row.commission_rate),
      gross_amount_micro: Number(row.gross_amount_micro),
    };
  }
  const db = database!;
  const row = db
    .prepare(
      `SELECT hold_id, status, commission_micro, net_amount_micro, commission_rate, gross_amount_micro
       FROM platform_commission_ledger WHERE hold_id = ?`,
    )
    .get(holdId) as LedgerSnapshot | undefined;
  return row ?? null;
}

async function countLedgerForOrder(orderId: string, database?: DatabaseSync): Promise<number> {
  if (getEscrowStorageBackend() === 'postgres') {
    const res = await getEscrowPgPool().query(
      `SELECT COUNT(*)::int AS c FROM platform_commission_ledger WHERE order_id = $1`,
      [orderId],
    );
    return Number(res.rows[0]?.c ?? 0);
  }
  const row = database!
    .prepare(`SELECT COUNT(*) AS c FROM platform_commission_ledger WHERE order_id = ?`)
    .get(orderId) as { c: number };
  return row.c;
}

async function cleanupCommissionTest(orderId: string, database?: DatabaseSync) {
  if (getEscrowStorageBackend() === 'postgres') {
    const pool = getEscrowPgPool();
    await pool.query(`DELETE FROM platform_commission_ledger WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM order_auto_confirm_releases WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM payment_capture_events WHERE order_id = $1`, [orderId]);
    await pool.query(`DELETE FROM escrow_holds WHERE order_id = $1`, [orderId]);
    return;
  }
  database!.prepare(`DELETE FROM platform_commission_ledger WHERE order_id = ?`).run(orderId);
  database!.prepare(`DELETE FROM order_auto_confirm_releases WHERE order_id = ?`).run(orderId);
  database!.prepare(`DELETE FROM payment_capture_events WHERE order_id = ?`).run(orderId);
  database!.prepare(`DELETE FROM escrow_holds WHERE order_id = ?`).run(orderId);
}

/** Dev/CI — concurrent holds must accrue exactly one commission ledger row per order. */
async function runConcurrentAccrueScenario(options: {
  workers: number;
  orderId: string;
  merchantId: string;
  amountMicro: number;
  database?: DatabaseSync;
}) {
  const worker = () =>
    holdEscrowForOrder(
      {
        order_id: options.orderId,
        amount_micro: options.amountMicro,
        reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
        event_key: `pcl-concurrent:${options.orderId}`,
        merchant_id: options.merchantId,
      },
      options.database,
    );

  const results = await Promise.all(Array.from({ length: options.workers }, () => worker()));
  const ledgerCount = await countLedgerForOrder(options.orderId, options.database);
  const holdIds = new Set(results.map((r) => r.hold_id));
  const firstHoldId = results[0]?.hold_id;
  const ledger = firstHoldId ? await readLedgerForHold(firstHoldId, options.database) : null;
  const expected = computeCommissionAmounts(options.amountMicro);

  const pass =
    holdIds.size === 1 &&
    ledgerCount === 1 &&
    ledger?.status === 'accrued' &&
    ledger.commission_micro === expected.commission_micro &&
    ledger.net_amount_micro === expected.net_amount_micro &&
    ledger.commission_rate === expected.commission_rate;

  return {
    pass,
    scenario: 'concurrent-accrue' as const,
    workers: options.workers,
    order_id: options.orderId,
    hold_ids: [...holdIds],
    ledger_count: ledgerCount,
    ledger_status: ledger?.status ?? null,
    commission_micro: ledger?.commission_micro ?? null,
    net_amount_micro: ledger?.net_amount_micro ?? null,
  };
}

/** Dev/CI — auto-confirm release marks commission released with frozen net amount. */
async function runReleaseNetScenario(options: {
  orderId: string;
  merchantId: string;
  amountMicro: number;
  database?: DatabaseSync;
}) {
  const { hold_id: holdId } = await holdEscrowForOrder(
    {
      order_id: options.orderId,
      amount_micro: options.amountMicro,
      reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
      event_key: `pcl-release:${options.orderId}`,
      merchant_id: options.merchantId,
    },
    options.database,
  );

  const expected = computeCommissionAmounts(options.amountMicro);
  const release = await releaseEscrowForOrderAutoConfirm(
    {
      order_id: options.orderId,
      merchant_id: options.merchantId,
      amount_micro: options.amountMicro,
      job_run_id: 'pcl-release-selftest',
    },
    options.database,
  );
  const ledger = await readLedgerForHold(holdId, options.database);

  const pass =
    release.released === true &&
    !release.duplicate &&
    ledger?.status === 'released' &&
    ledger.commission_micro === expected.commission_micro &&
    ledger.net_amount_micro === expected.net_amount_micro;

  return {
    pass,
    scenario: 'release-net' as const,
    order_id: options.orderId,
    hold_id: holdId,
    released: release.released,
    ledger_status: ledger?.status ?? null,
    commission_micro: ledger?.commission_micro ?? null,
    net_amount_micro: ledger?.net_amount_micro ?? null,
  };
}

/** Dev/CI — refund must not collect commission; ledger stays accrued. */
async function runRefundNoCollectScenario(options: {
  orderId: string;
  merchantId: string;
  buyerId: string;
  amountMicro: number;
  database?: DatabaseSync;
}) {
  const { hold_id: holdId } = await holdEscrowForOrder(
    {
      order_id: options.orderId,
      amount_micro: options.amountMicro,
      reason: MARKETPLACE_PAYMENT_ESCROW_REASON,
      event_key: `pcl-refund:${options.orderId}`,
      merchant_id: options.merchantId,
    },
    options.database,
  );

  const escrow = createEscrowDbAdapter(options.database);
  const refund = await escrow.refund({ hold_id: holdId, to_buyer_id: options.buyerId });
  const ledger = await readLedgerForHold(holdId, options.database);

  const pass =
    refund.status === 'refunded' &&
    ledger?.status === 'accrued';

  return {
    pass,
    scenario: 'refund-no-collect' as const,
    order_id: options.orderId,
    hold_id: holdId,
    refund_status: refund.status,
    ledger_status: ledger?.status ?? null,
  };
}

/** Dev/CI — platform commission accrue/release/refund integrity (SQLite + Postgres). */
export async function runPlatformCommissionSelfTest(options?: { workers?: number }) {
  const workers = options?.workers ?? 24;
  const usePostgres = getEscrowStorageBackend() === 'postgres';
  const tempDb = `${process.cwd()}/.data/platform-commission-selftest-${process.pid}.db`;
  const fs = await import('node:fs');

  if (!usePostgres) {
    try {
      if (fs.existsSync(tempDb)) fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const database = usePostgres ? undefined : openEscrowDatabaseAt(tempDb);
  const merchantId = 'e2e-merchant';
  const buyerId = `buyer-pcl-${Date.now().toString(36)}`;
  const amountMicro = 100000;
  const rate = getPlatformCommissionRate();

  const orderConcurrent = `ord-pcl-conc-${Date.now().toString(36)}`;
  const orderRelease = `ord-pcl-rel-${Date.now().toString(36)}`;
  const orderRefund = `ord-pcl-ref-${Date.now().toString(36)}`;

  const concurrent = await runConcurrentAccrueScenario({
    workers,
    orderId: orderConcurrent,
    merchantId,
    amountMicro,
    database,
  });
  await cleanupCommissionTest(orderConcurrent, database);

  const release = await runReleaseNetScenario({
    orderId: orderRelease,
    merchantId,
    amountMicro,
    database,
  });
  await cleanupCommissionTest(orderRelease, database);

  const refund = await runRefundNoCollectScenario({
    orderId: orderRefund,
    merchantId,
    buyerId,
    amountMicro,
    database,
  });
  await cleanupCommissionTest(orderRefund, database);

  if (!usePostgres) {
    database!.close();
    try {
      fs.unlinkSync(tempDb);
    } catch {
      /* ignore */
    }
  }

  const pass = concurrent.pass && release.pass && refund.pass;

  return {
    pass,
    backend: getEscrowStorageBackend(),
    commission_rate: rate,
    concurrent,
    release,
    refund,
  };
}
