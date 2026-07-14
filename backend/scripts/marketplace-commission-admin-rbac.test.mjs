#!/usr/bin/env node
/** Marketplace commission admin API smoke (backend + storefront must be up). */
import jwt from 'jsonwebtoken';

const BACKEND = process.env.ADMIN_API_BASE || process.env.BACKEND_URL || 'http://127.0.0.1:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function adminToken(role) {
  return jwt.sign({ sub: 'rbac-test-admin', role, email: 'rbac@test.local' }, JWT_SECRET, {
    expiresIn: '5m',
  });
}

async function hit(path, token) {
  const res = await fetch(`${BACKEND}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  const paths = [
    '/api/admin/marketplace/commission/summary',
    '/api/admin/marketplace/commission/orders',
  ];

  for (const path of paths) {
    const noAuth = await hit(path);
    if (noAuth.status !== 401) {
      console.error('FAIL expected 401 without auth', path, noAuth);
      process.exit(1);
    }

    for (const role of ['SUPPORT', 'DEVELOPER', 'merchant', 'buyer']) {
      const denied = await hit(path, adminToken(role));
      if (denied.status !== 403) {
        console.error('FAIL expected 403 for role', role, path, denied);
        process.exit(1);
      }
    }

    const allowed = await hit(path, adminToken('ADMIN'));
    if (allowed.status !== 200 || !allowed.body.ok) {
      console.error('FAIL expected 200 for ADMIN', path, allowed);
      process.exit(1);
    }
  }

  console.log('PASS marketplace commission admin RBAC smoke', { paths: paths.length });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
