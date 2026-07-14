import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWalletDepositFiscalLines,
  buildWalletWithdrawalFiscalLines,
  buildFiscalDocumentIdempotencyKey,
  calculateLine,
  nextDocumentNo,
  normalizeDocumentType,
  normalizePartyRole,
  splitVatInclusive,
  summarizeLines,
  validateFiscalDocumentIssueReadiness,
} from '../lib/taxDocumentService.js';
import {
  buildProviderEarningLines,
  buildWhtCertificateLines,
  providerWhtEligibility,
} from '../lib/providerWhtService.js';
import {
  buildEtaxPayload,
  createDryRunEtaxAdapter,
  validateEtaxDocument,
} from '../lib/etaxAdapterService.js';

describe('taxDocumentService pure helpers', () => {
  test('calculateLine applies VAT and WHT deterministically', () => {
    const line = calculateLine({
      description: 'Platform service fee',
      taxable_amount: 100,
      vat_rate_percent: 7,
      wht_rate_percent: 3,
    });
    assert.equal(line.taxable_amount, 100);
    assert.equal(line.vat_amount, 7);
    assert.equal(line.wht_amount, 3);
    assert.equal(line.total_amount, 104);
  });

  test('summarizeLines totals line amounts', () => {
    const totals = summarizeLines([
      calculateLine({ taxable_amount: 100, vat_rate_percent: 7 }),
      calculateLine({ taxable_amount: 50, wht_rate_percent: 3 }),
    ]);
    assert.equal(totals.subtotal_amount, 150);
    assert.equal(totals.vat_amount, 7);
    assert.equal(totals.wht_amount, 1.5);
    assert.equal(totals.total_amount, 155.5);
  });

  test('normalizers and idempotency key are stable', () => {
    assert.equal(normalizeDocumentType('TAX_INVOICE'), 'tax_invoice');
    assert.equal(normalizeDocumentType('unknown'), 'tax_invoice');
    assert.equal(normalizePartyRole('PROVIDER'), 'provider');
    assert.equal(normalizePartyRole('unknown'), 'customer');
    assert.equal(
      buildFiscalDocumentIdempotencyKey({
        sourceEventId: 'L-1',
        documentType: 'tax_invoice',
        partyRole: 'buyer',
      }),
      'L-1:tax_invoice:buyer',
    );
  });

  test('splitVatInclusive separates VAT base without changing gross fee', () => {
    const split = splitVatInclusive(10.7, 7);
    assert.equal(split.vat_base_amount, 10);
    assert.equal(split.vat_amount, 0.7);
    assert.equal(split.gross_amount, 10.7);
  });

  test('issue readiness blocks tax invoices with incomplete tax identity snapshots', () => {
    const readiness = validateFiscalDocumentIssueReadiness({
      document_type: 'tax_invoice',
      seller_snapshot: { legal_name: 'AQOND', tax_id: '0105567000000', registered_address: 'Bangkok', branch_code: '00000' },
      buyer_snapshot: { legal_name: 'Buyer Co.' },
    });
    assert.equal(readiness.ok, false);
    assert.equal(readiness.required, true);
    assert.deepEqual(readiness.missing_fields, ['buyer.tax_id', 'buyer.registered_address']);
  });

  test('issue readiness allows receipts with lighter buyer identity', () => {
    const readiness = validateFiscalDocumentIssueReadiness({
      document_type: 'receipt',
      seller_snapshot: { legal_name: 'AQOND' },
      buyer_snapshot: { legal_name: 'Customer' },
    });
    assert.equal(readiness.ok, true);
    assert.equal(readiness.required, false);
    assert.deepEqual(readiness.missing_fields, []);
  });

  test('wallet deposit lines tax only platform margin', () => {
    const lines = buildWalletDepositFiscalLines({
      amount: 1000,
      gateway_fee_amount: 10,
      platform_margin_amount: 5.35,
      net_amount: 984.65,
      gateway: 'payso',
      metadata: { source_type: 'payso' },
    }, { vat_rate_percent: 7 });
    const totals = summarizeLines(lines);
    assert.equal(totals.total_amount, 5.35);
    assert.equal(totals.vat_amount, 0.35);
    assert.equal(lines.filter((line) => line.metadata?.taxable === true).length, 1);
    assert.ok(lines.some((line) => line.metadata?.wallet_component === 'deposit_gross_amount' && line.total_amount === 0));
    assert.ok(lines.some((line) => line.metadata?.wallet_component === 'net_wallet_credit' && line.total_amount === 0));
  });

  test('wallet withdrawal lines tax only withdrawal fee margin', () => {
    const lines = buildWalletWithdrawalFiscalLines({
      amount: 500,
      platform_margin_amount: 5,
      metadata: { withdrawal_fee: 35, processor_cost_estimate: 30, payout_request_id: 'payout-1' },
    }, { vat_rate_percent: 7 });
    const totals = summarizeLines(lines);
    assert.equal(totals.total_amount, 5);
    assert.equal(totals.vat_amount, 0.33);
    assert.equal(lines.filter((line) => line.metadata?.taxable === true).length, 1);
    assert.ok(lines.some((line) => line.metadata?.wallet_component === 'withdrawal_principal' && line.total_amount === 0));
  });

  test('provider WHT lines keep VAT and WHT separate', () => {
    const earningLines = buildProviderEarningLines({
      grossIncome: 1000,
      platformFee: 300,
      whtRatePercent: 3,
      withheldAmount: 30,
      netPayable: 670,
    });
    const certLines = buildWhtCertificateLines({
      grossIncome: 1000,
      whtRatePercent: 3,
      withheldAmount: 30,
    });
    assert.equal(earningLines[0].vat_amount, 0);
    assert.equal(earningLines[0].wht_amount, 30);
    assert.equal(earningLines[0].total_amount, 670);
    assert.equal(earningLines[1].metadata.provider_earning_component, 'platform_fee_display');
    assert.equal(certLines[0].document_type, undefined);
    assert.equal(certLines[0].wht_amount, 30);
  });

  test('provider WHT eligibility requires verified Thai tax profile', () => {
    assert.deepEqual(providerWhtEligibility(null), {
      eligible: false,
      status: 'blocked_missing_tax_profile',
      reason: 'missing_tax_profile',
    });
    assert.equal(providerWhtEligibility({
      legal_name: 'Provider Co',
      tax_id: '0100000000000',
      registered_address: 'Bangkok',
      tax_entity_type: 'company',
      verified_status: 'verified',
    }).eligible, true);
    assert.equal(providerWhtEligibility({
      legal_name: 'Foreign Provider',
      tax_id: 'X',
      registered_address: 'SG',
      tax_entity_type: 'foreign',
      verified_status: 'verified',
    }).status, 'not_eligible');
  });

  test('e-Tax dry-run validates required snapshots and builds provider-neutral payload', async () => {
    const document = {
      id: 'doc-1',
      document_no: 'TI202600001',
      document_type: 'tax_invoice',
      status: 'issued',
      currency: 'THB',
      issued_at: '2026-05-14T00:00:00.000Z',
      created_at: '2026-05-14T00:00:00.000Z',
      source_event_id: 'L-1',
      seller_snapshot: {
        legal_name: 'AQOND Technology Co., Ltd.',
        tax_id: '0100000000000',
        registered_address: 'Bangkok',
        branch_code: '00000',
        vat_registered: true,
      },
      buyer_snapshot: {
        legal_name: 'Buyer Co',
        tax_id: '0200000000000',
        registered_address: 'Bangkok',
        country: 'TH',
      },
      subtotal_amount: 100,
      vat_amount: 7,
      wht_amount: 0,
      total_amount: 107,
      lines: [
        {
          line_no: 1,
          description: 'Platform fee',
          quantity: 1,
          unit_amount: 100,
          taxable_amount: 100,
          vat_rate_percent: 7,
          vat_amount: 7,
          wht_rate_percent: 0,
          wht_amount: 0,
          total_amount: 107,
          metadata: { taxable_revenue_type: 'platform_fee' },
        },
      ],
    };
    const validation = validateEtaxDocument(document);
    assert.equal(validation.ok, true);
    const payload = buildEtaxPayload(document);
    assert.equal(payload.schema_version, 'aqond.etax.v1');
    assert.equal(payload.seller.tax_id, '0100000000000');
    assert.equal(payload.buyer.tax_id, '0200000000000');
    assert.equal(payload.totals.vat_amount, 7);
    assert.ok(payload.payload_checksum_sha256);
    const submit = await createDryRunEtaxAdapter().submit(document);
    assert.equal(submit.submitted, false);
    assert.equal(submit.status, 'submit_disabled');
  });

  test('e-Tax dry-run reports missing required buyer fields without changing totals', () => {
    const validation = validateEtaxDocument({
      id: 'doc-2',
      document_no: 'TI202600002',
      document_type: 'tax_invoice',
      status: 'issued',
      issued_at: '2026-05-14T00:00:00.000Z',
      seller_snapshot: { legal_name: 'AQOND', tax_id: '0100000000000', registered_address: 'Bangkok', branch_code: '00000' },
      buyer_snapshot: { legal_name: 'Buyer Missing Tax' },
      subtotal_amount: 100,
      vat_amount: 7,
      wht_amount: 0,
      total_amount: 107,
      lines: [{ line_no: 1, description: 'Fee', taxable_amount: 100, vat_amount: 7, total_amount: 107 }],
    });
    assert.equal(validation.ok, false);
    assert.ok(validation.errors.some((e) => e.path === 'buyer.tax_id'));
    assert.ok(validation.errors.some((e) => e.path === 'buyer.registered_address'));
  });
});

describe('nextDocumentNo', () => {
  test('locks yearly sequence and increments after issuing number', async () => {
    const calls = [];
    const fakeClient = {
      async query(sql, params) {
        calls.push({ sql, params });
        if (String(sql).includes('SELECT next_seq')) return { rows: [{ next_seq: 42 }] };
        return { rows: [] };
      },
    };
    const no = await nextDocumentNo(fakeClient, 'tax_invoice', new Date('2026-05-14T00:00:00.000Z'));
    assert.equal(no, 'AQ-TI-2026-000042');
    assert.ok(calls.some((call) => String(call.sql).includes('FOR UPDATE')));
    assert.ok(calls.some((call) => String(call.sql).includes('SET next_seq = $3') && call.params[2] === 43));
  });
});
