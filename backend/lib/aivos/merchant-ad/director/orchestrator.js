import { isMerchantAllowed, shopTypeFromMerchantId } from '../config.js';

import { createJob, saveJob, jobOutputDir, getJob, getQuota } from '../merchantAdStorage.js';

import { fetchBriefFromAiCore } from '../briefEngine.js';

import { estimateJobDurationSec, estimateUgcDurationSec } from '../estimates.js';

import { resolveGenerateCharge, deductTokens } from '../tokenEngine.js';

import { resolveGenerationMode, resolveCategoryId, resolveStyleId } from './modeResolver.js';

import { resolveStyle } from './engines/styleEngine.js';

import { generateScript } from './engines/scriptEngine.js';

import { buildPromptComposeInput } from './engines/promptComposer.js';

import { composePrompt, composePromptWithScript } from './engines/promptEngine.js';

import { getPromptEngineInfo } from './engines/promptComposer.js';

import { getScriptEngineInfo } from './engines/scriptComposer.js';

import { generateVideo } from './engines/videoEngine.js';

import { generateVoice } from './engines/voiceEngine.js';

import { generateSubtitle } from './engines/subtitleEngine.js';

import { routeToPublish } from './engines/publishEngine.js';

import { validateDirectorRequest, assertValidationPassed } from './engines/validationEngine.js';

import { estimateGenerationCost } from './engines/costEstimationEngine.js';

import { buildMerchantPreview } from './engines/previewEngine.js';

import { checkProviderCapabilities, resolveUgcBackendProvider, listProviderCapabilities } from './providers/capabilities/capabilityLayer.js';

import { listVideoProviders } from './providers/video/registry.js';

import { AD_FORMATS, DIRECTOR_PHASE } from './types.js';

import {

  applyGenerationState,

  failGeneration,

  GENERATION_ERRORS,

  GENERATION_STATES,

} from './state/generationStateMachine.js';



/**

 * Build director plan without side effects.

 * @param {import('./types.js').DirectorRequest} request

 */

export function buildDirectorPlan(request) {

  const format = resolveGenerationMode(request);

  const category_id = resolveCategoryId(request);

  const style_id = resolveStyleId(request, format);

  const style = resolveStyle({ style_id, format });

  const script = generateScript(request, { style_id, category_id, format });

  const promptInput = buildPromptComposeInput(request, {

    format,

    style,

    script,

    style_id,

    category_id,

  });

  const prompt =

    format === AD_FORMATS.TVC

      ? composePrompt(request, { format, style, script, style_id, category_id })

      : composePromptWithScript(promptInput, script);



  const provider = listVideoProviders().find((p) => p.supports(format));



  return {

    format,

    style_id,

    category_id,

    style,

    script,

    prompt,

    video_provider_id: provider?.id || null,

    auto_publish: Boolean(request.auto_publish),

    voice: { status: 'pending_phase_5' },

    subtitle: { status: 'pending_phase_6' },

    director_phase: DIRECTOR_PHASE,

    resolved_at: new Date().toISOString(),

  };

}



/**

 * @param {object} deps

 * @param {(ctx: object) => Promise<object>} deps.fetchBrief

 * @param {(input: object) => Promise<object>} deps.quota

 */

export function createDirectorOrchestrator(deps = {}) {

  const fetchBrief = deps.fetchBrief || fetchBriefFromAiCore;



  return {

    phase: DIRECTOR_PHASE,



    health() {

      return {

        ok: true,

        phase: DIRECTOR_PHASE,

        formats: [AD_FORMATS.TVC, AD_FORMATS.UGC],

        ugc_implemented: true,

        providers: listVideoProviders().map((p) => p.id),

        provider_capabilities: listProviderCapabilities(),

        prompt_engine: getPromptEngineInfo(),

        script_engine: getScriptEngineInfo(),

        generation_states: Object.values(GENERATION_STATES),

      };

    },



    /**

     * Preview plan + merchant preview — no job, no billing.

     * @param {import('./types.js').DirectorRequest} request

     */

    async plan(request) {

      if (!isMerchantAllowed(request.merchant_id)) {

        const err = new Error('merchant_not_allowed');

        err.code = 'MERCHANT_AD_FORBIDDEN';

        throw err;

      }



      const plan = buildDirectorPlan(request);

      const quota = deps.quota

        ? await deps.quota({ merchantId: request.merchant_id })

        : await getQuota(request.merchant_id);

      let charge = { source: 'free_weekly', tokens_charged: 0 };

      try {

        charge = await resolveGenerateCharge(request.merchant_id, quota);

      } catch {

        charge = { source: 'tokens', tokens_charged: 0, insufficient: true };

      }



      const preview = await buildMerchantPreview(request, plan, { quota, charge });

      const providerId = resolveUgcBackendProvider(plan.video_provider_id || 'ugc_grok');



      return {

        plan,

        preview,

        validation: preview.validation,

        cost_estimate: preview.cost,

        capabilities: preview.capabilities,

        provider_capabilities: checkProviderCapabilities(providerId, plan.format, {

          request,

          plan,

        }),

      };

    },



    /**

     * Full director run — validation before async work; no credit on validation failure.

     * @param {import('./types.js').DirectorRequest} request

     */

    async run(request) {

      if (!isMerchantAllowed(request.merchant_id)) {

        const err = new Error('merchant_not_allowed');

        err.code = 'MERCHANT_AD_FORBIDDEN';

        throw err;

      }



      const merchantId = request.merchant_id;

      const quota = await getQuota(merchantId);



      if (quota.remaining <= 0) {

        try {

          await resolveGenerateCharge(merchantId, quota);

        } catch (e) {

          if (e?.code === 'MERCHANT_AD_INSUFFICIENT_TOKENS') {

            e.code = GENERATION_ERRORS.QUOTA_EXCEEDED;

          }

          throw e;

        }

      }



      const charge = await resolveGenerateCharge(merchantId, quota);

      const plan = buildDirectorPlan(request);



      const validation = await validateDirectorRequest(request, plan, { quota, charge });

      if (!validation.ok) {

        const err = new Error('validation_failed');

        err.code = GENERATION_ERRORS.VALIDATION_FAILED;

        err.details = validation;

        throw err;

      }



      const providerId = resolveUgcBackendProvider(plan.video_provider_id || 'ugc_grok');

      const capability = checkProviderCapabilities(providerId, plan.format, { request, plan });

      if (plan.format === AD_FORMATS.UGC && !capability.ok) {

        const err = new Error('capability_unavailable');

        err.code = GENERATION_ERRORS.CAPABILITY_UNAVAILABLE;

        err.details = capability;

        throw err;

      }



      let brief = request.brief;

      if (plan.format === AD_FORMATS.TVC) {

        if (!brief?.shots?.length) {

          brief = await fetchBrief({

            merchant_id: merchantId,

            product_title: request.product_title,

            product_image_url: request.product_image_url,

            category_style: plan.category_id,

            mood: request.guide?.mood || 'premium',

            hook: request.guide?.hook,

            merchant_name: request.merchant_name,

            visual_notes: request.guide?.visual_notes,

          });

        }

      }



      const costEstimate = estimateGenerationCost(request, plan, charge);



      const job = createJob({

        merchant_id: merchantId,

        owner_id: request.owner_id || 'guest',

        shop_type: shopTypeFromMerchantId(merchantId),

        product_id: request.product_id,

        product_title: request.product_title,

        product_image_url: request.product_image_url || request.portrait_image_url,

        brief: brief || { title: request.product_title, shots: [], source: 'director' },

        guide: { ...(request.guide || {}), format: plan.format },

      });



      job.director_plan = plan;

      job.cost_estimate = costEstimate;

      applyGenerationState(job, GENERATION_STATES.QUEUED);

      job.estimated_sec =

        plan.format === AD_FORMATS.TVC

          ? estimateJobDurationSec(brief)

          : estimateUgcDurationSec(providerId);

      await saveJob(job);



      applyGenerationState(job, GENERATION_STATES.PLANNING);

      await saveJob(job);



      applyGenerationState(job, GENERATION_STATES.VALIDATING);

      job.validation_snapshot = validation;

      await saveJob(job);



      const outDir = await jobOutputDir(job.id);

      const chargeMeta = { ...charge };



      const runAsync = async () => {

        try {

          applyGenerationState(job, GENERATION_STATES.GENERATING);

          await saveJob(job);



          await generateVoice({ script: plan.script, style_id: plan.style_id, job });

          const { job: completed, provider_id } = await generateVideo({

            format: plan.format,

            job,

            outDir,

            plan,

            request,

          });

          completed.director_plan = {

            ...plan,

            video_provider_id: provider_id,

          };



          await generateSubtitle({

            script: plan.script,

            video_path: completed.output_video_url,

            job: completed,

          });



          if (chargeMeta.source === 'tokens' && chargeMeta.tokens_charged > 0) {

            await deductTokens(merchantId, chargeMeta.tokens_charged, { job_id: job.id });

            completed.billing = { source: 'tokens', tokens_charged: chargeMeta.tokens_charged };

          } else {

            completed.billing = { source: 'free_weekly', tokens_charged: 0 };

          }



          applyGenerationState(completed, GENERATION_STATES.PUBLISHING);

          await saveJob(completed);



          const publishResult = await routeToPublish({ job: completed });

          if (publishResult?.ok === false && completed.director_plan?.auto_publish) {

            failGeneration(completed, GENERATION_ERRORS.PUBLISH_FAILED, publishResult.error || 'publish_failed');

            await saveJob(completed);

            return;

          }



          applyGenerationState(completed, GENERATION_STATES.COMPLETED);

          await saveJob(completed);

        } catch (e) {

          const failed = await getJob(job.id);

          if (failed) {

            const code = e?.code || GENERATION_ERRORS.PROVIDER_FAILED;

            failGeneration(failed, code, e instanceof Error ? e.message : 'director_run_failed', e?.details);

            await saveJob(failed);

          }

          throw e;

        }

      };



      void runAsync();



      const preview = await buildMerchantPreview(request, plan, { quota, charge });



      return {

        job,

        plan,

        preview,

        validation,

        cost_estimate: costEstimate,

        capabilities: capability,

        quota: deps.quota ? await deps.quota({ merchantId }) : quota,

        async: true,

      };

    },

  };

}


