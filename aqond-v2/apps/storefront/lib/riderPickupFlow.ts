/** Client-safe pickup QR gate (mirrors server FOOD_PICKUP_QR_REQUIRED). */
export function isFoodPickupQrRequired(): boolean {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FOOD_PICKUP_QR_REQUIRED === 'false') {
    return false;
  }
  return true;
}

export const FOOD_PICKUP_AT_MERCHANT = new Set([
  'rider_assigned',
  'arrived_merchant',
  'qr_verified',
]);

export function isAtMerchantPickup(phase: string): boolean {
  return FOOD_PICKUP_AT_MERCHANT.has(phase) || phase === 'food_ready';
}
