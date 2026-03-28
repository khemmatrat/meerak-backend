/**
 * @fileoverview Shared types for payout route adapters (plug-in rail selection).
 */

/**
 * @typedef {object} PayoutRouteCandidate
 * @property {string} id Stable id (e.g. promptpay_bulk, direct_bank_api, ksher).
 * @property {number} estFeeMinor Estimated fee in minor units.
 * @property {number} estLatencyMs Estimated latency in ms.
 * @property {boolean} [available] If false, adapter is skipped.
 */

/**
 * @typedef {object} PayoutRouteContext
 * @property {number} amountMinor
 * @property {boolean} [preferSpeed]
 * @property {boolean} [promptpayBulkAvailable]
 * @property {boolean} [directBankAvailable]
 */

/**
 * @typedef {object} PayoutRouteHint
 * @property {string} route
 * @property {number} score Lower is better (composite).
 * @property {number} estFeeMinor
 * @property {number} estLatencyMs
 * @property {string} reason
 */

export {};
