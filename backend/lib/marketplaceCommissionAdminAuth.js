/**
 * Marketplace commission admin — financial RBAC (admin-only, not SUPPORT/DEVELOPER/merchant/buyer).
 */
export const MARKETPLACE_COMMISSION_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'ACCOUNTANT',
  'AUDITOR',
]);

export function assertMarketplaceCommissionAdminRole(role) {
  const r = String(role || '').toUpperCase();
  if (!MARKETPLACE_COMMISSION_ADMIN_ROLES.has(r)) {
    return {
      ok: false,
      status: 403,
      error: 'Marketplace commission admin access required',
    };
  }
  return { ok: true };
}

export function marketplaceCommissionAdminMiddleware(adminAuthMiddleware) {
  return (req, res, next) => {
    adminAuthMiddleware(req, res, (err) => {
      if (err) return next(err);
      const gate = assertMarketplaceCommissionAdminRole(req.adminUser?.role);
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error });
      next();
    });
  };
}
