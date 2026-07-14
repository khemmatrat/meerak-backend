import fs from 'fs/promises';
import path from 'path';
import { kongFetch, kongJson } from '@/lib/server/kongFetch';
import { meerakBackendBase } from '@/lib/server-env';
import {
  addPost,
  localMediaPlaybackUrl,
  saveMediaFile,
  upsertAffiliateLink,
} from '@/lib/server/studioStore';
import { getAdVideoJob, saveAdVideoJob } from '@/lib/server/merchantAdVideoStore';
import { getJobProductLink } from '@/lib/server/merchantAdJobProductLinks';
import { proxyMerchantAd } from '@/lib/server/merchantAdProxy';

export type MerchantAdPublishTarget = 'studio_feed' | 'studio_only';

export type MerchantAdPublishResult = {
  ok: boolean;
  published: boolean;
  target: MerchantAdPublishTarget;
  media_id?: string;
  post_id?: string;
  playback_url?: string;
  synced_feed?: boolean;
  mode?: string;
  error?: string;
};

type JobLike = {
  id: string;
  merchant_id: string;
  product_id?: string;
  product_title: string;
  output_video_url?: string;
  output_poster_url?: string;
  brief?: { title?: string; tagline_th?: string };
  status?: string;
};

function merchantAuthorId(merchantId: string) {
  return `merchant-${merchantId}`;
}

function buildCaption(job: JobLike) {
  const tagline = job.brief?.tagline_th || '';
  const title = job.brief?.title || job.product_title;
  const productTag = job.product_id ? `[product:${job.product_id}]` : '';
  return `${title}${tagline ? ` — ${tagline}` : ''}\n#โฆษณาAI #${job.product_title.replace(/\s+/g, '')} ${productTag}`.trim();
}

async function resolveJob(jobId: string, merchantId: string): Promise<JobLike | null> {
  const link = await getJobProductLink(jobId);
  const proxied = await proxyMerchantAd<{ job: JobLike }>(
    `/api/aivos/merchant-ad/jobs/${encodeURIComponent(jobId)}`,
  );
  if (proxied.ok && proxied.data.job) {
    const job = proxied.data.job;
    if (link) {
      return { ...job, product_id: link.product_id, product_title: link.product_title || job.product_title };
    }
    return job;
  }

  const local = await getAdVideoJob(jobId);
  if (local && local.merchant_id === merchantId) {
    if (link && !local.product_id) {
      return { ...local, product_id: link.product_id, product_title: link.product_title || local.product_title };
    }
    return local;
  }
  return null;
}

async function loadVideoBuffer(job: JobLike): Promise<Buffer | null> {
  const localPath = path.join(process.cwd(), '.data', 'dev', 'merchant-ad-output', job.id, 'output.mp4');
  try {
    return await fs.readFile(localPath);
  } catch {
    /* try backend */
  }

  const backendBase = meerakBackendBase();
  const url = job.output_video_url?.startsWith('http')
    ? job.output_video_url
    : `${backendBase}${job.output_video_url || `/api/aivos/merchant-ad/files/${job.id}/output.mp4`}`;

  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function uploadVideo(authorId: string, buffer: Buffer) {
  const upstream = await kongFetch(
    `/api/v1/video/v1/media/upload?author_id=${encodeURIComponent(authorId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'X-Author-Id': authorId },
      body: buffer,
    },
  );

  if (upstream?.ok) {
    const data = (await upstream.json()) as { media_id?: string; status?: string };
    if (data.media_id) {
      return {
        media_id: data.media_id,
        mode: 'video-svc' as const,
        media_local: false,
        playback_url: `/api/video/v1/media/${data.media_id}/playback`,
      };
    }
  }

  const local = await saveMediaFile(authorId, buffer, 'video/mp4');
  return {
    media_id: local.media_id,
    mode: 'local' as const,
    media_local: true,
    playback_url: localMediaPlaybackUrl(local.media_id),
  };
}

async function markBackendPublished(
  jobId: string,
  studioResult: Omit<MerchantAdPublishResult, 'ok' | 'published'>,
) {
  if (!jobId.startsWith('mad-')) return;
  try {
    await fetch(`${meerakBackendBase()}/api/aivos/merchant-ad/jobs/${encodeURIComponent(jobId)}/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studio_result: studioResult, target: studioResult.target }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    /* best-effort */
  }
}

export async function publishMerchantAdToStudioFeed(input: {
  jobId: string;
  merchantId: string;
  target?: MerchantAdPublishTarget;
  productId?: string;
}): Promise<MerchantAdPublishResult> {
  const target: MerchantAdPublishTarget = input.target || 'studio_feed';
  const job = await resolveJob(input.jobId, input.merchantId);
  const linkedProductId = input.productId || job?.product_id;

  if (!job) {
    return { ok: false, published: false, target, error: 'job_not_found' };
  }
  if (job.status !== 'completed' && job.status !== 'published') {
    return { ok: false, published: false, target, error: 'job_not_ready' };
  }
  if (!job.output_video_url) {
    return { ok: false, published: false, target, error: 'video_missing' };
  }

  const buffer = await loadVideoBuffer(job);
  if (!buffer?.length) {
    return { ok: false, published: false, target, error: 'video_file_missing' };
  }

  const authorId = merchantAuthorId(input.merchantId);
  const upload = await uploadVideo(authorId, buffer);

  if (linkedProductId) {
    await upsertAffiliateLink({
      creator_id: authorId,
      product_id: linkedProductId,
      merchant_id: input.merchantId,
      title: job.product_title,
    });
  }

  const caption = buildCaption({ ...job, product_id: linkedProductId || job.product_id });
  let syncedFeed = false;
  let postId: string | undefined;

  if (target === 'studio_feed') {
    const remote = await kongJson<{ post_id?: string }>('/api/v1/feed/v1/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: authorId,
        media_id: upload.media_id,
        caption,
        post_type: 'video',
      }),
    });
    if (remote?.post_id) {
      syncedFeed = true;
      postId = remote.post_id;
    }
  }

  const post = await addPost({
    post_id: postId || `mad-post-${Date.now().toString(36)}`,
    author_id: authorId,
    media_id: upload.media_id,
    caption,
    product_id: linkedProductId || job.product_id,
    media_local: upload.media_local,
    synced_feed: syncedFeed,
  });

  const result: MerchantAdPublishResult = {
    ok: true,
    published: true,
    target,
    media_id: upload.media_id,
    post_id: post.post_id,
    playback_url: upload.playback_url,
    synced_feed: syncedFeed,
    mode: syncedFeed ? 'feed-svc' : upload.mode,
  };

  await markBackendPublished(input.jobId, result);

  const localJob = await getAdVideoJob(input.jobId);
  if (localJob) {
    await saveAdVideoJob({
      ...localJob,
      status: 'published',
      published_at: new Date().toISOString(),
      publish: {
        target,
        post_id: post.post_id,
        media_id: upload.media_id,
        synced_feed: syncedFeed,
        mode: result.mode,
        published_at: new Date().toISOString(),
      },
    });
  }

  return result;
}
