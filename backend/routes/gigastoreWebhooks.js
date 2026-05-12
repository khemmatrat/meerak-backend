/**
 * GigaStore portal → Support Webhooks (HTTPS only).
 * Register each URL in https://dent.giga.store — one endpoint per event type.
 * Docs: https://docs.giga.store/webhooks
 *
 * Optional: set GIGASTORE_WEBHOOK_SECRET and send the same value in header
 * X-Gigastore-Webhook-Secret (or X-Webhook-Secret).
 */

function verifyWebhookSecret(req, res, next) {
  const secret = process.env.GIGASTORE_WEBHOOK_SECRET;
  if (!secret) return next();
  const got =
    req.headers['x-gigastore-webhook-secret'] ||
    req.headers['x-webhook-secret'];
  if (got !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function mergeMetadata(pool, iccid, patch) {
  if (!iccid) return Promise.resolve({ rowCount: 0 });
  return pool.query(
    `UPDATE user_digital_assets
     SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
     WHERE gigastore_order_ref = $1`,
    [iccid, JSON.stringify(patch)]
  );
}

/**
 * @param {import('express').Express} app
 * @param {{ pool: import('pg').Pool }} deps
 */
export function registerGigastoreWebhookRoutes(app, { pool }) {
  const base = '/api/webhooks/gigastore';

  // eSIM Status — iccid, imsi, profileState, optional eid
  app.post(
    `${base}/esim-status`,
    verifyWebhookSecret,
    async (req, res) => {
      const { iccid, imsi, profileState, eid } = req.body || {};
      try {
        const patch = {
          esim_profile_state: profileState ?? null,
          esim_imsi: imsi ?? null,
          esim_eid: eid ?? null,
          esim_last_webhook_at: new Date().toISOString(),
        };
        const r = await mergeMetadata(pool, iccid, patch);
        if (iccid && r.rowCount === 0) {
          console.warn(
            '[gigastore-webhook] esim-status: no user_digital_assets row for iccid',
            iccid
          );
        }
      } catch (e) {
        console.error('[gigastore-webhook] esim-status', e);
      }
      return res.status(200).json({ ok: true });
    }
  );

  // Balance Alert — uid, iccid, imsi, timestamp, balanceAmountInByte
  app.post(
    `${base}/balance-alert`,
    verifyWebhookSecret,
    async (req, res) => {
      const { uid, iccid, imsi, timestamp, balanceAmountInByte } =
        req.body || {};
      try {
        const patch = {
          gigastore_balance_alert: {
            uid: uid ?? null,
            imsi: imsi ?? null,
            timestamp: timestamp ?? null,
            balanceAmountInByte: balanceAmountInByte ?? null,
            at: new Date().toISOString(),
          },
        };
        const r = await mergeMetadata(pool, iccid, patch);
        if (iccid && r.rowCount === 0) {
          console.warn(
            '[gigastore-webhook] balance-alert: no asset for iccid',
            iccid
          );
        }
      } catch (e) {
        console.error('[gigastore-webhook] balance-alert', e);
      }
      return res.status(200).json({ ok: true });
    }
  );

  // Country Change — imsi, iccid, previousCountry, newCountry
  app.post(
    `${base}/country-change`,
    verifyWebhookSecret,
    async (req, res) => {
      const { imsi, iccid, previousCountry, newCountry } = req.body || {};
      try {
        const patch = {
          esim_country_change: {
            imsi: imsi ?? null,
            previousCountry: previousCountry ?? null,
            newCountry: newCountry ?? null,
            at: new Date().toISOString(),
          },
        };
        const r = await mergeMetadata(pool, iccid, patch);
        if (iccid && r.rowCount === 0) {
          console.warn(
            '[gigastore-webhook] country-change: no asset for iccid',
            iccid
          );
        }
      } catch (e) {
        console.error('[gigastore-webhook] country-change', e);
      }
      return res.status(200).json({ ok: true });
    }
  );

  // Balance Activation — uid, activatedItem, activatedAt, expiresAt (no iccid in docs; log + optional merge)
  app.post(
    `${base}/balance-activation`,
    verifyWebhookSecret,
    async (req, res) => {
      const body = req.body || {};
      const iccid =
        body.iccid ||
        body.activatedItem?.iccid ||
        body.activatedItem?.iccidEid;
      try {
        console.log(
          '[gigastore-webhook] balance-activation',
          JSON.stringify(body)
        );
        if (iccid) {
          const patch = {
            gigastore_balance_activation: {
              uid: body.uid ?? null,
              activatedAt: body.activatedAt ?? null,
              expiresAt: body.expiresAt ?? null,
              at: new Date().toISOString(),
            },
          };
          await mergeMetadata(pool, iccid, patch);
        }
      } catch (e) {
        console.error('[gigastore-webhook] balance-activation', e);
      }
      return res.status(200).json({ ok: true });
    }
  );

  // Customer registration — schema varies; acknowledge and log
  app.post(
    `${base}/customer-registration`,
    verifyWebhookSecret,
    async (req, res) => {
      try {
        console.log(
          '[gigastore-webhook] customer-registration',
          JSON.stringify(req.body || {})
        );
      } catch (e) {
        console.error('[gigastore-webhook] customer-registration', e);
      }
      return res.status(200).json({ ok: true });
    }
  );
}
