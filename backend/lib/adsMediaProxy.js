import { rewriteUrlForAdsCdn } from './adsCdnRewrite.js';

/** Proxy S3 promo creatives through same-origin API (avoids ad-blockers on /ads/ paths). */

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_BUCKET_HOST =
  process.env.AWS_S3_BUCKET && process.env.AWS_REGION
    ? `${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`
    : 'aqond-uploads.s3.ap-southeast-1.amazonaws.com';

const ALLOWED_HOSTS = new Set(
  [
    DEFAULT_BUCKET_HOST,
    process.env.AWS_S3_PUBLIC_HOST,
    'aqond-uploads.s3.ap-southeast-1.amazonaws.com',
  ].filter(Boolean),
);

const ALLOWED_PATH_PREFIXES = ['/public/promotions/', '/public/ads/', '/videos/', '/images/'];

function promoAssetPath(encoded) {
  return `/api/promo/asset?u=${encoded}`;
}

function proxyIfNeeded(url) {
  if (!url) return url;
  const cdn = rewriteUrlForAdsCdn(url);
  return toPromoAssetUrl(cdn) || cdn;
}

function allowOrigin(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
}

function shouldProxyUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http')) return false;
  try {
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) return false;
    return ALLOWED_PATH_PREFIXES.some((p) => u.pathname.startsWith(p));
  } catch {
    return false;
  }
}

export function toPromoAssetUrl(rawUrl) {
  if (!shouldProxyUrl(rawUrl)) return rawUrl || '';
  const b64 = Buffer.from(String(rawUrl), 'utf8').toString('base64url');
  return promoAssetPath(b64);
}

export function rewriteSponsoredMediaUrls(items) {
  if (!Array.isArray(items)) return items || [];
  return items.map((item) => {
    if (item?.mixKind !== 'sponsored') return item;
    const rawVideoUrl = item.video_url;
    const video_url = proxyIfNeeded(rawVideoUrl) || rawVideoUrl;
    const thumbRaw = item.thumbnail_url;
    const thumbnail_url = thumbRaw
      ? thumbRaw !== rawVideoUrl
        ? proxyIfNeeded(thumbRaw) || thumbRaw
        : video_url
      : item.thumbnail_url;
    const ad = item.ad
      ? {
          ...item.ad,
          playbackUrl: proxyIfNeeded(item.ad.playbackUrl) || item.ad.playbackUrl,
          posterUrl: proxyIfNeeded(item.ad.posterUrl) || item.ad.posterUrl,
          fallbackImageUrl: proxyIfNeeded(item.ad.fallbackImageUrl) || item.ad.fallbackImageUrl,
          imageUrl: proxyIfNeeded(item.ad.imageUrl) || item.ad.imageUrl,
          thumbnailUrl: proxyIfNeeded(item.ad.thumbnailUrl) || item.ad.thumbnailUrl,
        }
      : item.ad;
    return { ...item, video_url, thumbnail_url, ad };
  });
}

export function registerPromoAssetRoute(app) {
  app.get('/api/promo/asset', async (req, res) => {
    try {
      const encoded = String(req.query.u || '').trim();
      if (!encoded) return res.status(400).json({ error: 'missing_u' });

      let target;
      try {
        target = Buffer.from(encoded, 'base64url').toString('utf8');
      } catch {
        return res.status(400).json({ error: 'invalid_u' });
      }

      if (!shouldProxyUrl(target)) return res.status(403).json({ error: 'forbidden_url' });

      const rangeHeader = req.headers.range;
      const upstream = await fetch(target, {
        signal: AbortSignal.timeout(60000),
        headers: rangeHeader ? { Range: rangeHeader } : undefined,
      });
      if (!upstream.ok) return res.status(502).json({ error: 'upstream_failed' });

      allowOrigin(req, res);
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=300');
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      if (rangeHeader && upstream.status === 206) {
        res.status(206);
      }

      if (upstream.body) {
        await pipeline(Readable.fromWeb(upstream.body), res);
      } else {
        res.end();
      }
    } catch (e) {
      if (!res.headersSent) {
        console.error('GET /api/promo/asset:', e?.message || e);
        res.status(500).json({ error: 'proxy_failed' });
      }
    }
  });
}
