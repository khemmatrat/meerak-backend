/**
 * Admin audit trail for AQOND Gateway (who viewed masked resources).
 */
/**
 * @param {import('pg').Pool} pool
 * @param {{
 *   adminUserId: string,
 *   adminEmail?: string | null,
 *   action: string,
 *   resourceType: string,
 *   resourceId?: string | null,
 *   ip?: string | null,
 *   metadata?: object,
 *   reasonTag?: string | null,
 * }} p
 */
export async function insertGatewayAuditLog(pool, p) {
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  const reason = p.reasonTag != null && String(p.reasonTag).trim() ? String(p.reasonTag).trim().slice(0, 500) : null;
  try {
    await pool.query(
      `INSERT INTO gateway_audit_logs (admin_user_id, admin_email, action, resource_type, resource_id, ip_address, metadata, reason_tag)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        String(p.adminUserId),
        p.adminEmail || null,
        String(p.action),
        String(p.resourceType),
        p.resourceId != null ? String(p.resourceId) : null,
        p.ip || null,
        JSON.stringify(meta),
        reason,
      ]
    );
  } catch (e) {
    if (e && e.code === '42P01') return;
    if (e && e.code === '42703') {
      await pool.query(
        `INSERT INTO gateway_audit_logs (admin_user_id, admin_email, action, resource_type, resource_id, ip_address, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          String(p.adminUserId),
          p.adminEmail || null,
          String(p.action),
          String(p.resourceType),
          p.resourceId != null ? String(p.resourceId) : null,
          p.ip || null,
          JSON.stringify({ ...meta, reason_tag_fallback: reason }),
        ]
      );
      return;
    }
    throw e;
  }
}
