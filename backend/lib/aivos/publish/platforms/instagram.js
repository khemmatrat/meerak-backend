import { randomUUID } from 'crypto';

/**
 * Instagram platform adapter.
 * Real implementation uses Instagram Graph API (media/publish endpoints).
 */
export function createInstagramAdapter(deps = {}) {
  const apiClient = deps.apiClient || null;
  const igUserId = deps.igUserId || process.env.IG_USER_ID || 'aqond_ig';

  async function publish(artifact, options = {}) {
    const publishId = randomUUID();

    if (apiClient) {
      // Step 1: create media container
      const container = await apiClient.post(`/${igUserId}/media`, {
        video_url: artifact.uri,
        caption: options.caption || '',
        media_type: 'REELS',
      });
      // Step 2: publish container
      const res = await apiClient.post(`/${igUserId}/media_publish`, {
        creation_id: container.id,
      });
      return {
        platform: 'instagram',
        published_id: res.id || publishId,
        published_url: `https://www.instagram.com/reel/${res.id || publishId}`,
        status: 'published',
        published_at: new Date().toISOString(),
        raw: res,
      };
    }

    return {
      platform: 'instagram',
      published_id: publishId,
      published_url: `https://www.instagram.com/reel/${publishId}`,
      status: 'published',
      published_at: new Date().toISOString(),
      stub: true,
    };
  }

  async function getStatus(publishedId) {
    return { platform: 'instagram', published_id: publishedId, status: 'published' };
  }

  return { platform: 'instagram', publish, getStatus };
}

export default createInstagramAdapter;
