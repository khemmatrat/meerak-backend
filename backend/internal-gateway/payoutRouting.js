/**
 * @fileoverview Facade: payout path selection via registered adapters (see ./payoutAdapters/).
 * Add new rails by adding an adapter module and registering it in payoutAdapters/index.js.
 */
export { suggestPayoutRoute } from './payoutAdapters/index.js';
