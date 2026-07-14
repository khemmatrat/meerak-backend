/**
 * KYC Feature Limits - Enforce limits based on KYC level
 * 
 * Features:
 * - Daily transaction limits
 * - Daily withdrawal limits
 * - Job posting limits
 * - Feature access control
 * 
 * KYC Levels:
 * - NONE (0): ฿5,000 daily transaction
 * - LITE (1): ฿50,000 daily transaction
 * - FULL (2): ฿500,000 daily transaction
 */

import { KYCLevel, KYC_LIMITS } from '../types';
import { createLogger } from './tracing';

const logger = createLogger('KYCLimits');

/**
 * Feature access control per KYC level
 */
export const FEATURE_ACCESS = {
  [KYCLevel.NONE]: {
    can_post_jobs: true,
    max_jobs_per_day: 3,
    can_accept_jobs: true,
    max_jobs_active: 2,
    can_withdraw: true,
    can_add_bank_account: false,
    can_receive_payment: true,
    can_add_driver_license: false,
    can_add_vehicle: false,
    requires_kyc_for_payment: false
  },
  [KYCLevel.LITE]: {
    can_post_jobs: true,
    max_jobs_per_day: 10,
    can_accept_jobs: true,
    max_jobs_active: 5,
    can_withdraw: true,
    can_add_bank_account: true,
    can_receive_payment: true,
    can_add_driver_license: true,
    can_add_vehicle: true,
    requires_kyc_for_payment: false
  },
  [KYCLevel.FULL]: {
    can_post_jobs: true,
    max_jobs_per_day: 999, // Unlimited
    can_accept_jobs: true,
    max_jobs_active: 999, // Unlimited
    can_withdraw: true,
    can_add_bank_account: true,
    can_receive_payment: true,
    can_add_driver_license: true,
    can_add_vehicle: true,
    requires_kyc_for_payment: false
  }
};

/**
 * Check if user can perform action based on KYC level
 */
export function canPerformAction(
  kycLevel: KYCLevel,
  action: keyof typeof FEATURE_ACCESS[KYCLevel.NONE]
): boolean {
  const access = FEATURE_ACCESS[kycLevel];
  return access[action] as boolean;
}

/**
 * Get transaction limit for KYC level
 */
export function getTransactionLimit(kycLevel: KYCLevel): number {
  return KYC_LIMITS[kycLevel].daily_transaction_limit;
}

/**
 * Get withdrawal limit for KYC level
 */
export function getWithdrawalLimit(kycLevel: KYCLevel): number {
  return KYC_LIMITS[kycLevel].daily_withdrawal_limit;
}

/**
 * Get max jobs per day limit
 */
export function getMaxJobsPerDay(kycLevel: KYCLevel): number {
  return FEATURE_ACCESS[kycLevel].max_jobs_per_day;
}

/**
 * Get max active jobs limit
 */
export function getMaxActiveJobs(kycLevel: KYCLevel): number {
  return FEATURE_ACCESS[kycLevel].max_jobs_active;
}

/**
 * Check if transaction amount exceeds limit
 */
export function exceedsTransactionLimit(
  amount: number,
  currentDailyTotal: number,
  kycLevel: KYCLevel
): {
  exceeds: boolean;
  limit: number;
  remaining: number;
  message?: string;
} {
  const limit = getTransactionLimit(kycLevel);
  const remaining = limit - currentDailyTotal;
  const exceeds = (currentDailyTotal + amount) > limit;

  logger.info('Checking transaction limit', {
    amount,
    currentDailyTotal,
    limit,
    remaining,
    exceeds,
    kycLevel
  });

  if (exceeds) {
    return {
      exceeds: true,
      limit,
      remaining,
      message: `Transaction exceeds daily limit. Remaining: ฿${remaining.toLocaleString()}`
    };
  }

  return { exceeds: false, limit, remaining };
}

/**
 * Check if withdrawal amount exceeds limit
 */
export function exceedsWithdrawalLimit(
  amount: number,
  currentDailyTotal: number,
  kycLevel: KYCLevel
): {
  exceeds: boolean;
  limit: number;
  remaining: number;
  message?: string;
} {
  const limit = getWithdrawalLimit(kycLevel);
  const remaining = limit - currentDailyTotal;
  const exceeds = (currentDailyTotal + amount) > limit;

  logger.info('Checking withdrawal limit', {
    amount,
    currentDailyTotal,
    limit,
    remaining,
    exceeds,
    kycLevel
  });

  if (exceeds) {
    return {
      exceeds: true,
      limit,
      remaining,
      message: `Withdrawal exceeds daily limit. Remaining: ฿${remaining.toLocaleString()}`
    };
  }

  return { exceeds: false, limit, remaining };
}

/**
 * Get KYC upgrade suggestion based on usage
 */
export function getKYCUpgradeSuggestion(
  kycLevel: KYCLevel,
  dailyTransaction: number,
  dailyWithdrawal: number
): {
  should_upgrade: boolean;
  current_level: string;
  suggested_level?: string;
  reason?: string;
  benefits?: string[];
} {
  const transactionLimit = getTransactionLimit(kycLevel);
  const withdrawalLimit = getWithdrawalLimit(kycLevel);

  // Check if close to limits (>= 80%)
  const transactionUsage = (dailyTransaction / transactionLimit) * 100;
  const withdrawalUsage = (dailyWithdrawal / withdrawalLimit) * 100;

  if (kycLevel === KYCLevel.NONE && (transactionUsage >= 80 || withdrawalUsage >= 80)) {
    return {
      should_upgrade: true,
      current_level: 'None',
      suggested_level: 'KYC Lite',
      reason: 'You are close to your daily limits',
      benefits: [
        'Increase daily transaction limit to ฿50,000',
        'Increase daily withdrawal limit to ฿20,000',
        'Post up to 10 jobs per day',
        'Add bank account for faster withdrawals',
        'Add driver license and vehicle information'
      ]
    };
  }

  if (kycLevel === KYCLevel.LITE && (transactionUsage >= 80 || withdrawalUsage >= 80)) {
    return {
      should_upgrade: true,
      current_level: 'KYC Lite',
      suggested_level: 'KYC Full',
      reason: 'You are close to your daily limits',
      benefits: [
        'Increase daily transaction limit to ฿500,000',
        'Increase daily withdrawal limit to ฿200,000',
        'Unlimited job postings',
        'Priority support',
        'Instant verification (AI-powered)'
      ]
    };
  }

  return {
    should_upgrade: false,
    current_level: kycLevel === KYCLevel.NONE ? 'None' : kycLevel === KYCLevel.LITE ? 'KYC Lite' : 'KYC Full'
  };
}

/**
 * Format limit display for UI
 */
export function formatLimitDisplay(kycLevel: KYCLevel): {
  transaction: string;
  withdrawal: string;
  jobs_per_day: string;
  active_jobs: string;
} {
  const limits = KYC_LIMITS[kycLevel];
  const features = FEATURE_ACCESS[kycLevel];

  return {
    transaction: `฿${limits.daily_transaction_limit.toLocaleString()}`,
    withdrawal: `฿${limits.daily_withdrawal_limit.toLocaleString()}`,
    jobs_per_day: features.max_jobs_per_day === 999 ? 'Unlimited' : `${features.max_jobs_per_day} jobs`,
    active_jobs: features.max_jobs_active === 999 ? 'Unlimited' : `${features.max_jobs_active} jobs`
  };
}

/**
 * Get warning threshold (80% of limit)
 */
export function getWarningThreshold(limit: number): number {
  return limit * 0.8;
}

/**
 * Check if user should see limit warning
 */
export function shouldShowLimitWarning(
  currentAmount: number,
  limit: number
): {
  show: boolean;
  percentage: number;
  message?: string;
} {
  const percentage = (currentAmount / limit) * 100;
  const warningThreshold = 80; // 80%

  if (percentage >= warningThreshold) {
    return {
      show: true,
      percentage: parseFloat(percentage.toFixed(1)),
      message: `You've used ${percentage.toFixed(0)}% of your daily limit`
    };
  }

  return {
    show: false,
    percentage: parseFloat(percentage.toFixed(1))
  };
}

export default {
  FEATURE_ACCESS,
  canPerformAction,
  getTransactionLimit,
  getWithdrawalLimit,
  getMaxJobsPerDay,
  getMaxActiveJobs,
  exceedsTransactionLimit,
  exceedsWithdrawalLimit,
  getKYCUpgradeSuggestion,
  formatLimitDisplay,
  getWarningThreshold,
  shouldShowLimitWarning
};
