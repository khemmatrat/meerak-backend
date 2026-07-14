/** @typedef {'tvc_multi_shot' | 'ugc_lipsync'} AdFormat */

/**
 * @typedef {Object} DirectorRequest
 * @property {string} merchant_id
 * @property {string} [owner_id]
 * @property {string} [product_id]
 * @property {string} product_title
 * @property {string} [product_image_url]
 * @property {string} [portrait_image_url]
 * @property {object} [brief]
 * @property {Record<string, string>} [guide]
 * @property {string} [format] — explicit AdFormat override
 * @property {string} [style_id]
 * @property {string} [category_id]
 * @property {number} [price_thb]
 * @property {string} [promo_text]
 * @property {string} [target_audience]
 * @property {boolean} [auto_publish]
 * @property {string} [merchant_name]
 */

/**
 * @typedef {Object} DirectorPlan
 * @property {AdFormat} format
 * @property {string} style_id
 * @property {string} category_id
 * @property {string} [video_provider_id]
 * @property {object|null} script
 * @property {object|null} prompt
 * @property {boolean} auto_publish
 * @property {string} resolved_at
 */

/**
 * @typedef {Object} VideoGenerateRequest
 * @property {AdFormat} format
 * @property {object} job
 * @property {string} outDir
 * @property {DirectorPlan} plan
 * @property {DirectorRequest} request
 */

/**
 * @typedef {Object} VideoGenerateResult
 * @property {object} job
 * @property {string} [provider_id]
 */

/**
 * @typedef {Object} VideoProvider
 * @property {string} id
 * @property {(format: AdFormat) => boolean} supports
 * @property {(ctx: VideoGenerateRequest) => Promise<object>} generate
 */

export const AD_FORMATS = Object.freeze({
  TVC: 'tvc_multi_shot',
  UGC: 'ugc_lipsync',
});

export const DIRECTOR_PHASE = 4;
