import { randomUUID } from 'crypto';

/**
 * TikTok platform adapter.
 * Real implementation would use TikTok Content Posting API v2.
 * Stub returns deterministic published_url for tests.
 */
export function createTikTokAdapter(deps = {}) {
  const apiClient = deps.apiClient || null;

  async function publish(artifact, options = {}) {
    const publishId = randomUUID();

    if (apiClient) {
      const res = await apiClient.post('/v2/post/video/init', {
        post_info: {
          title: options.title || 'AQOND AI Video',
          privacy_level: options.privacy || 'PUBLIC_TO_EVERYONE',
        },
        source_info: { source: 'FILE_UPLOAD', video_url: artifact.uri },
      });
      return {
        platform: 'tiktok',
        published_id: res.data?.publish_id || publishId,
        published_url: `https://www.tiktok.com/@${options.username || 'user'}/video/${res.data?.publish_id || publishId}`,
        status: 'published',
        published_at: new Date().toISOString(),
        raw: res,
      };
    }

    return {
      platform: 'tiktok',
      published_id: publishId,
      published_url: `https://www.tiktok.com/@${options.username || 'aqond'}/video/${publishId}`,
      status: 'published',
      published_at: new Date().toISOString(),
      stub: true,
    };
  }

  async function getStatus(publishedId) {
    return { platform: 'tiktok', published_id: publishedId, status: 'published' };
  }

  return { platform: 'tiktok', publish, getStatus };
}

export default createTikTokAdapter;
