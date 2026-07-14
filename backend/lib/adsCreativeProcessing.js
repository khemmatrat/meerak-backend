/**
 * Creative URL probe — validates browser-playable assets before delivery.
 */

const VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function isVideoUrl(url) {
  if (!url) return false;
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('/ads/videos/');
}

function isImageUrl(url) {
  if (!url) return false;
  if (isVideoUrl(url)) return false;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url) || url.includes('/ads/images/');
}

async function fetchHead(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
    });
    return res;
  } catch {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: ctrl.signal,
      });
      return res;
    } catch (e) {
      return { ok: false, headers: new Map(), status: 0, error: e };
    }
  } finally {
    clearTimeout(t);
  }
}

function headerGet(res, name) {
  if (!res?.headers) return '';
  if (typeof res.headers.get === 'function') return res.headers.get(name) || '';
  return '';
}

/**
 * @param {string} url
 * @param {{ contentKind?: string }} [opts]
 * @returns {Promise<{ status: 'READY'|'FAILED'|'PROCESSING', reason?: string, contentType?: string, acceptRanges?: string }>}
 */
export async function probeCreativeUrl(url, opts = {}) {
  if (!url || !url.startsWith('http')) {
    return { status: 'FAILED', reason: 'invalid_url' };
  }

  const kind = opts.contentKind || '';
  const expectVideo = kind === 'TALENT_VIDEO' || kind === 'USER_STORY' || isVideoUrl(url);
  const expectImage = kind === 'IMAGE' || (!expectVideo && isImageUrl(url));

  const res = await fetchHead(url);
  if (!res.ok) {
    return { status: 'FAILED', reason: `upstream_${res.status || 'unreachable'}` };
  }

  const contentType = (headerGet(res, 'content-type') || '').split(';')[0].trim().toLowerCase();
  const acceptRanges = headerGet(res, 'accept-ranges') || '';

  if (expectVideo) {
    if (!VIDEO_TYPES.has(contentType) && !isVideoUrl(url)) {
      return { status: 'FAILED', reason: `invalid_video_type:${contentType || 'unknown'}` };
    }
    if (acceptRanges.toLowerCase() !== 'bytes') {
      return {
        status: 'READY',
        reason: 'no_accept_ranges',
        contentType,
        acceptRanges,
      };
    }
    return { status: 'READY', contentType, acceptRanges };
  }

  if (expectImage) {
    if (!IMAGE_TYPES.has(contentType) && !isImageUrl(url)) {
      return { status: 'FAILED', reason: `invalid_image_type:${contentType || 'unknown'}` };
    }
    return { status: 'READY', contentType };
  }

  return { status: 'FAILED', reason: 'unknown_creative_kind' };
}

/**
 * Run render preflight on creative metadata URLs.
 * @returns {Promise<{ renderPreflightStatus: 'PASS'|'FAIL', reason?: string, probe?: object }>}
 */
export async function runRenderPreflight(meta = {}) {
  const contentKind = meta.contentKind || '';
  const isVideo = contentKind === 'TALENT_VIDEO' || contentKind === 'USER_STORY' || isVideoUrl(meta.playbackUrl);
  const targetUrl = isVideo
    ? meta.playbackUrl || meta.imageUrl
    : meta.imageUrl || meta.thumbnailUrl || meta.playbackUrl;

  if (!targetUrl) {
    return { renderPreflightStatus: 'FAIL', reason: 'missing_media_url' };
  }

  const probe = await probeCreativeUrl(targetUrl, { contentKind });
  if (probe.status === 'FAILED') {
    return { renderPreflightStatus: 'FAIL', reason: probe.reason, probe };
  }
  return { renderPreflightStatus: 'PASS', probe };
}

/**
 * Enrich metadata with processing + preflight results.
 */
export async function processCreativeMetadata(meta = {}) {
  const contentKind = meta.contentKind || '';
  const isVideo = contentKind === 'TALENT_VIDEO' || contentKind === 'USER_STORY';
  const targetUrl = isVideo
    ? meta.playbackUrl
    : meta.imageUrl || meta.thumbnailUrl;

  if (!targetUrl) {
    return {
      ...meta,
      processingStatus: 'FAILED',
      processingReason: 'missing_media_url',
      renderPreflightStatus: 'FAIL',
    };
  }

  const probe = await probeCreativeUrl(targetUrl, { contentKind });
  const preflight = probe.status === 'READY'
    ? await runRenderPreflight(meta)
    : { renderPreflightStatus: 'FAIL', reason: probe.reason };

  return {
    ...meta,
    processingStatus: probe.status === 'READY' ? 'READY' : 'FAILED',
    processingReason: probe.reason || null,
    renderPreflightStatus: preflight.renderPreflightStatus,
    renderPreflightReason: preflight.reason || null,
    posterUrl: isVideo ? (meta.posterUrl || (isImageUrl(meta.thumbnailUrl) ? meta.thumbnailUrl : null)) : null,
  };
}

export function isDeliverableCreative(meta = {}) {
  const st = meta.processingStatus ?? 'READY';
  const pf = meta.renderPreflightStatus ?? 'PASS';
  return st === 'READY' && pf === 'PASS';
}
