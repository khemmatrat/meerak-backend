import { randomUUID } from 'crypto';

/**
 * Facebook platform adapter.
 * Real implementation would use Facebook Graph API (Reels / Video).
 */
export function createFacebookAdapter(deps = {}) {
  const apiClient = deps.apiClient || null;
  const pageId = deps.pageId || process.env.FB_PAGE_ID || 'aqond_page';

  async function publish(artifact, options = {}) {
    const publishId = randomUUID();

    if (apiClient) {
      const res = await apiClient.post(`/${pageId}/videos`, {
        file_url: artifact.uri,
        description: options.description || '',
        published: !options.draft,
      });
      return {
        platform: 'facebook',
        published_id: res.id || publishId,
        published_url: `https://www.facebook.com/watch?v=${res.id || publishId}`,
        status: options.draft ? 'draft' : 'published',
        published_at: new Date().toISOString(),
        raw: res,
      };
    }

    return {
      platform: 'facebook',
      published_id: publishId,
      published_url: `https://www.facebook.com/watch?v=${publishId}`,
      status: options.draft ? 'draft' : 'published',
      published_at: new Date().toISOString(),
      stub: true,
    };
  }

  async function getStatus(publishedId) {
    return { platform: 'facebook', published_id: publishedId, status: 'published' };
  }

  return { platform: 'facebook', publish, getStatus };
}

export default createFacebookAdapter;
