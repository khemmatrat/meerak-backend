import { isPublishEnabled } from './config.js';

import { OUT_DIR, saveJob } from './merchantAdStorage.js';



function storefrontPublishUrl() {

  return (

    process.env.AIVOS_MERCHANT_AD_PUBLISH_URL ||

    process.env.STOREFRONT_URL ||

    'http://127.0.0.1:3003'

  ).replace(/\/$/, '');

}



function persistPublish(job, studioResult, target) {

  job.publish = {

    target: target || studioResult.target || 'studio_feed',

    post_id: studioResult.post_id,

    media_id: studioResult.media_id,

    playback_url: studioResult.playback_url,

    synced_feed: !!studioResult.synced_feed,

    mode: studioResult.mode,

    published_at: new Date().toISOString(),

  };

  job.published_at = job.publish.published_at;

  job.status = 'published';

  return job.publish;

}



/**

 * Sprint 5 — publish completed ad to Studio/Feed.

 * Storefront performs upload + feed post; backend persists job state.

 */

export async function publishMerchantAd(job, { target = 'studio_feed', studioResult } = {}) {

  if (!isPublishEnabled()) {

    return { ok: false, error: 'aivos_merchant_ad_publish_disabled' };

  }

  if (job.status !== 'completed' && job.status !== 'published') {

    return { ok: false, error: 'job_not_ready' };

  }

  if (!job.output_video_url && !studioResult) {

    return { ok: false, error: 'job_not_ready' };

  }

  if (job.published_at && job.publish?.post_id && !studioResult) {

    return { ok: true, published: true, already: true, publish: job.publish };

  }



  if (studioResult) {

    const publish = persistPublish(job, studioResult, target);

    await saveJob(job);

    return { ok: true, published: true, publish, post: { post_id: publish.post_id, media_id: publish.media_id } };

  }



  const url = `${storefrontPublishUrl()}/api/merchant/ad-video/publish`;

  let res;

  try {

    res = await fetch(url, {

      method: 'POST',

      headers: { 'Content-Type': 'application/json' },

      body: JSON.stringify({

        job_id: job.id,

        merchant_id: job.merchant_id,

        target,

        source: 'aivos_backend',

      }),

      signal: AbortSignal.timeout(120000),

    });

  } catch (e) {

    return {

      ok: false,

      error: 'publish_unreachable',

      detail: e instanceof Error ? e.message : 'fetch_failed',

      hint: `Set STOREFRONT_URL or start storefront on ${storefrontPublishUrl()}`,

    };

  }



  let data;

  try {

    data = await res.json();

  } catch {

    return { ok: false, error: 'publish_invalid_response' };

  }



  if (!res.ok || !data.ok) {

    return { ok: false, error: data.error || 'publish_failed', detail: data };

  }



  const publish = persistPublish(

    job,

    {

      target: data.target || target,

      post_id: data.post_id || data.post?.post_id,

      media_id: data.media_id || data.post?.media_id,

      playback_url: data.playback_url,

      synced_feed: data.synced_feed,

      mode: data.mode,

    },

    target,

  );

  await saveJob(job);



  return {

    ok: true,

    published: true,

    publish,

    post: data.post || { post_id: publish.post_id, media_id: publish.media_id },

    synced_feed: publish.synced_feed,

    mode: publish.mode,

    output_dir: OUT_DIR,

  };

}

