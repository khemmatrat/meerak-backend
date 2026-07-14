/** Merge sponsored ad slots into organic feed items */

const VIDEO_FEED_INSERT_AT = [1, 6, 11, 16, 21];
const MARKETPLACE_INSERT_AT = [2, 8, 14];

const VIDEO_EXT = /\.(mp4|webm|mov|m3u8)(\?|$)/i;

function isVideoPath(url) {
  if (!url) return false;
  const s = String(url);
  return VIDEO_EXT.test(s) || s.includes('/ads/videos/');
}

function isImagePosterUrl(url) {
  if (!url) return false;
  const s = String(url);
  if (isVideoPath(s)) return false;
  return (
    s.includes('/ads/images/') ||
    /\.(jpe?g|png|webp|gif)(\?|$)/i.test(s) ||
    (!s.includes('/ads/videos/') && s.startsWith('http'))
  );
}

function inferVideoCreative(meta) {
  const contentKind = meta.contentKind || '';
  if (contentKind === 'TALENT_VIDEO' || contentKind === 'USER_STORY') return true;
  if (contentKind === 'IMAGE') return false;
  const playbackUrl = String(meta.playbackUrl || '');
  const imageUrl = String(meta.imageUrl || '');
  const thumbUrl = String(meta.thumbnailUrl || '');
  return [playbackUrl, imageUrl, thumbUrl].some((u) => isVideoPath(u));
}

function resolvePlaybackUrl(meta, isVideoCreative) {
  if (meta.playbackUrl) return meta.playbackUrl;
  if (!isVideoCreative) return '';
  const imageUrl = String(meta.imageUrl || '');
  if (isVideoPath(imageUrl)) return imageUrl;
  return '';
}

function resolvePosterUrl(meta, isVideoCreative) {
  if (!isVideoCreative) return null;
  const candidates = [meta.posterUrl, meta.thumbnailUrl, meta.imageUrl];
  for (const c of candidates) {
    if (c && isImagePosterUrl(c)) return c;
  }
  return null;
}

function resolveFallbackImageUrl(meta, isVideoCreative) {
  if (isVideoCreative) {
    return resolvePosterUrl(meta, true) || null;
  }
  return meta.imageUrl || meta.thumbnailUrl || meta.playbackUrl || null;
}

function resolveImageUrl(meta, isVideoCreative) {
  if (isVideoCreative) return resolvePosterUrl(meta, true);
  return meta.imageUrl || meta.thumbnailUrl || null;
}

export function sponsoredSlotToFeedItem(slot) {
  const meta = slot.metadata || {};
  const isVideoCreative = inferVideoCreative(meta);
  const mediaType = isVideoCreative ? 'video' : 'image';
  const playbackUrl = isVideoCreative ? resolvePlaybackUrl(meta, true) : null;
  const posterUrl = resolvePosterUrl(meta, isVideoCreative);
  const fallbackImageUrl = resolveFallbackImageUrl(meta, isVideoCreative);
  const imageUrl = resolveImageUrl(meta, isVideoCreative);
  const mediaUrl = isVideoCreative
    ? playbackUrl || ''
    : fallbackImageUrl || imageUrl || '';

  return {
    id: `ad-${slot.publicImpressionId}`,
    mixKind: 'sponsored',
    mediaType,
    talent_id: meta.talentId || slot.promotedProviderUserId || '',
    video_url: mediaUrl || '',
    thumbnail_url: isVideoCreative ? posterUrl : imageUrl || fallbackImageUrl,
    title: slot.headline || 'โปรโมต',
    description: slot.bodyPreview || '',
    duration_seconds: meta.durationSec || null,
    created_at: new Date().toISOString(),
    talent_name: null,
    talent_avatar: null,
    like_count: 0,
    comment_count: 0,
    liked_by_me: false,
    ad: {
      publicImpressionId: slot.publicImpressionId,
      creativeId: slot.creativeId,
      campaignId: slot.campaignId,
      destinationUrl: slot.destinationUrl,
      contentKind: meta.contentKind || (isVideoCreative ? 'TALENT_VIDEO' : 'IMAGE'),
      mediaType,
      playbackUrl: playbackUrl || null,
      posterUrl: posterUrl || null,
      fallbackImageUrl: fallbackImageUrl || null,
      billingMode: meta.billingMode || (isVideoCreative ? 'video_view' : 'impression'),
      isHouse: !!meta.isHouse,
      imageUrl: meta.imageUrl || null,
      thumbnailUrl: meta.thumbnailUrl || null,
      abVariant: meta.abVariant || slot.abVariantKey || null,
    },
  };
}

export function mergeAdsIntoVideoFeed(organicVideos, adSlots) {
  const organic = organicVideos || [];
  if (!adSlots?.length) return organic;
  if (!organic.length) {
    return adSlots.map(sponsoredSlotToFeedItem);
  }
  const items = [...organic];
  let slotIdx = 0;
  for (const pos of VIDEO_FEED_INSERT_AT) {
    if (slotIdx >= adSlots.length) break;
    const insertAt = Math.min(pos + slotIdx, items.length);
    items.splice(insertAt, 0, sponsoredSlotToFeedItem(adSlots[slotIdx]));
    slotIdx += 1;
  }
  return items;
}

export function sponsoredSlotToStorySlide(slot) {
  const meta = slot.metadata || {};
  const isVideo = inferVideoCreative(meta);
  const mediaUrl = isVideo
    ? resolvePlaybackUrl(meta, true) || meta.playbackUrl
    : resolveFallbackImageUrl(meta, false) || meta.thumbnailUrl;
  return {
    id: `ad-${slot.publicImpressionId}`,
    mixKind: 'sponsored',
    user_id: meta.talentId || slot.promotedProviderUserId || 'platform',
    media_type: isVideo ? 'video' : 'image',
    media_url: mediaUrl || null,
    text_overlay: slot.headline || slot.bodyPreview || null,
    background_style: {},
    expires_at: null,
    created_at: new Date().toISOString(),
    user_name: 'โปรโมต',
    user_avatar: null,
    ad: {
      publicImpressionId: slot.publicImpressionId,
      creativeId: slot.creativeId,
      campaignId: slot.campaignId,
      destinationUrl: slot.destinationUrl,
      contentKind: meta.contentKind,
      mediaType: isVideo ? 'video' : 'image',
    },
  };
}

export function mergeAdsIntoStoryList(organicStories, adSlots) {
  if (!adSlots?.length) return organicStories || [];
  const stories = [...(organicStories || [])];
  const insertAt = Math.min(1, stories.length);
  stories.splice(insertAt, 0, sponsoredSlotToStorySlide(adSlots[0]));
  if (adSlots[1] && stories.length > 3) {
    stories.splice(3, 0, sponsoredSlotToStorySlide(adSlots[1]));
  }
  return stories;
}

export function sponsoredSlotToMarketplaceProvider(slot) {
  const meta = slot.metadata || {};
  const isVideo = inferVideoCreative(meta);
  const imageUrl =
    resolveFallbackImageUrl(meta, isVideo) ||
    resolveImageUrl(meta, isVideo) ||
    meta.imageUrl ||
    null;
  return {
    id: `ad-${slot.publicImpressionId}`,
    mixKind: 'sponsored',
    is_sponsored: true,
    name: slot.headline || 'โปรโมต',
    signature_service: slot.bodyPreview || 'โปรโมชันพิเศษ',
    avatar_url: imageUrl,
    portfolio_urls: imageUrl ? [imageUrl] : [],
    rating: 5,
    completedJobs: 0,
    completed_jobs_count: 0,
    status: 'available',
    expert_category: 'sponsored',
    ad: {
      publicImpressionId: slot.publicImpressionId,
      creativeId: slot.creativeId,
      campaignId: slot.campaignId,
      destinationUrl: slot.destinationUrl,
      contentKind: meta.contentKind || (isVideo ? 'TALENT_VIDEO' : 'IMAGE'),
      mediaType: isVideo ? 'video' : 'image',
      playbackUrl: isVideo ? resolvePlaybackUrl(meta, true) : null,
      posterUrl: resolvePosterUrl(meta, isVideo),
      fallbackImageUrl: imageUrl,
      imageUrl,
    },
  };
}

export function mergeAdsIntoMarketplaceList(organicProviders, adSlots) {
  const organic = organicProviders || [];
  if (!adSlots?.length) return organic;
  if (!organic.length) {
    return adSlots.map(sponsoredSlotToMarketplaceProvider);
  }
  const items = [...organic];
  let slotIdx = 0;
  for (const pos of MARKETPLACE_INSERT_AT) {
    if (slotIdx >= adSlots.length) break;
    const insertAt = Math.min(pos, items.length);
    items.splice(insertAt, 0, sponsoredSlotToMarketplaceProvider(adSlots[slotIdx]));
    slotIdx += 1;
  }
  return items;
}

export function sponsoredSlotToPromoBanner(slot) {
  const meta = slot.metadata || {};
  const isVideo = inferVideoCreative(meta);
  const imageUrl =
    resolveFallbackImageUrl(meta, isVideo) ||
    resolveImageUrl(meta, isVideo) ||
    meta.imageUrl ||
    null;
  return {
    id: `ad-${slot.publicImpressionId}`,
    mixKind: 'sponsored',
    headline: slot.headline || 'โปรโมต',
    bodyPreview: slot.bodyPreview || '',
    imageUrl,
    ad: {
      publicImpressionId: slot.publicImpressionId,
      creativeId: slot.creativeId,
      campaignId: slot.campaignId,
      destinationUrl: slot.destinationUrl,
      imageUrl,
      contentKind: meta.contentKind || 'IMAGE',
      mediaType: isVideo ? 'video' : 'image',
    },
  };
}

export function viewerCacheKey(userId, sessionId) {
  return userId ? String(userId) : `anon:${sessionId || 'x'}`;
}
