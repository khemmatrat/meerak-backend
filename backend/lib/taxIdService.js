/**
 * Smart Tax ID Generator — AQ-[JM/JB/BK]-YYYYMMDD-XXXX
 * Alias for external documents (Revenue Dept, WHT certs). Does NOT replace primary id.
 *
 * JM = Job Match/Board
 * JB = Job Booking
 * BK = Booking (Talent offers)
 */

const PREFIX = 'AQ';
const TYPES = { JM: 'JM', JB: 'JB', BK: 'BK' };

/**
 * @param {'JM'|'JB'|'BK'} type
 * @param {Date|string} date
 * @param {number} seq - 4-digit sequence (0-9999)
 * @returns {string} AQ-JM-20250302-0001
 */
function generateTaxRefId(type, date = new Date(), seq = 0) {
  const t = TYPES[type] || 'JM';
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${y}${m}${day}`;
  const seqStr = String(Math.min(9999, Math.max(0, Math.floor(seq)))).padStart(4, '0');
  return `${PREFIX}-${t}-${dateStr}-${seqStr}`;
}

/**
 * Infer type from event_type / metadata
 * @param {string} eventType - escrow_held, booking_fee, etc.
 * @param {object} metadata - { leg, source }
 * @returns {'JM'|'JB'|'BK'}
 */
function inferTypeFromEvent(eventType, metadata = {}) {
  const leg = (metadata?.leg || '').toLowerCase();
  const source = (metadata?.source || '').toLowerCase();
  if (eventType === 'booking_fee' || leg.includes('booking') || source === 'booking') return 'BK';
  if (eventType === 'escrow_held' && leg === 'commission') {
    return source === 'advance' || metadata?.job_type === 'advance' ? 'JB' : 'JM';
  }
  return 'JM';
}

/**
 * Get next sequence for date+type (caller should pass count from DB)
 * @param {object} pool - pg Pool
 * @param {string} type - JM|JB|BK
 * @param {string} dateStr - YYYYMMDD
 * @returns {Promise<number>} next seq (1-based)
 */
async function getNextSeqForDate(pool, type, dateStr) {
  const prefix = `${PREFIX}-${type}-${dateStr}-`;
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM payment_ledger_audit WHERE tax_ref_id LIKE $1`,
    [prefix + '%']
  );
  return (r.rows?.[0]?.c || 0) + 1;
}

/**
 * Generate tax_ref_id for a new ledger row. Include in INSERT (append-only, no UPDATE).
 * @param {object} pool - pg Pool
 * @param {string} eventType
 * @param {object} metadata
 * @returns {Promise<string>} tax_ref_id
 */
async function generateTaxRefIdForInsert(pool, eventType, metadata) {
  const type = inferTypeFromEvent(eventType, metadata);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const seq = await getNextSeqForDate(pool, type, dateStr);
  return generateTaxRefId(type, now, seq);
}

export { generateTaxRefId, inferTypeFromEvent, getNextSeqForDate, generateTaxRefIdForInsert, TYPES };
