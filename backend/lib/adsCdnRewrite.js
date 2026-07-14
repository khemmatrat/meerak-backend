/**
 * Optional CDN rewrite for ad creative playback URLs (HLS/CDN rollout).
 */

function s3Hosts() {
  const hosts = new Set([
    'aqond-uploads.s3.ap-southeast-1.amazonaws.com',
    process.env.AWS_S3_PUBLIC_HOST,
  ]);
  if (process.env.AWS_S3_BUCKET && process.env.AWS_REGION) {
    hosts.add(`${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com`);
  }
  return [...hosts].filter(Boolean);
}

export function rewriteUrlForAdsCdn(url) {
  const cdnBase = String(process.env.ADS_CDN_BASE_URL || '').replace(/\/+$/, '');
  if (!cdnBase || !url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    if (!s3Hosts().includes(u.hostname)) return url;
    return `${cdnBase}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

export function rewriteCreativeUrlsForCdn(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const out = { ...meta };
  for (const key of ['playbackUrl', 'posterUrl', 'imageUrl', 'thumbnailUrl', 'fallbackImageUrl']) {
    if (out[key]) out[key] = rewriteUrlForAdsCdn(out[key]);
  }
  if (out.hlsPlaylistUrl) out.hlsPlaylistUrl = rewriteUrlForAdsCdn(out.hlsPlaylistUrl);
  return out;
}
