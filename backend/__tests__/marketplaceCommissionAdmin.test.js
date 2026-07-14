/**
 * Marketplace commission admin RBAC — 4 allow + 4 deny roles (8 cases).
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertMarketplaceCommissionAdminRole } from '../lib/marketplaceCommissionAdminAuth.js';

const ALLOW_ROLES = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'AUDITOR'];
const DENY_ROLES = ['SUPPORT', 'DEVELOPER', 'merchant', 'buyer'];

describe('assertMarketplaceCommissionAdminRole — allow group', () => {
  for (const role of ALLOW_ROLES) {
    test(`allows ${role}`, () => {
      const r = assertMarketplaceCommissionAdminRole(role);
      assert.equal(r.ok, true, role);
    });
  }
});

describe('assertMarketplaceCommissionAdminRole — deny group', () => {
  for (const role of DENY_ROLES) {
    test(`denies ${role} with 403`, () => {
      const r = assertMarketplaceCommissionAdminRole(role);
      assert.equal(r.ok, false, role);
      assert.equal(r.status, 403);
      assert.match(String(r.error || ''), /Marketplace commission admin access required/i);
    });
  }
});
