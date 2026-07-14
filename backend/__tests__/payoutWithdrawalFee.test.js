/**
 * Withdrawal fee policy + quote helpers (pure; no DB).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePayoutWithdrawalFeeThb,
  computeWithdrawalFeeQuote,
  mergeAndValidateWithdrawalFeePolicyForPersistence,
  normalizeWithdrawalFeePolicy,
  resolveWithdrawalFeeLaneKey,
  WithdrawalFeePolicyValidationError,
} from '../lib/payoutWithdrawalFee.js';

describe('normalizeWithdrawalFeePolicy', () => {
  test('empty raw uses legacy withdrawal_fee_* for flat lanes', () => {
    const p = normalizeWithdrawalFeePolicy(null, {
      withdrawal_fee_standard_thb: 40,
      withdrawal_fee_instant_thb: 55,
    });
    assert.equal(p.bank_transfer.mode, 'flat');
    assert.equal(p.bank_transfer.fee_thb, 40);
    assert.equal(p.promptpay.mode, 'flat');
    assert.equal(p.promptpay.fee_thb, 40);
    assert.equal(p.provider_batch.fee_thb, 40);
    assert.equal(p.provider_instant.fee_thb, 55);
    assert.equal(p.truemoney.mode, 'percent');
    assert.equal(p.truemoney.percent, 3.6);
    assert.equal(p.processor_cost_estimate_thb, 30);
  });

  test('partial raw merges with legacy fallback for unspecified lanes', () => {
    const p = normalizeWithdrawalFeePolicy(
      { bank_transfer: { mode: 'flat', fee_thb: 22 } },
      { withdrawal_fee_standard_thb: 35, withdrawal_fee_instant_thb: 50 },
    );
    assert.equal(p.bank_transfer.fee_thb, 22);
    assert.equal(p.promptpay.fee_thb, 35);
  });
});

describe('resolveWithdrawalFeeLaneKey', () => {
  test('provider instant vs batch', () => {
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: true, instantPayout: true, channelRaw: 'promptpay' }),
      'provider_instant',
    );
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: true, instantPayout: false, channelRaw: 'truemoney' }),
      'provider_batch',
    );
  });

  test('customer channels', () => {
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: false, instantPayout: false, channelRaw: 'bank_transfer' }),
      'bank_transfer',
    );
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: false, instantPayout: false, channelRaw: 'truemoney' }),
      'truemoney',
    );
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: false, instantPayout: false, channelRaw: 'promptpay' }),
      'promptpay',
    );
    assert.equal(
      resolveWithdrawalFeeLaneKey({ isProvider: false, instantPayout: false, channelRaw: '' }),
      'promptpay',
    );
  });
});

describe('computeWithdrawalFeeQuote', () => {
  const policy25 = normalizeWithdrawalFeePolicy(
    {
      bank_transfer: { mode: 'flat', fee_thb: 25, eta_label_th: 'รอบโอนถัดไป' },
      promptpay: { mode: 'flat', fee_thb: 25, eta_label_th: 'รอบโอนถัดไป' },
      truemoney: {
        mode: 'percent',
        percent: 3.6,
        min_fee_thb: 0,
        max_fee_thb: null,
        eta_label_th: 'ตามรอบ TrueMoney',
      },
      provider_batch: { mode: 'flat', fee_thb: 35, eta_label_th: 'รอบโอนมาตรฐาน' },
      provider_instant: { mode: 'flat', fee_thb: 50, eta_label_th: 'ถอนด่วน' },
      processor_cost_estimate_thb: 30,
    },
    { withdrawal_fee_standard_thb: 35, withdrawal_fee_instant_thb: 50 },
  );

  test('bank_transfer flat fee', () => {
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 1000,
      channelRaw: 'bank_transfer',
      isProvider: false,
      instantPayout: false,
      policy: policy25,
    });
    assert.equal(q.fee_thb, 25);
    assert.equal(q.fee_lane, 'bank_transfer');
    assert.equal(q.net_receive, 1000);
    assert.equal(q.total_deduct, 1025);
    assert.equal(q.processor_cost_estimate_thb, 30);
    assert.equal(q.platform_margin_amount, 0);
  });

  test('promptpay flat fee', () => {
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 500,
      channelRaw: 'promptpay',
      isProvider: false,
      instantPayout: false,
      policy: policy25,
    });
    assert.equal(q.fee_thb, 25);
    assert.equal(q.fee_lane, 'promptpay');
    assert.equal(q.total_deduct, 525);
  });

  test('truemoney percent fee', () => {
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 1000,
      channelRaw: 'truemoney',
      isProvider: false,
      instantPayout: false,
      policy: policy25,
    });
    assert.equal(q.fee_thb, 36);
    assert.equal(q.fee_lane, 'truemoney');
    assert.equal(q.total_deduct, 1036);
    assert.equal(q.platform_margin_amount, 6);
  });

  test('provider batch flat', () => {
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 800,
      channelRaw: 'promptpay',
      isProvider: true,
      instantPayout: false,
      policy: policy25,
    });
    assert.equal(q.fee_thb, 35);
    assert.equal(q.fee_lane, 'provider_batch');
    assert.equal(q.platform_margin_amount, 5);
  });

  test('provider instant flat', () => {
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 800,
      channelRaw: 'promptpay',
      isProvider: true,
      instantPayout: true,
      policy: policy25,
    });
    assert.equal(q.fee_thb, 50);
    assert.equal(q.fee_lane, 'provider_instant');
    assert.equal(q.platform_margin_amount, 20);
  });

  test('platform margin never below 0 when fee below processor estimate', () => {
    const pol = normalizeWithdrawalFeePolicy(
      {
        bank_transfer: { mode: 'flat', fee_thb: 20 },
        processor_cost_estimate_thb: 30,
      },
      { withdrawal_fee_standard_thb: 35, withdrawal_fee_instant_thb: 50 },
    );
    const q = computeWithdrawalFeeQuote({
      payoutAmountThb: 100,
      channelRaw: 'bank_transfer',
      isProvider: false,
      instantPayout: false,
      policy: pol,
    });
    assert.equal(q.fee_thb, 20);
    assert.equal(q.processor_cost_estimate_thb, 30);
    assert.equal(q.platform_margin_amount, 0);
  });
});

describe('computePayoutWithdrawalFeeThb (backward compatible)', () => {
  test('matches legacy-ish behavior without persisted policy object', () => {
    assert.equal(
      computePayoutWithdrawalFeeThb({
        amountGrossThb: 1000,
        channelRaw: 'truemoney',
        isProvider: false,
        instantPayout: false,
        feeStandardThb: 35,
      }),
      36,
    );
    assert.equal(
      computePayoutWithdrawalFeeThb({
        amountGrossThb: 1000,
        channelRaw: 'promptpay',
        isProvider: false,
        instantPayout: false,
        feeStandardThb: 35,
      }),
      35,
    );
    assert.equal(
      computePayoutWithdrawalFeeThb({
        amountGrossThb: 1000,
        isProvider: true,
        instantPayout: false,
        feeStandardThb: 35,
        feeInstantThb: 50,
      }),
      35,
    );
    assert.equal(
      computePayoutWithdrawalFeeThb({
        amountGrossThb: 1000,
        isProvider: true,
        instantPayout: true,
        feeStandardThb: 35,
        feeInstantThb: 50,
      }),
      50,
    );
  });
});

describe('mergeAndValidateWithdrawalFeePolicyForPersistence', () => {
  const legacy = { withdrawal_fee_standard_thb: 35, withdrawal_fee_instant_thb: 50 };

  test('rejects negative flat fee', () => {
    assert.throws(
      () =>
        mergeAndValidateWithdrawalFeePolicyForPersistence(null, legacy, {
          bank_transfer: { mode: 'flat', fee_thb: -1 },
        }),
      WithdrawalFeePolicyValidationError,
    );
  });

  test('rejects percent above cap', () => {
    assert.throws(
      () =>
        mergeAndValidateWithdrawalFeePolicyForPersistence(null, legacy, {
          truemoney: { mode: 'percent', percent: 51, min_fee_thb: 0 },
        }),
      WithdrawalFeePolicyValidationError,
    );
  });

  test('rejects max_fee below min_fee', () => {
    assert.throws(
      () =>
        mergeAndValidateWithdrawalFeePolicyForPersistence(null, legacy, {
          truemoney: { mode: 'percent', percent: 5, min_fee_thb: 10, max_fee_thb: 5 },
        }),
      WithdrawalFeePolicyValidationError,
    );
  });

  test('allows max_fee null with percent lane', () => {
    const p = mergeAndValidateWithdrawalFeePolicyForPersistence(null, legacy, {
      truemoney: { mode: 'percent', percent: 3.6, min_fee_thb: 0, max_fee_thb: null },
    });
    assert.equal(p.truemoney.percent, 3.6);
    assert.equal(p.truemoney.max_fee_thb, null);
  });
});
