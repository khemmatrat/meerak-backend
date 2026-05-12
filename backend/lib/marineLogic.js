/**
 * AQOND Marine Hardening Logic
 * - Skipper Check-in (30 mins before, GPS)
 * - Pier status & boat-pier compatibility
 * - KYC license expiry lock
 * - Car-Boat sync (Arrival Gap)
 * - Backup captain search
 */

const CHECK_IN_BUFFER_MINUTES = 30;
const CAR_BOAT_BUFFER_MINUTES = 20;
const PIER_GPS_RADIUS_M = 500;

/**
 * Check if skipper license is valid (not expired)
 */
export function isSkipperEligible(skipperLicenseExpiry) {
  if (!skipperLicenseExpiry) return false;
  const expiry = new Date(skipperLicenseExpiry);
  return expiry >= new Date();
}

/**
 * Validate captain is within pier radius (GPS check-in)
 */
export function isWithinPierRadius(checkInLat, checkInLng, pierLat, pierLng, radiusM = PIER_GPS_RADIUS_M) {
  if (checkInLat == null || checkInLng == null || pierLat == null || pierLng == null) return false;
  const R = 6371000; // Earth radius in meters
  const dLat = (pierLat - checkInLat) * Math.PI / 180;
  const dLng = (pierLng - checkInLng) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(checkInLat * Math.PI / 180) * Math.cos(pierLat * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return dist <= radiusM;
}

/**
 * Check if check-in is within allowed window (30 mins before departure)
 */
export function isCheckInWindowValid(departureTime, checkInAt) {
  if (!departureTime || !checkInAt) return false;
  const dep = new Date(departureTime);
  const check = new Date(checkInAt);
  const minsBefore = (dep - check) / (60 * 1000);
  return minsBefore >= 0 && minsBefore <= CHECK_IN_BUFFER_MINUTES + 5; // allow 5 min grace
}

/**
 * Boat type compatible with pier
 */
export function isBoatCompatibleWithPier(boatGrade, pierCompatibleTypes) {
  if (!pierCompatibleTypes || pierCompatibleTypes.length === 0) return true;
  const grade = (boatGrade || 'standard').toLowerCase();
  const map = {
    standard: ['longtail', 'speedboat', 'ferry'],
    premium: ['longtail', 'speedboat', 'ferry', 'yacht', 'catamaran'],
  };
  const types = map[grade] || map.standard;
  return types.some(t => pierCompatibleTypes.includes(t));
}

/**
 * Car-Boat sync: Car_ETA + buffer > Boat_Departure => conflict
 */
export function hasCarBoatConflict(carEtaMinutes, boatDepartureTime, bufferMins = CAR_BOAT_BUFFER_MINUTES) {
  if (carEtaMinutes == null || !boatDepartureTime) return false;
  const now = new Date();
  const boatDep = new Date(boatDepartureTime);
  const arrivalTime = new Date(now.getTime() + carEtaMinutes * 60 * 1000);
  const bufferTime = new Date(arrivalTime.getTime() + bufferMins * 60 * 1000);
  return bufferTime > boatDep;
}

// ============ SAFETY DEPOSIT & CANCELLATION ============
export const MARINE_DEPOSIT_PERCENT = { charter: 40, activity: 35, ferry: 0, express: 0 };
export const MARINE_DEPOSIT_MIN_PERCENT = 30;
export const MARINE_DEPOSIT_MAX_PERCENT = 50;

export function requiresSafetyDeposit(subService) {
  return subService === 'charter' || subService === 'activity';
}

export function getDepositPercent(subService) {
  return MARINE_DEPOSIT_PERCENT[subService] || 0;
}

export function calcDepositAmount(totalPrice, subService) {
  const pct = getDepositPercent(subService);
  return Math.round((totalPrice * pct / 100) * 100) / 100;
}

/**
 * Cancellation refund: >24h 90%, 12-24h 50%, <12h or no-show 0%
 */
export function getCancellationRefundPercent(departureTime, cancelledAt) {
  if (!departureTime) return 0;
  const dep = new Date(departureTime);
  const cancel = cancelledAt ? new Date(cancelledAt) : new Date();
  const hoursBefore = (dep - cancel) / (60 * 60 * 1000);
  if (hoursBefore > 24) return 90;
  if (hoursBefore > 12) return 50;
  return 0;
}
