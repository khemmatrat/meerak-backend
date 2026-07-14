import fs from 'fs/promises';
import path from 'path';
import { OUT_DIR } from './merchantAdStorage.js';

function envelope(data, meta = {}) {
  return { ok: true, data, meta: { version: '21.1.0', module: 'merchant-ad', ...meta } };
}

function mapError(e) {
  const code = e?.code || '';
  if (code === 'MERCHANT_AD_QUOTA_EXCEEDED') return 429;
  if (code === 'MERCHANT_AD_INSUFFICIENT_TOKENS') return 402;
  if (code === 'MERCHANT_AD_MIN_TOPUP') return 400;
  if (code === 'MERCHANT_AD_FORBIDDEN') return 403;
  if (code === 'validation_failed' || code === 'capability_unavailable') return 400;
  if (code === 'MERCHANT_AD_JOB_NOT_FOUND') return 404;
  if (code === 'MERCHANT_AD_BRIEF_DISABLED') return 503;
  return 500;
}

function mountRoutes(app, basePath, { merchantAd, auth }) {
  const p = (route) => `${basePath}${route}`;
  const devKey = String(process.env.AIVOS_MERCHANT_AD_DEV_KEY || '').trim();
  const guard = devKey
    ? (req, res, next) => {
        if (req.headers['x-aivos-merchant-ad-key'] === devKey) {
          req.user = req.user || { userId: 'storefront-dev' };
          return next();
        }
        return auth(req, res, next);
      }
    : auth;

  app.get(p('/health'), guard, (_req, res) => {
    res.json({ ok: true, health: merchantAd.health() });
  });

  app.get(p('/quota'), guard, async (req, res) => {
    try {
      const merchantId = req.query.merchant_id || req.query.merchantId;
      const quota = await merchantAd.quota({ merchantId });
      res.json(envelope({ quota }));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.get(p('/jobs'), guard, async (req, res) => {
    try {
      const merchantId = req.query.merchant_id || req.query.merchantId;
      const jobs = await merchantAd.listJobs({ merchantId });
      const quota = await merchantAd.quota({ merchantId });
      res.json(envelope({ jobs, quota }));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.get(p('/jobs/:jobId'), guard, async (req, res) => {
    const job = await merchantAd.getJob({ jobId: req.params.jobId });
    if (!job) return res.status(404).json({ ok: false, error: 'MERCHANT_AD_JOB_NOT_FOUND' });
    res.json(envelope({ job }));
  });

  app.get(p('/economics'), guard, (_req, res) => {
    res.json(envelope({ economics: merchantAd.tokenEconomics() }));
  });

  app.post(p('/tokens/topup'), guard, async (req, res) => {
    try {
      const b = req.body || {};
      const result = await merchantAd.topUp({
        merchantId: b.merchant_id || b.merchantId,
        packageId: b.package_id || b.packageId,
        customThb: b.custom_thb ?? b.customThb,
        paymentRef: b.payment_ref || b.paymentRef,
      });
      const quota = await merchantAd.quota({ merchantId: b.merchant_id || b.merchantId });
      res.json(envelope({ ...result, quota }));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message, details: e.details });
    }
  });

  app.post(p('/brief'), guard, async (req, res) => {
    try {
      const result = await merchantAd.createBrief(req.body || {});
      res.json(envelope(result));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.post(p('/generate'), guard, async (req, res) => {
    try {
      const b = req.body || {};
      const result = await merchantAd.generate({
        merchantId: b.merchant_id,
        ownerId: b.owner_id,
        productId: b.product_id,
        productTitle: b.product_title,
        productImageUrl: b.product_image_url,
        brief: b.brief,
        guide: b.guide,
      });
      res.json(envelope(result));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message, quota: e.quota });
    }
  });

  app.post(p('/director/plan'), guard, async (req, res) => {
    try {
      const b = req.body || {};
      const result = await merchantAd.director.plan({
        merchant_id: b.merchant_id,
        owner_id: b.owner_id,
        product_id: b.product_id,
        product_title: b.product_title,
        product_image_url: b.product_image_url,
        portrait_image_url: b.portrait_image_url,
        guide: b.guide,
        format: b.format,
        style_id: b.style_id,
        category_id: b.category_id,
        price_thb: b.price_thb,
        promo_text: b.promo_text,
        target_audience: b.target_audience,
        auto_publish: b.auto_publish,
        merchant_name: b.merchant_name,
      });
      res.json(envelope(result));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message, details: e.details });
    }
  });

  app.post(p('/director/run'), guard, async (req, res) => {
    try {
      const b = req.body || {};
      const result = await merchantAd.director.run({
        merchant_id: b.merchant_id,
        owner_id: b.owner_id,
        product_id: b.product_id,
        product_title: b.product_title,
        product_image_url: b.product_image_url,
        portrait_image_url: b.portrait_image_url,
        brief: b.brief,
        guide: b.guide,
        format: b.format,
        style_id: b.style_id,
        category_id: b.category_id,
        price_thb: b.price_thb,
        promo_text: b.promo_text,
        target_audience: b.target_audience,
        auto_publish: b.auto_publish,
        merchant_name: b.merchant_name,
      });
      res.json(envelope(result));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message, quota: e.quota, details: e.details });
    }
  });

  app.post(p('/jobs/:jobId/publish'), guard, async (req, res) => {
    try {
      const result = await merchantAd.publish({
        jobId: req.params.jobId,
        target: req.body?.target,
        studioResult: req.body?.studio_result,
      });
      res.json(envelope(result));
    } catch (e) {
      res.status(mapError(e)).json({ ok: false, error: e.code || e.message });
    }
  });

  app.get(p('/files/:jobId/:file'), guard, async (req, res) => {
    const { jobId, file } = req.params;
    if (!/^mad-[a-f0-9]+$/.test(jobId) || file.includes('..')) {
      return res.status(400).json({ ok: false, error: 'invalid_path' });
    }
    const filePath = path.join(OUT_DIR, jobId, file);
    try {
      const buf = await fs.readFile(filePath);
      const type = file.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
      res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(buf);
    } catch {
      res.status(404).json({ ok: false, error: 'not_found' });
    }
  });
}

export function registerMerchantAdRoutes(app, { merchantAd, authenticateToken, merchantAdEnabled } = {}) {
  const auth = authenticateToken || ((_q, _s, n) => n());

  if (!merchantAdEnabled || !merchantAd?.enabled) {
    app.use('/api/aivos/merchant-ad', (_req, res) => {
      res.status(503).json({
        error: 'aivos_merchant_ad_disabled',
        hint: 'Set AIVOS_MERCHANT_AD_ENABLED=1 and AIVOS_RUNTIME_ENABLED=1',
      });
    });
    return { enabled: false };
  }

  mountRoutes(app, '/api/aivos/merchant-ad', { merchantAd, auth });
  mountRoutes(app, '/api/aivos/merchant-ad/v1', { merchantAd, auth });
  return { enabled: true };
}
