/**
 * Pure tests for manual deposit PG 23505 → HTTP-style error mapping.
 * Run: npm test (backend) or node --test __tests__/walletManualDeposit.mapping.test.js
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapManualDepositInsertUniqueViolation,
  mapManualDepositBankRefUniqueViolation,
  composeManualRejectReasonRecord,
  MANUAL_DEPOSIT_REJECT_REASON_MESSAGES,
} from '../lib/walletManualDepositRoutes.js';

describe('mapManualDepositInsertUniqueViolation', () => {
  test('163 index name → duplicate slip', () => {
    const m = mapManualDepositInsertUniqueViolation({
      code: '23505',
      constraint: 'idx_manual_deposits_user_slip_sha_active',
    });
    assert.equal(m?.code, 'MANUAL_DEPOSIT_DUPLICATE_SLIP');
    assert.equal(m?.status, 409);
    assert.ok(String(m?.error || '').includes('สลิป'));
  });

  test('164 index name → duplicate pending amount', () => {
    const m = mapManualDepositInsertUniqueViolation({
      code: '23505',
      constraint: 'idx_manual_deposits_one_pending_per_user_amount',
    });
    assert.equal(m?.code, 'MANUAL_DEPOSIT_DUPLICATE_AMOUNT_PENDING');
    assert.equal(m?.status, 409);
  });

  test('unknown 23505 → generic conflict', () => {
    const m = mapManualDepositInsertUniqueViolation({ code: '23505', constraint: 'something_else' });
    assert.equal(m?.code, 'MANUAL_DEPOSIT_CONFLICT');
  });

  test('non-23505 → null', () => {
    assert.equal(mapManualDepositInsertUniqueViolation({ code: '23514' }), null);
  });
});

describe('mapManualDepositBankRefUniqueViolation', () => {
  test('165 bank ref index → duplicate', () => {
    const m = mapManualDepositBankRefUniqueViolation({
      code: '23505',
      constraint: 'idx_manual_deposits_bank_ref_approved_unique',
    });
    assert.equal(m?.code, 'BANK_REF_DUPLICATE');
    assert.equal(m?.status, 409);
  });

  test('other 23505 → null', () => {
    assert.equal(
      mapManualDepositBankRefUniqueViolation({ code: '23505', constraint: 'other_idx' }),
      null
    );
  });
});

describe('composeManualRejectReasonRecord', () => {
  test('canonical code yields JSON with message', () => {
    const firstKey = Object.keys(MANUAL_DEPOSIT_REJECT_REASON_MESSAGES)[0];
    const r = composeManualRejectReasonRecord(firstKey, '');
    assert.equal(r.ok, true);
    const o = JSON.parse(r.json);
    assert.equal(o.code, firstKey);
    assert.ok(String(o.message).length > 20);
    assert.ok(!('internal_note' in o && o.internal_note));
  });

  test('invalid code rejected', () => {
    const r = composeManualRejectReasonRecord('NOT_A_REAL_CODE', '');
    assert.equal(r.ok, false);
    assert.equal(r.code, 'INVALID_REASON_CODE');
  });

  test('OTHER requires note length', () => {
    assert.equal(composeManualRejectReasonRecord('OTHER', 'สั้น').ok, false);
    const ok = composeManualRejectReasonRecord('OTHER', 'รายละเอียดเพียงพอจากแอดมิน');
    assert.equal(ok.ok, true);
    const o = JSON.parse(ok.json);
    assert.equal(o.code, 'OTHER');
    assert.ok(String(o.message).includes('ปฏิเสธ'));
  });

  test('optional internal note appended', () => {
    const r = composeManualRejectReasonRecord('SLIP_MISMATCH', 'ธนาคาร ref XYZ');
    assert.equal(r.ok, true);
    const o = JSON.parse(r.json);
    assert.equal(o.internal_note, 'ธนาคาร ref XYZ');
  });
});
