/**
 * Unified booking fee router — Profile A (slot) vs Profile B (service_merchant).
 * All rates from DB config passed in by caller (loadSlotFeeConfig / getBeautyPolicy).
 */
import {
  calcBookingEmployerOutflow,
  calcBookingRelease,
  calcBeautyEmployerOutflow,
  calcBeautyProviderPayout,
  calcBeautyPaymentCharge,
} from './financialEngine.js';

/**
 * @param {object} input
 * @param {'slot'|'service_merchant'} input.profile
 * @param {'employer_outflow'|'release_deposit'|'provider_payout'|'payment_charge'} input.action
 */
export function calcBookingFees(input) {
  const profile = input.profile === 'slot' ? 'slot' : 'service_merchant';
  const action = input.action;

  if (profile === 'service_merchant') {
    const policy = input.policy || {};
    if (action === 'employer_outflow') {
      return calcBeautyEmployerOutflow(input.quotedPrice, policy, {
        bookerVipTier: input.bookerVipTier,
      });
    }
    if (action === 'provider_payout') {
      return calcBeautyProviderPayout(
        input.serviceSubtotal,
        input.transportTotal,
        policy,
        { talentVipTier: input.talentVipTier },
      );
    }
    if (action === 'payment_charge') {
      return calcBeautyPaymentCharge(
        input.principalPortion,
        input.quotedPrice,
        input.employerServiceFee,
      );
    }
    throw Object.assign(new Error(`action ${action} not supported for service_merchant`), { code: 'VALIDATION' });
  }

  const slotConfig = input.slotConfig || {};
  if (action === 'employer_outflow') {
    return calcBookingEmployerOutflow(input.depositAmount, input.bookerVipTier, slotConfig);
  }
  if (action === 'release_deposit') {
    return calcBookingRelease(
      input.depositAmount,
      input.finalBidPrice,
      input.talentVipTier,
      {
        waiveBookingCommission: input.waiveBookingCommission,
        slotConfig,
      },
    );
  }
  throw Object.assign(new Error(`action ${action} not supported for slot`), { code: 'VALIDATION' });
}

export { loadSlotFeeConfig, normalizeSlotFeeRates } from './bookingFeeConfig.js';
