/**
 * Client-side mirror of backend intercity formula (GET /api/settings/transport-pricing).
 * Server recalculates on POST when pricing is enabled.
 */

export type TransportPricingFormula = {
  thb_per_km: number;
  base_surcharge_thb: number;
  floor_job_fee_thb: number;
  platform_markup_percent: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeIntercityQuoteBreakdown(args: {
  distanceKm: number;
  vehicleMultiplier: number;
  insuranceEnabled: boolean;
  insuranceRatePercent: number;
  formula: TransportPricingFormula;
}) {
  const dist = Math.max(0, Number(args.distanceKm) || 0);
  const distanceChargeThb = round2(dist * args.formula.thb_per_km);
  const rawBeforeFloorThb = round2(distanceChargeThb + args.formula.base_surcharge_thb);
  const jobFeeAfterFloorThb = Math.max(args.formula.floor_job_fee_thb, rawBeforeFloorThb);
  const jobFeeThb = round2(jobFeeAfterFloorThb * args.vehicleMultiplier);
  const insuranceAmount = args.insuranceEnabled
    ? round2(jobFeeThb * (args.insuranceRatePercent / 100))
    : 0;
  const baseAmount = round2(jobFeeThb + insuranceAmount);
  const mr = args.formula.platform_markup_percent / 100;
  const serviceFeeThb = round2(baseAmount * mr);
  const finalPrice = round2(baseAmount * (1 + mr));
  return {
    distanceKm: dist,
    distanceChargeThb,
    baseSurchargeThb: args.formula.base_surcharge_thb,
    floorJobFeeThb: args.formula.floor_job_fee_thb,
    rawBeforeFloorThb,
    jobFeeAfterFloorThb,
    vehicleMultiplier: args.vehicleMultiplier,
    jobFeeThb,
    insuranceAmount,
    serviceFeeThb,
    finalPrice,
  };
}
