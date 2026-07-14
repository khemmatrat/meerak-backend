/**
 * Gold Job Lotto — sync tickets, freeze, draw, dossier
 */
import crypto from 'crypto';
import { formatJobReferenceCode } from './jobDisplayCode.js';

const DEFAULT_CONFIG = {
  enabled: true,
  campaign_id: 'gold-2026',
  title: 'ลุ้นทองคำ 1 บาท',
  period_start: '2026-01-01T00:00:00+07:00',
  period_end: '2026-12-30T11:59:59+07:00',
  draw_at: '2026-12-30T12:00:00+07:00',
  prize_pools: [
    { side: 'employer', label: 'ฝั่งจ้างงาน', prize_count: 1, prize_name: 'ทองคำ 1 บาท' },
    { side: 'provider', label: 'ฝั่งรับงาน', prize_count: 1, prize_name: 'ทองคำ 1 บาท' },
  ],
  exclude_user_ids: [],
  require_kyc_for_winner: true,
  auto_draw_enabled: true,
  public_results_enabled: false,
};

function parseConfig(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { ...DEFAULT_CONFIG, ...parsed };
}

export async function getGoldLottoConfig(pool) {
  try {
    const r = await pool.query(`SELECT value_json FROM payout_config WHERE key = 'gold_lotto_campaign'`);
    const raw = r.rows[0]?.value_json;
    if (!raw) return { ...DEFAULT_CONFIG };
    return parseConfig(raw);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function updateGoldLottoConfig(pool, patch = {}) {
  const current = await getGoldLottoConfig(pool);
  const next = { ...current, ...patch };
  if (patch.prize_pools) next.prize_pools = patch.prize_pools;
  await pool.query(
    `INSERT INTO payout_config (key, value_json, updated_at)
     VALUES ('gold_lotto_campaign', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
    [JSON.stringify(next)],
  );
  await ensureCampaignRow(pool, next);
  return next;
}

async function ensureCampaignRow(pool, config) {
  const id = config.campaign_id || DEFAULT_CONFIG.campaign_id;
  await pool.query(
    `INSERT INTO aqond_gold_lotto_campaigns
       (id, title, period_start, period_end, draw_at, config_json, updated_at)
     VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz, $6::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       period_start = EXCLUDED.period_start,
       period_end = EXCLUDED.period_end,
       draw_at = EXCLUDED.draw_at,
       config_json = EXCLUDED.config_json,
       updated_at = NOW()`,
    [id, config.title, config.period_start, config.period_end, config.draw_at, JSON.stringify(config)],
  );
  return id;
}

export async function getCampaign(pool, campaignId) {
  const r = await pool.query(`SELECT * FROM aqond_gold_lotto_campaigns WHERE id = $1`, [campaignId]);
  return r.rows[0] || null;
}

function isExcludedUser(userId, excludeIds) {
  if (!userId) return true;
  const set = new Set((excludeIds || []).map(String));
  return set.has(String(userId));
}

async function loadActiveUserIds(pool, userIds) {
  if (!userIds.length) return new Set();
  const r = await pool.query(
    `SELECT id FROM users WHERE id = ANY($1::uuid[]) AND COALESCE(account_status, 'active') = 'active'`,
    [userIds],
  );
  return new Set(r.rows.map((x) => String(x.id)));
}

export function isKycVerifiedStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'verified' || s === 'approved';
}

async function filterTicketsForKyc(pool, tickets, requireKyc) {
  if (!requireKyc || !tickets.length) return tickets;
  const userIds = [...new Set(tickets.map((t) => t.participant_user_id))];
  const r = await pool.query(
    `SELECT id FROM users
     WHERE id = ANY($1::uuid[])
       AND LOWER(COALESCE(kyc_status, '')) IN ('verified', 'approved')`,
    [userIds],
  );
  const ok = new Set(r.rows.map((x) => String(x.id)));
  return tickets.filter((t) => ok.has(String(t.participant_user_id)));
}

async function getFcmTokensForUser(pool, userId) {
  try {
    const r = await pool.query(
      `SELECT token FROM fcm_tokens WHERE user_id = $1::uuid AND token IS NOT NULL`,
      [userId],
    );
    return (r.rows || []).map((x) => x.token).filter(Boolean);
  } catch {
    return [];
  }
}

async function notifyGoldLottoWinner(pool, winnerRow) {
  const userId = winnerRow.winner_user_id;
  if (!userId) return;
  const title = 'ยินดีด้วย! คุณได้รับรางวัลทองคำ';
  const message = 'กรุณายืนยันที่อยู่จัดส่งรางวัลในแอป Gold Lotto';
  const data = {
    notification_type: 'gold_lotto_winner',
    campaign_id: winnerRow.campaign_id,
    winner_id: winnerRow.id,
    deep_link: '/gold-lotto',
  };
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, data, created_at)
     VALUES ($1::uuid, 'gold_lotto_winner', $2, $3, $4::jsonb, NOW())`,
    [userId, title, message, JSON.stringify(data)],
  ).catch(() => { });
  try {
    const tokens = await getFcmTokensForUser(pool, userId);
    if (tokens.length) {
      const { sendFcmMulticast } = await import('./fcmService.js');
      await sendFcmMulticast(tokens, {
        title,
        body: message,
        icon: '/logo.png',
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      });
    }
  } catch (e) {
    console.warn('[gold-lotto] FCM notify failed:', e?.message || e);
  }
}

const DELIVERY_STATUSES = new Set([
  'pending_delivery',
  'awaiting_address',
  'address_submitted',
  'delivered',
  'confirmed',
  'declined',
]);

async function fetchMatchJobs(pool, periodStart, periodEnd) {
  const r = await pool.query(
    `SELECT id, category, title, created_at, updated_at,
            COALESCE(client_id, created_by) AS employer_id,
            accepted_by AS provider_id,
            location, location_lat, location_lng, latitude, longitude,
            price, budget_amount
     FROM jobs
     WHERE status = 'completed'
       AND LOWER(COALESCE(payment_status, '')) = 'paid'
       AND COALESCE(updated_at, created_at) >= $1::timestamptz
       AND COALESCE(updated_at, created_at) <= $2::timestamptz
       AND accepted_by IS NOT NULL
       AND COALESCE(client_id, created_by) IS NOT NULL`,
    [periodStart, periodEnd],
  );
  return r.rows.map((row) => ({
    job_source: 'match',
    job_id: String(row.id),
    category: row.category || 'General',
    title: row.title || '',
    created_at: row.created_at,
    completed_at: row.updated_at || row.created_at,
    employer_id: row.employer_id,
    provider_id: row.provider_id,
    location_text: typeof row.location === 'string' ? row.location : row.location?.address || '',
    lat: row.location_lat ?? row.latitude,
    lng: row.location_lng ?? row.longitude,
    price: row.price ?? row.budget_amount,
  }));
}

async function fetchAdvanceJobs(pool, periodStart, periodEnd) {
  const r = await pool.query(
    `SELECT id, category, title, created_at, updated_at, closed_at,
            employer_id, hired_user_id AS provider_id,
            agreed_amount, max_budget, escrow_status
     FROM advance_jobs
     WHERE status = 'completed'
       AND hired_user_id IS NOT NULL
       AND escrow_status = 'released'
       AND COALESCE(closed_at, updated_at, created_at) >= $1::timestamptz
       AND COALESCE(closed_at, updated_at, created_at) <= $2::timestamptz`,
    [periodStart, periodEnd],
  );
  return r.rows.map((row) => ({
    job_source: 'advance',
    job_id: String(row.id),
    category: row.category || 'Advance',
    title: row.title || '',
    created_at: row.created_at,
    completed_at: row.closed_at || row.updated_at || row.created_at,
    employer_id: row.employer_id,
    provider_id: row.provider_id,
    location_text: '',
    lat: null,
    lng: null,
    price: row.agreed_amount ?? row.max_budget,
  }));
}

async function fetchBookingJobs(pool, periodStart, periodEnd) {
  const r = await pool.query(
    `SELECT b.id, b.created_at, b.updated_at, b.booker_id AS employer_id, b.talent_id AS provider_id,
            b.deposit_amount, b.status, b.deposit_status
     FROM bookings b
     WHERE b.status = 'completed'
       AND b.deposit_status = 'released'
       AND COALESCE(b.updated_at, b.created_at) >= $1::timestamptz
       AND COALESCE(b.updated_at, b.created_at) <= $2::timestamptz`,
    [periodStart, periodEnd],
  );
  return r.rows.map((row) => ({
    job_source: 'booking',
    job_id: String(row.id),
    category: 'Booking',
    title: 'การจองคิว',
    created_at: row.created_at,
    completed_at: row.updated_at || row.created_at,
    employer_id: row.employer_id,
    provider_id: row.provider_id,
    location_text: '',
    lat: null,
    lng: null,
    price: row.deposit_amount,
  }));
}

function jobToTickets(job, config) {
  const tickets = [];
  const displayCode = formatJobReferenceCode({
    id: job.job_id,
    category: job.category,
    created_at: job.created_at,
  });
  const base = {
    job_source: job.job_source,
    job_id: job.job_id,
    display_code: displayCode,
    job_category: job.category,
    job_title: job.title,
    job_location_text: job.location_text,
    job_lat: job.lat,
    job_lng: job.lng,
    job_price: job.price,
    job_completed_at: job.completed_at,
    eligible_at: job.completed_at,
  };
  if (
    job.employer_id &&
    job.provider_id &&
    String(job.employer_id) !== String(job.provider_id) &&
    !isExcludedUser(job.employer_id, config.exclude_user_ids)
  ) {
    tickets.push({ ...base, side: 'employer', participant_user_id: job.employer_id });
  }
  if (
    job.provider_id &&
    job.employer_id &&
    String(job.employer_id) !== String(job.provider_id) &&
    !isExcludedUser(job.provider_id, config.exclude_user_ids)
  ) {
    tickets.push({ ...base, side: 'provider', participant_user_id: job.provider_id });
  }
  return tickets;
}

export async function syncTicketPool(pool, { campaignId: cid } = {}) {
  const config = await getGoldLottoConfig(pool);
  const campaignId = cid || config.campaign_id;
  await ensureCampaignRow(pool, config);

  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) throw Object.assign(new Error('campaign_not_found'), { code: 'GOLD_LOTTO_NOT_FOUND' });
  if (campaign.status === 'frozen' || campaign.status === 'drawn' || campaign.status === 'published') {
    throw Object.assign(new Error('campaign_frozen'), { code: 'GOLD_LOTTO_FROZEN' });
  }

  const periodStart = config.period_start;
  const periodEnd = config.period_end;

  const [matchJobs, advanceJobs, bookingJobs] = await Promise.all([
    fetchMatchJobs(pool, periodStart, periodEnd),
    fetchAdvanceJobs(pool, periodStart, periodEnd),
    fetchBookingJobs(pool, periodStart, periodEnd),
  ]);

  const allJobs = [...matchJobs, ...advanceJobs, ...bookingJobs];
  let tickets = allJobs.flatMap((j) => jobToTickets(j, config));

  const userIds = [...new Set(tickets.map((t) => t.participant_user_id))];
  const activeUsers = await loadActiveUserIds(pool, userIds);
  tickets = tickets.filter((t) => activeUsers.has(String(t.participant_user_id)));

  await pool.query(`DELETE FROM aqond_gold_lotto_tickets WHERE campaign_id = $1 AND frozen_at IS NULL`, [
    campaignId,
  ]);

  let inserted = 0;
  for (const t of tickets) {
    const ins = await pool.query(
      `INSERT INTO aqond_gold_lotto_tickets (
         campaign_id, job_source, job_id, display_code, side, participant_user_id,
         job_category, job_title, job_location_text, job_lat, job_lng, job_price,
         job_completed_at, eligible_at
       ) VALUES ($1,$2,$3,$4,$5,$6::uuid,$7,$8,$9,$10,$11,$12,$13::timestamptz,$14::timestamptz)
       ON CONFLICT (campaign_id, job_source, job_id, side) DO UPDATE SET
         display_code = EXCLUDED.display_code,
         job_category = EXCLUDED.job_category,
         job_title = EXCLUDED.job_title,
         job_location_text = EXCLUDED.job_location_text,
         job_lat = EXCLUDED.job_lat,
         job_lng = EXCLUDED.job_lng,
         job_price = EXCLUDED.job_price,
         job_completed_at = EXCLUDED.job_completed_at,
         eligible_at = EXCLUDED.eligible_at
       WHERE aqond_gold_lotto_tickets.frozen_at IS NULL
       RETURNING id`,
      [
        campaignId,
        t.job_source,
        t.job_id,
        t.display_code,
        t.side,
        t.participant_user_id,
        t.job_category,
        t.job_title,
        t.job_location_text,
        t.job_lat,
        t.job_lng,
        t.job_price,
        t.job_completed_at,
        t.eligible_at,
      ],
    );
    if (ins.rowCount) inserted += 1;
  }

  const counts = await pool.query(
    `SELECT side, COUNT(*)::int AS c FROM aqond_gold_lotto_tickets WHERE campaign_id = $1 GROUP BY side`,
    [campaignId],
  );
  const employerCount = counts.rows.find((x) => x.side === 'employer')?.c || 0;
  const providerCount = counts.rows.find((x) => x.side === 'provider')?.c || 0;

  await pool.query(
    `UPDATE aqond_gold_lotto_campaigns SET
       ticket_count_employer = $2,
       ticket_count_provider = $3,
       updated_at = NOW()
     WHERE id = $1`,
    [campaignId, employerCount, providerCount],
  );

  return {
    campaign_id: campaignId,
    jobs_scanned: allJobs.length,
    tickets_upserted: inserted,
    ticket_count_employer: employerCount,
    ticket_count_provider: providerCount,
  };
}

export async function freezeTicketPool(pool, { campaignId: cid } = {}) {
  const config = await getGoldLottoConfig(pool);
  const campaignId = cid || config.campaign_id;
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) throw Object.assign(new Error('campaign_not_found'), { code: 'GOLD_LOTTO_NOT_FOUND' });
  if (['drawn', 'published'].includes(campaign.status)) {
    throw Object.assign(new Error('already_drawn'), { code: 'GOLD_LOTTO_ALREADY_DRAWN' });
  }

  await pool.query(
    `UPDATE aqond_gold_lotto_tickets SET frozen_at = NOW() WHERE campaign_id = $1 AND frozen_at IS NULL`,
    [campaignId],
  );
  await pool.query(
    `UPDATE aqond_gold_lotto_campaigns SET status = 'frozen', frozen_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [campaignId],
  );
  return { campaign_id: campaignId, status: 'frozen' };
}

async function buildDossier(pool, campaignId, userId, winningTicket) {
  const u = await pool.query(
    `SELECT id, full_name, phone, COALESCE(email, contact_email) AS email,
            avatar_url, kyc_status, rating, completed_jobs_count
     FROM users WHERE id = $1::uuid`,
    [userId],
  );
  const user = u.rows[0] || {};
  const skills = await pool.query(
    `SELECT skill_category, skill_name, is_certified FROM user_skills WHERE user_id = $1::uuid LIMIT 20`,
    [userId],
  );
  const ticketCounts = await pool.query(
    `SELECT side, COUNT(*)::int AS c FROM aqond_gold_lotto_tickets
     WHERE campaign_id = $1 AND participant_user_id = $2::uuid GROUP BY side`,
    [campaignId, userId],
  );
  const counts = {};
  for (const row of ticketCounts.rows) counts[row.side] = row.c;

  return {
    user: {
      id: user.id,
      full_name: user.full_name,
      phone: user.phone,
      email: user.email,
      avatar_url: user.avatar_url,
      kyc_status: user.kyc_status,
      rating: user.rating,
      completed_jobs_count: user.completed_jobs_count,
    },
    skills: skills.rows,
    ticket_counts: counts,
    winning_job: {
      display_code: winningTicket.display_code,
      job_source: winningTicket.job_source,
      job_id: winningTicket.job_id,
      category: winningTicket.job_category,
      title: winningTicket.job_title,
      location: winningTicket.job_location_text,
      lat: winningTicket.job_lat,
      lng: winningTicket.job_lng,
      price: winningTicket.job_price,
      completed_at: winningTicket.job_completed_at,
    },
    built_at: new Date().toISOString(),
  };
}

async function getFrozenTicketsForPool(pool, campaignId, side, excludeUserIds) {
  const exclude = [...excludeUserIds];
  const r = await pool.query(
    `SELECT * FROM aqond_gold_lotto_tickets
     WHERE campaign_id = $1 AND side = $2 AND frozen_at IS NOT NULL
       AND NOT (participant_user_id = ANY($3::uuid[]))
     ORDER BY id`,
    [campaignId, side, exclude.length ? exclude : ['00000000-0000-0000-0000-000000000000']],
  );
  if (!exclude.length) {
    const all = await pool.query(
      `SELECT * FROM aqond_gold_lotto_tickets
       WHERE campaign_id = $1 AND side = $2 AND frozen_at IS NOT NULL
       ORDER BY id`,
      [campaignId, side],
    );
    return all.rows;
  }
  return r.rows;
}

export async function runGoldLottoDraw(pool, { campaignId: cid, triggerType = 'manual', adminId = null } = {}) {
  const config = await getGoldLottoConfig(pool);
  const campaignId = cid || config.campaign_id;
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) throw Object.assign(new Error('campaign_not_found'), { code: 'GOLD_LOTTO_NOT_FOUND' });

  const existingWinners = await pool.query(
    `SELECT * FROM aqond_gold_lotto_winners WHERE campaign_id = $1 ORDER BY pool_side, prize_rank`,
    [campaignId],
  );
  if (existingWinners.rows.length > 0) {
    return {
      campaign_id: campaignId,
      already_drawn: true,
      winners: existingWinners.rows,
    };
  }

  if (campaign.status !== 'frozen') {
    throw Object.assign(new Error('campaign_not_frozen'), { code: 'GOLD_LOTTO_NOT_FROZEN' });
  }

  const globalWinnerUserIds = new Set();
  const winners = [];
  const pools = config.prize_pools || DEFAULT_CONFIG.prize_pools;

  for (const poolDef of pools) {
    const side = poolDef.side;
    const prizeCount = Math.max(1, Number(poolDef.prize_count) || 1);
    const prizeName = poolDef.prize_name || 'ทองคำ 1 บาท';
    const excludeIds = [...globalWinnerUserIds];

    for (let rank = 1; rank <= prizeCount; rank += 1) {
      const existingRun = await pool.query(
        `SELECT id FROM aqond_gold_lotto_draw_runs WHERE campaign_id = $1 AND pool_side = $2 AND prize_rank = $3`,
        [campaignId, side, rank],
      );
      if (existingRun.rows.length) continue;

      let tickets = await getFrozenTicketsForPool(pool, campaignId, side, [...excludeIds]);
      if (config.require_kyc_for_winner) {
        tickets = await filterTicketsForKyc(pool, tickets, true);
      }
      if (!tickets.length) break;

      const winningIndex = crypto.randomInt(0, tickets.length);
      const winningTicket = tickets[winningIndex];
      const winnerUserId = winningTicket.participant_user_id;

      if (globalWinnerUserIds.has(String(winnerUserId))) continue;

      const seed = crypto.randomBytes(32).toString('hex');
      const rngHash = crypto
        .createHash('sha256')
        .update(`${seed}:${campaignId}:${side}:${rank}:${winningIndex}`)
        .digest('hex');

      const dossier = await buildDossier(pool, campaignId, winnerUserId, winningTicket);

      const runIns = await pool.query(
        `INSERT INTO aqond_gold_lotto_draw_runs
           (campaign_id, trigger_type, admin_id, pool_side, prize_rank, ticket_count, winning_index, winning_ticket_id, rng_seed_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid,$9)
         RETURNING *`,
        [
          campaignId,
          triggerType,
          adminId,
          side,
          rank,
          tickets.length,
          winningIndex,
          winningTicket.id,
          rngHash,
        ],
      );

      const winIns = await pool.query(
        `INSERT INTO aqond_gold_lotto_winners
           (campaign_id, pool_side, prize_rank, prize_name, winner_user_id, winning_ticket_id,
            winning_display_code, dossier_json, marketing_lock, delivery_status)
         VALUES ($1,$2,$3,$4,$5::uuid,$6::uuid,$7,$8::jsonb, TRUE, 'pending_delivery')
         RETURNING *`,
        [
          campaignId,
          side,
          rank,
          prizeName,
          winnerUserId,
          winningTicket.id,
          winningTicket.display_code,
          JSON.stringify(dossier),
        ],
      );

      globalWinnerUserIds.add(String(winnerUserId));
      excludeIds.push(winnerUserId);
      winners.push({ ...winIns.rows[0], draw_run: runIns.rows[0] });
    }
  }

  await pool.query(
    `UPDATE aqond_gold_lotto_campaigns SET status = 'drawn', drawn_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [campaignId],
  );

  return { campaign_id: campaignId, winners, already_drawn: false };
}

export async function publishGoldLottoResults(pool, { campaignId: cid } = {}) {
  const config = await getGoldLottoConfig(pool);
  const campaignId = cid || config.campaign_id;
  const campaign = await getCampaign(pool, campaignId);
  if (!campaign) {
    throw Object.assign(new Error('campaign_not_found'), { code: 'GOLD_LOTTO_NOT_FOUND' });
  }
  if (campaign.status !== 'drawn') {
    throw Object.assign(new Error('campaign_not_drawn'), { code: 'GOLD_LOTTO_NOT_DRAWN' });
  }
  const wc = await pool.query(
    `SELECT COUNT(*)::int AS c FROM aqond_gold_lotto_winners WHERE campaign_id = $1`,
    [campaignId],
  );
  if (!(wc.rows[0]?.c > 0)) {
    throw Object.assign(new Error('no_winners'), { code: 'GOLD_LOTTO_NO_WINNERS' });
  }
  await pool.query(
    `UPDATE aqond_gold_lotto_campaigns SET status = 'published', published_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [campaignId],
  );
  await pool.query(
    `UPDATE aqond_gold_lotto_winners SET
       published_at = NOW(),
       delivery_status = CASE
         WHEN delivery_status = 'pending_delivery' THEN 'awaiting_address'
         ELSE delivery_status
       END,
       updated_at = NOW()
     WHERE campaign_id = $1 AND published_at IS NULL`,
    [campaignId],
  );
  const winnerRows = await pool.query(
    `SELECT * FROM aqond_gold_lotto_winners WHERE campaign_id = $1`,
    [campaignId],
  );
  for (const w of winnerRows.rows) {
    await notifyGoldLottoWinner(pool, w);
  }
  if (campaignId === config.campaign_id) {
    await updateGoldLottoConfig(pool, { public_results_enabled: true });
  }
  return { campaign_id: campaignId, status: 'published' };
}

export async function listPublicWinners(pool, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  if (!config.public_results_enabled) {
    const camp = await getCampaign(pool, cid);
    if (camp?.status !== 'published') return [];
  }
  const r = await pool.query(
    `SELECT w.id, w.campaign_id, w.pool_side, w.prize_rank, w.prize_name,
            w.winning_display_code, w.published_at, w.created_at,
            w.dossier_json->'user'->>'full_name' AS winner_name,
            w.dossier_json->'winning_job' AS winning_job
     FROM aqond_gold_lotto_winners w
     WHERE w.campaign_id = $1 AND w.published_at IS NOT NULL
     ORDER BY w.pool_side, w.prize_rank`,
    [cid],
  );
  return r.rows;
}

export async function getUserTicketStats(pool, userId, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  const r = await pool.query(
    `SELECT side, COUNT(*)::int AS c FROM aqond_gold_lotto_tickets
     WHERE campaign_id = $1 AND participant_user_id = $2::uuid
     GROUP BY side`,
    [cid, userId],
  );
  const stats = { employer: 0, provider: 0, total: 0 };
  for (const row of r.rows) {
    stats[row.side] = row.c;
    stats.total += row.c;
  }
  const win = await pool.query(
    `SELECT id, campaign_id, pool_side, prize_rank, prize_name, winning_display_code,
            delivery_status, delivery_address_json, delivery_consent_at,
            delivery_delivered_at, delivery_confirmed_at, published_at, created_at
     FROM aqond_gold_lotto_winners WHERE campaign_id = $1 AND winner_user_id = $2::uuid
     ORDER BY pool_side, prize_rank`,
    [cid, userId],
  );
  return { ...stats, wins: win.rows };
}

export async function getUserPrizeWins(pool, userId, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  const r = await pool.query(
    `SELECT w.id, w.campaign_id, w.pool_side, w.prize_rank, w.prize_name,
            w.winning_display_code, w.delivery_status, w.delivery_address_json,
            w.delivery_consent_at, w.delivery_delivered_at, w.delivery_confirmed_at,
            w.published_at, w.created_at,
            w.dossier_json->'user'->>'kyc_status' AS kyc_status
     FROM aqond_gold_lotto_winners w
     WHERE w.campaign_id = $1 AND w.winner_user_id = $2::uuid
     ORDER BY w.pool_side, w.prize_rank`,
    [cid, userId],
  );
  return r.rows;
}

export async function submitWinnerDeliveryAddress(
  pool,
  userId,
  { winnerId, recipient_name, phone, address_line, subdistrict, district, province, postal_code, consent } = {},
) {
  if (!consent) {
    throw Object.assign(new Error('consent_required'), { code: 'GOLD_LOTTO_CONSENT_REQUIRED' });
  }
  const name = String(recipient_name || '').trim();
  const addr = String(address_line || '').trim();
  const prov = String(province || '').trim();
  if (!name || !addr || !prov) {
    throw Object.assign(new Error('address_incomplete'), { code: 'GOLD_LOTTO_ADDRESS_INCOMPLETE' });
  }
  const r = await pool.query(
    `SELECT * FROM aqond_gold_lotto_winners
     WHERE id = $1::uuid AND winner_user_id = $2::uuid`,
    [winnerId, userId],
  );
  const winner = r.rows[0];
  if (!winner) {
    throw Object.assign(new Error('not_found'), { code: 'GOLD_LOTTO_WINNER_NOT_FOUND' });
  }
  if (!['awaiting_address', 'address_submitted'].includes(winner.delivery_status)) {
    throw Object.assign(new Error('delivery_locked'), { code: 'GOLD_LOTTO_DELIVERY_LOCKED' });
  }
  const addressJson = {
    recipient_name: name,
    phone: String(phone || '').trim(),
    address_line: addr,
    subdistrict: String(subdistrict || '').trim(),
    district: String(district || '').trim(),
    province: prov,
    postal_code: String(postal_code || '').trim(),
    submitted_at: new Date().toISOString(),
  };
  const upd = await pool.query(
    `UPDATE aqond_gold_lotto_winners SET
       delivery_address_json = $2::jsonb,
       delivery_consent_at = NOW(),
       delivery_status = 'address_submitted',
       updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [winnerId, JSON.stringify(addressJson)],
  );
  return upd.rows[0];
}

export async function confirmWinnerDeliveryReceipt(pool, userId, winnerId) {
  const r = await pool.query(
    `SELECT * FROM aqond_gold_lotto_winners
     WHERE id = $1::uuid AND winner_user_id = $2::uuid`,
    [winnerId, userId],
  );
  const winner = r.rows[0];
  if (!winner) {
    throw Object.assign(new Error('not_found'), { code: 'GOLD_LOTTO_WINNER_NOT_FOUND' });
  }
  if (winner.delivery_status !== 'delivered') {
    throw Object.assign(new Error('not_delivered_yet'), { code: 'GOLD_LOTTO_NOT_DELIVERED' });
  }
  const upd = await pool.query(
    `UPDATE aqond_gold_lotto_winners SET
       delivery_status = 'confirmed',
       delivery_confirmed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1::uuid
     RETURNING *`,
    [winnerId],
  );
  return upd.rows[0];
}

export async function adminListWinners(pool, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  const r = await pool.query(
    `SELECT w.*, u.full_name, u.phone, COALESCE(u.email, u.contact_email) AS email
     FROM aqond_gold_lotto_winners w
     JOIN users u ON u.id = w.winner_user_id
     WHERE w.campaign_id = $1
     ORDER BY w.pool_side, w.prize_rank`,
    [cid],
  );
  return r.rows;
}

export async function adminUpdateWinner(pool, winnerId, patch) {
  const sets = [];
  const params = [winnerId];
  let i = 2;
  if (patch.marketing_lock != null) {
    sets.push(`marketing_lock = $${i++}`);
    params.push(Boolean(patch.marketing_lock));
  }
  if (patch.contact_status != null) {
    sets.push(`contact_status = $${i++}`);
    params.push(String(patch.contact_status));
  }
  if (patch.delivery_status != null) {
    const ds = String(patch.delivery_status);
    if (!DELIVERY_STATUSES.has(ds)) {
      throw Object.assign(new Error('invalid_delivery_status'), { code: 'GOLD_LOTTO_INVALID_DELIVERY_STATUS' });
    }
    sets.push(`delivery_status = $${i++}`);
    params.push(ds);
    if (ds === 'delivered') {
      sets.push('delivery_delivered_at = NOW()');
    }
    if (ds === 'confirmed') {
      sets.push('delivery_confirmed_at = NOW()');
    }
  }
  if (patch.delivery_notes != null) {
    sets.push(`delivery_notes = $${i++}`);
    params.push(String(patch.delivery_notes));
  }
  if (!sets.length) return null;
  sets.push('updated_at = NOW()');
  const r = await pool.query(
    `UPDATE aqond_gold_lotto_winners SET ${sets.join(', ')} WHERE id = $1::uuid RETURNING *`,
    params,
  );
  return r.rows[0] || null;
}

export async function adminListDrawRuns(pool, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  const r = await pool.query(
    `SELECT * FROM aqond_gold_lotto_draw_runs WHERE campaign_id = $1 ORDER BY created_at`,
    [cid],
  );
  return r.rows;
}

export async function getPublicCampaignSummary(pool) {
  const config = await getGoldLottoConfig(pool);
  if (!config.enabled) return { enabled: false };
  const campaign = await getCampaign(pool, config.campaign_id);
  return {
    enabled: true,
    config,
    campaign: campaign
      ? {
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        period_start: campaign.period_start,
        period_end: campaign.period_end,
        draw_at: campaign.draw_at,
        ticket_count_employer: campaign.ticket_count_employer,
        ticket_count_provider: campaign.ticket_count_provider,
        frozen_at: campaign.frozen_at,
        drawn_at: campaign.drawn_at,
        published_at: campaign.published_at,
      }
      : null,
  };
}

export async function tryAutoDraw(pool) {
  const config = await getGoldLottoConfig(pool);
  if (!config.enabled || !config.auto_draw_enabled) return { skipped: true, reason: 'disabled' };

  const campaign = await getCampaign(pool, config.campaign_id);
  if (!campaign) return { skipped: true, reason: 'no_campaign' };
  if (campaign.status !== 'frozen') return { skipped: true, reason: 'not_frozen', status: campaign.status };

  const drawAt = new Date(config.draw_at);
  if (Number.isNaN(drawAt.getTime()) || Date.now() < drawAt.getTime()) {
    return { skipped: true, reason: 'not_yet', draw_at: config.draw_at };
  }

  const result = await runGoldLottoDraw(pool, {
    campaignId: config.campaign_id,
    triggerType: 'auto',
    adminId: null,
  });
  return { skipped: false, ...result };
}

export async function getLiveDrawPayload(pool, campaignId) {
  const config = await getGoldLottoConfig(pool);
  const cid = campaignId || config.campaign_id;
  const winners = await pool.query(
    `SELECT pool_side, prize_rank, winning_display_code, prize_name,
            dossier_json->'user'->>'full_name' AS winner_name
     FROM aqond_gold_lotto_winners
     WHERE campaign_id = $1
     ORDER BY pool_side, prize_rank`,
    [cid],
  );
  const runs = await adminListDrawRuns(pool, cid);
  return { campaign_id: cid, winners: winners.rows, draw_runs: runs };
}
