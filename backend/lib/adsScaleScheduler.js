/**
 * Ads scale background services — daily reconciliation + optimization runner.
 */

let reconTimer = null;
let optimizationTimer = null;
let lastReconAt = null;
let lastReconReport = null;
let lastOptimizationAt = null;
let lastOptimizationResult = null;

export function getAdsScaleSchedulerHeartbeat() {
  return {
    dailyReconEnabled: process.env.ADS_DAILY_RECON_ENABLED === '1',
    optimizationEnabled: process.env.ADS_OPTIMIZATION_ENABLED === '1',
    warehouseEnabled: process.env.ADS_WAREHOUSE_ENABLED === '1',
    escrowExpiryEnabled: process.env.ADS_ESCROW_EXPIRY_ENABLED === '1',
    lastReconAt,
    lastReconReport,
    lastOptimizationAt,
    lastOptimizationResult,
    alive: !!(reconTimer || optimizationTimer),
  };
}

export function startAdsScaleServices(pool, redisClient) {
  if (!pool) return;
  const hourMs = 60 * 60 * 1000;

  if (process.env.ADS_DAILY_RECON_ENABLED === '1') {
  const run = async () => {
    try {
      const { buildAdsReconciliationReport } = await import('./adsReconciliation.js');
      const report = await buildAdsReconciliationReport(pool, { rangeDays: 1 });
      lastReconAt = new Date().toISOString();
      lastReconReport = report;
      console.log('[ads] daily reconciliation snapshot', {
        billable: report.billableDeliveryEvents,
        failed: report.failedRenderEvents,
        walletSpendThb: report.walletSpendThb,
      });
      if (redisClient) {
        await redisClient.setEx(
          'ads:recon:last',
          86400 * 14,
          JSON.stringify({ at: lastReconAt, report }),
        );
      }
    } catch (e) {
      console.warn('[ads] daily reconciliation failed:', e?.message || e);
    }
  };

  reconTimer = setInterval(run, 24 * hourMs);
  setTimeout(run, 15000);
  console.log('✅ Ads scale scheduler: daily reconciliation enabled');
  }

  if (process.env.ADS_OPTIMIZATION_ENABLED === '1') {
    const runOptimization = async () => {
      try {
        const { runAdsOptimizationBatch } = await import('./adsOptimizationRunner.js');
        const out = await runAdsOptimizationBatch(pool, { limit: 50, dryRun: false });
        lastOptimizationAt = new Date().toISOString();
        lastOptimizationResult = {
          processed: out.processed,
          warned: out.warned,
          paused: out.paused,
        };
        console.log('[ads] optimization batch', lastOptimizationResult);
        if (redisClient && lastOptimizationResult) {
          await redisClient.setEx(
            'ads:optimization:last',
            86400 * 7,
            JSON.stringify({ at: lastOptimizationAt, ...lastOptimizationResult }),
          );
        }
      } catch (e) {
        console.warn('[ads] optimization batch failed:', e?.message || e);
      }
    };
    const optIntervalMs = 6 * hourMs;
    optimizationTimer = setInterval(runOptimization, optIntervalMs);
    setTimeout(runOptimization, 60000);
    console.log('✅ Ads scale scheduler: optimization runner enabled (6h)');
  }

  if (process.env.ADS_WAREHOUSE_ENABLED === '1') {
    const runWarehouse = async () => {
      try {
        const { processAdsOutboxBatch } = await import('./adsOutboxConsumer.js');
        const out = await processAdsOutboxBatch(pool, { limit: 200 });
        console.log('[ads] warehouse outbox batch', out);
      } catch (e) {
        console.warn('[ads] warehouse batch failed:', e?.message || e);
      }
    };
    setInterval(runWarehouse, 5 * 60 * 1000);
    setTimeout(runWarehouse, 30000);
    console.log('✅ Ads scale scheduler: warehouse consumer enabled (5m)');
  }

  if (process.env.ADS_ESCROW_EXPIRY_ENABLED === '1') {
    const runExpiry = async () => {
      try {
        const { releaseExpiredCampaignEscrows } = await import('./adsEscrowLifecycle.js');
        const out = await releaseExpiredCampaignEscrows(pool, { limit: 20 });
        if (out.released > 0) console.log('[ads] expired escrow release', out);
      } catch (e) {
        console.warn('[ads] escrow expiry failed:', e?.message || e);
      }
    };
    setInterval(runExpiry, 12 * hourMs);
    setTimeout(runExpiry, 120000);
    console.log('✅ Ads scale scheduler: escrow expiry enabled (12h)');
  }
}
