/**
 * ทดสอบ VIP subscribe → admin live event → vip membership
 * Usage: node backend/scripts/test-vip-admin-flow.js
 */
import pg from 'pg';
import {
  ensureVipSubscriptionSchema,
  createVipSubscriptionOrder,
  activateVipSubscriptionOrder,
  getAdminVipMembership,
} from '../lib/vipSubscriptionService.js';
import {
  ensureAdminLiveEventsSchema,
  listAdminLiveEventsSince,
} from '../lib/adminLiveEvents.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await ensureVipSubscriptionSchema(pool);
  await ensureAdminLiveEventsSchema(pool);

  const u = await pool.query(
    'SELECT id::text, phone, full_name FROM users ORDER BY created_at DESC LIMIT 1',
  );
  const userId = u.rows[0]?.id;
  if (!userId) {
    console.error('NO_USER in DB');
    process.exit(1);
  }
  console.log('Test user:', userId, u.rows[0]?.phone || u.rows[0]?.full_name);

  const since = new Date(Date.now() - 1000).toISOString();
  const order = await createVipSubscriptionOrder(pool, userId, 'gold', {
    status: 'processing',
    payment_method: 'integration_test',
  });
  await activateVipSubscriptionOrder(pool, order.id, {
    payment_method: 'integration_test',
    payment_ref: 'test-run',
  });

  const vip = await getAdminVipMembership(pool, userId);
  const events = await listAdminLiveEventsSince(pool, since);

  console.log('OK VIP:', vip.current.tier, vip.current.display_status);
  console.log('OK started:', vip.current.vip_started_at);
  console.log('OK expires:', vip.current.vip_expiry);
  console.log('OK history:', vip.history.length, 'rows');
  console.log(
    'OK admin events:',
    events.map((e) => `${e.event_type} | ${e.title}`).join('; ') || '(none)',
  );
  process.exit(events.some((e) => e.event_type === 'vip_purchase_active') ? 0 : 2);
} catch (e) {
  console.error('FAIL', e);
  process.exit(1);
} finally {
  await pool.end();
}
