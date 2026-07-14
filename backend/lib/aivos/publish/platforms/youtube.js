import { randomUUID } from 'crypto';

/**
 * YouTube platform adapter.
 * Real implementation would use YouTube Data API v3 (videos.insert).
 */
export function createYouTubeAdapter(deps = {}) {
  const apiClient = deps.apiClient || null;

  async function publish(artifact, options = {}) {
    const videoId = randomUUID().replace(/-/g, '').slice(0, 11);

    if (apiClient) {
      const res = await apiClient.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: options.title || 'AQOND AI Video',
            description: options.description || '',
            tags: options.tags || [],
          },
          status: {
            privacyStatus: options.privacy || 'public',
          },
        },
        media: { body: artifact.uri },
      });
      return {
        platform: 'youtube',
        published_id: res.data?.id || videoId,
        published_url: `https://youtu.be/${res.data?.id || videoId}`,
        status: 'published',
        published_at: new Date().toISOString(),
        raw: res,
      };
    }

    return {
      platform: 'youtube',
      published_id: videoId,
      published_url: `https://youtu.be/${videoId}`,
      status: 'published',
      published_at: new Date().toISOString(),
      stub: true,
    };
  }

  async function getStatus(publishedId) {
    return { platform: 'youtube', published_id: publishedId, status: 'published' };
  }

  return { platform: 'youtube', publish, getStatus };
}

export default createYouTubeAdapter;
