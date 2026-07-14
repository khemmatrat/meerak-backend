import {
  isMerchantAdEnabled,
  isBriefEnabled,
  isImageGenEnabled,
  isVideoGenEnabled,
  isGrokVideoEnabled,
  grokMaxShots,
  isPublishEnabled,
  isMerchantAllowed,
  MERCHANT_AD_PHASE,
  MERCHANT_AD_SDK_VERSION,
  weeklyClipLimit,
  shopTypeFromMerchantId,
} from './config.js';
import { getQuota, listJobs, getJob, saveJob, createJob, jobOutputDir } from './merchantAdStorage.js';
import { fetchBriefFromAiCore, ruleBasedBrief } from './briefEngine.js';
import { runMerchantAdPipeline } from './videoEngine.js';
import { publishMerchantAd } from './publishBridge.js';
import { estimateJobDurationSec } from './estimates.js';
import {
  getExtendedQuota,
  resolveGenerateCharge,
  deductTokens,
  topUpTokens,
} from './tokenEngine.js';
import { tokenEconomicsSummary } from './tokenConfig.js';
import { createDirectorOrchestrator } from './director/orchestrator.js';

function disabledStub() {
  return {
    enabled: false,
    phase: MERCHANT_AD_PHASE,
    health: () => ({ ok: false, status: 'disabled' }),
    quota: async () => ({ limit: 0, used: 0, remaining: 0 }),
    listJobs: async () => [],
    createBrief: async () => ({ ok: false }),
    generate: async () => ({ ok: false }),
    publish: async () => ({ ok: false }),
    director: {
      health: () => ({ ok: false, phase: 0 }),
      plan: async () => ({ ok: false }),
      run: async () => ({ ok: false }),
    },
  };
}

export function createMerchantAdEngine() {
  if (!isMerchantAdEnabled()) return disabledStub();

  const director = createDirectorOrchestrator({
    quota: async ({ merchantId }) => {
      const weekly = await getQuota(merchantId);
      return getExtendedQuota(merchantId, weekly);
    },
  });

  return {
    enabled: true,
    phase: MERCHANT_AD_PHASE,
    sdkVersion: MERCHANT_AD_SDK_VERSION,

    health() {
      return {
        ok: true,
        status: 'ready',
        phase: MERCHANT_AD_PHASE,
        features: {
          brief: isBriefEnabled(),
          image_gen: isImageGenEnabled(),
          video_gen: isVideoGenEnabled(),
          grok_video: isGrokVideoEnabled(),
          grok_max_shots: grokMaxShots(),
          publish: isPublishEnabled(),
          director: director.health(),
        },
        weekly_limit: weeklyClipLimit(),
      };
    },

    async quota({ merchantId }) {
      if (!isMerchantAllowed(merchantId)) {
        const err = new Error('merchant_not_allowed');
        err.code = 'MERCHANT_AD_FORBIDDEN';
        throw err;
      }
      const weekly = await getQuota(merchantId);
      return getExtendedQuota(merchantId, weekly);
    },

    async topUp({ merchantId, packageId, customThb, paymentRef }) {
      if (!isMerchantAllowed(merchantId)) {
        const err = new Error('merchant_not_allowed');
        err.code = 'MERCHANT_AD_FORBIDDEN';
        throw err;
      }
      return topUpTokens(merchantId, { packageId, customThb, paymentRef });
    },

    tokenEconomics() {
      return tokenEconomicsSummary();
    },

    async listJobs({ merchantId }) {
      return listJobs(merchantId);
    },

    async getJob({ jobId }) {
      return getJob(jobId);
    },

    async createBrief(ctx) {
      if (!isBriefEnabled()) {
        const err = new Error('brief_disabled');
        err.code = 'MERCHANT_AD_BRIEF_DISABLED';
        throw err;
      }
      if (!isMerchantAllowed(ctx.merchant_id)) {
        const err = new Error('merchant_not_allowed');
        err.code = 'MERCHANT_AD_FORBIDDEN';
        throw err;
      }
      const brief = await fetchBriefFromAiCore(ctx);
      return { brief };
    },

    async generate({ merchantId, ownerId, productId, productTitle, productImageUrl, brief, guide }) {
      if (!isMerchantAllowed(merchantId)) {
        const err = new Error('merchant_not_allowed');
        err.code = 'MERCHANT_AD_FORBIDDEN';
        throw err;
      }
      const quota = await getQuota(merchantId);
      const charge = await resolveGenerateCharge(merchantId, quota);
      if (quota.remaining <= 0 && charge.source === 'tokens') {
        /* tokens checked in resolveGenerateCharge */
      } else if (quota.remaining <= 0) {
        const err = new Error('weekly_quota_exceeded');
        err.code = 'MERCHANT_AD_QUOTA_EXCEEDED';
        err.quota = await getExtendedQuota(merchantId, quota);
        throw err;
      }
      const job = createJob({
        merchant_id: merchantId,
        owner_id: ownerId || 'guest',
        shop_type: shopTypeFromMerchantId(merchantId),
        product_id: productId,
        product_title: productTitle,
        product_image_url: productImageUrl,
        brief,
        guide,
      });
      job.status = 'generating';
      job.progress_pct = 2;
      job.estimated_sec = estimateJobDurationSec(brief);
      await saveJob(job);
      const outDir = await jobOutputDir(job.id);

      const chargeMeta = { ...charge };
      void (async () => {
        try {
          const completed = await runMerchantAdPipeline(job, outDir);
          if (chargeMeta.source === 'tokens' && chargeMeta.tokens_charged > 0) {
            await deductTokens(merchantId, chargeMeta.tokens_charged, { job_id: job.id });
            completed.billing = { source: 'tokens', tokens_charged: chargeMeta.tokens_charged };
          } else {
            completed.billing = { source: 'free_weekly', tokens_charged: 0 };
          }
          await saveJob(completed);
        } catch (e) {
          const failed = await getJob(job.id);
          if (failed) {
            failed.status = 'failed';
            failed.error = e instanceof Error ? e.message : 'render_failed';
            await saveJob(failed);
          }
        }
      })();

      return { job, quota: await this.quota({ merchantId }), async: true };
    },

    async publish({ jobId, target, studioResult }) {
      const job = await getJob(jobId);
      if (!job) {
        const err = new Error('job_not_found');
        err.code = 'MERCHANT_AD_JOB_NOT_FOUND';
        throw err;
      }
      return publishMerchantAd(job, { target, studioResult });
    },

    director,
  };
}

export {
  isMerchantAdEnabled,
  isBriefEnabled,
  isImageGenEnabled,
  isVideoGenEnabled,
  isGrokVideoEnabled,
  grokMaxShots,
  isPublishEnabled,
  MERCHANT_AD_PHASE,
  MERCHANT_AD_SDK_VERSION,
  createDirectorOrchestrator,
};
