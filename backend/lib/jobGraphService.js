/**
 * Enriched job funnel graphs for admin — commerce events + live jobs/ledger/bids.
 */

function num(v, fallback = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export const FUNNEL_STEPS = [
  { key: 'post', label: 'Post', types: ['job_posted'] },
  { key: 'bid', label: 'Bid', types: ['job_bid'] },
  { key: 'accept', label: 'Accept', types: ['job_bid_accepted', 'job_accepted'] },
  { key: 'pay', label: 'Pay', types: ['payment_created', 'escrow_held'] },
  { key: 'review', label: 'Review', types: ['job_review'] },
];

const EXTRA_TYPES = new Set([
  'job_completed',
  'escrow_released',
  'escrow_refunded',
  'job_disputed',
]);

const TERMINAL_STATUSES = new Set(['cancelled', 'rejected', 'deleted']);

function stepEvents(nodes, step) {
  return (nodes || []).filter((n) => step.types.includes(n.type));
}

function buildAdminActions(stepKey, ctx) {
  const actions = [];
  const push = (a) => actions.push(a);

  switch (stepKey) {
    case 'post':
      push({ id: 'job_ops', label: 'Job Operations', action: 'navigate', view: 'job-ops' });
      push({ id: 'suspend', label: 'ระงับงาน', action: 'api', api: 'suspend_job' });
      push({ id: 'reject', label: 'ปฏิเสธงาน', action: 'api', api: 'reject_job' });
      break;
    case 'bid':
      push({ id: 'job_ops', label: 'ดู Queue / Bids', action: 'navigate', view: 'job-ops' });
      if (ctx.bid_count > 0) {
        push({
          id: 'bids_info',
          label: `${ctx.bid_count} bid(s) ในระบบ`,
          action: 'info',
        });
      }
      break;
    case 'accept':
      push({ id: 'job_ops', label: 'ตรวจ Accept / Applicants', action: 'navigate', view: 'job-ops' });
      if (ctx.bid_count > 0 && !ctx.accepted_by) {
        push({
          id: 'nudge_accept',
          label: 'มี bid แต่ยังไม่ accept',
          action: 'info',
        });
      }
      break;
    case 'pay':
      push({ id: 'wallet', label: 'Wallet & Escrow', action: 'scroll', section: 'wallet' });
      if (ctx.has_escrow && !ctx.has_released) {
        push({ id: 'release_job', label: 'Release escrow (job นี้)', action: 'api', api: 'release_job_escrow' });
      }
      push({ id: 'auto_release', label: 'Auto-release ทั้งระบบ', action: 'api', api: 'run_auto_release' });
      push({ id: 'support_case', label: 'เปิด Support case', action: 'scroll', section: 'actions' });
      break;
    case 'review':
      push({ id: 'incident', label: 'Incident / Disputes', action: 'navigate', view: 'incident-command' });
      push({ id: 'review_mgmt', label: 'Review Management', action: 'navigate', view: 'review-management' });
      break;
    default:
      break;
  }

  if (ctx.job_status === 'disputed' && (stepKey === 'pay' || stepKey === 'review')) {
    push({ id: 'resolve_dispute', label: 'แก้ Dispute', action: 'navigate', view: 'incident-command' });
    push({ id: 'create_case', label: 'สร้าง Support case', action: 'api', api: 'create_support_case' });
  }

  if (stepKey === 'pay' && ctx.has_escrow && !ctx.has_released) {
    push({ id: 'open_payouts', label: 'User Payouts', action: 'navigate', view: 'user-payouts' });
  }

  return actions;
}

/**
 * Stuck-step playbook checklist for ops (escrow / payout / dispute).
 */
export function buildStuckPlaybook(stuckStep, live, steps) {
  if (!stuckStep) return null;

  const st = String(live.job_status || '').toLowerCase();
  const isDispute = st === 'disputed';
  const items = [];

  const push = (item) => items.push(item);

  if (stuckStep === 'pay' || isDispute) {
    push({
      id: 'escrow_ledger',
      label: 'Escrow / payment บันทึกใน ledger',
      done: !!(live.has_escrow || live.has_payment),
      hint: live.has_escrow ? 'มี escrow hold' : 'ยังไม่พบ payment_created / escrow_held',
      action: !live.has_payment
        ? { id: 'wallet', label: 'ตรวจ Wallet', action: 'scroll', section: 'wallet' }
        : undefined,
    });
    push({
      id: 'escrow_release',
      label: 'Escrow release / payout ให้ provider',
      done: !!(live.has_released || String(live.released_status || '').toLowerCase() === 'released'),
      hint: live.released_status ? `status: ${live.released_status}` : (live.has_escrow ? 'รอ release' : '—'),
      action: live.has_escrow && !live.has_released
        ? { id: 'release_job', label: 'Release escrow (job นี้)', action: 'api', api: 'release_job_escrow' }
        : undefined,
    });
    push({
      id: 'payout_pending',
      label: 'ตรวจ pending withdrawal / payout queue',
      done: false,
      hint: 'ตรวจใน User Payouts',
      action: { id: 'open_payouts', label: 'เปิด User Payouts', action: 'navigate', view: 'user-payouts' },
    });
    if (isDispute) {
      push({
        id: 'dispute_ticket',
        label: 'Resolve dispute ใน Incident Command',
        done: false,
        hint: `job status: ${st}`,
        action: { id: 'resolve_dispute', label: 'Incident Command', action: 'navigate', view: 'incident-command' },
      });
      push({
        id: 'dispute_case',
        label: 'เปิด support case สำหรับ dispute',
        done: false,
        action: { id: 'create_case', label: 'สร้าง case', action: 'api', api: 'create_support_case' },
      });
    } else {
      push({
        id: 'pay_support',
        label: 'Support case (ถ้ายอด wallet ไม่ตรง)',
        done: false,
        action: { id: 'create_case', label: 'สร้าง case', action: 'api', api: 'create_support_case' },
      });
    }
  } else if (stuckStep === 'accept') {
    push({
      id: 'bids_exist',
      label: 'มี bid ในระบบ',
      done: (live.bid_count || 0) > 0,
      hint: `${live.bid_count || 0} bid(s)`,
      action: { id: 'job_ops', label: 'Job Ops', action: 'navigate', view: 'job-ops' },
    });
    push({
      id: 'poster_accept',
      label: 'Poster accept provider',
      done: !!live.accepted_by,
      hint: live.accepted_by ? 'accepted' : 'ยังไม่ accept',
      action: !live.accepted_by
        ? { id: 'job_ops', label: 'ตรวจ Applicants', action: 'navigate', view: 'job-ops' }
        : undefined,
    });
  } else if (stuckStep === 'bid') {
    push({
      id: 'job_visible',
      label: 'งานยัง open ในระบบ',
      done: st === 'open',
      hint: `status: ${st}`,
      action: { id: 'job_ops', label: 'Job Ops', action: 'navigate', view: 'job-ops' },
    });
    push({
      id: 'bid_outreach',
      label: 'ไม่มี bid > 72h — ติดตาม poster / ปรับงาน',
      done: (live.bid_count || 0) > 0,
      hint: `${live.job_age_hours || 0}h · ${live.bid_count || 0} bids`,
    });
  } else if (stuckStep === 'review') {
    push({
      id: 'job_completed',
      label: 'งาน completed',
      done: st === 'completed',
      hint: `status: ${st}`,
    });
    push({
      id: 'review_posted',
      label: 'Review ถูกโพสต์',
      done: !!live.has_review,
      action: !live.has_review
        ? { id: 'review_mgmt', label: 'Review Management', action: 'navigate', view: 'review-management' }
        : undefined,
    });
  }

  const title = isDispute
    ? 'Playbook: Dispute + Escrow'
    : stuckStep === 'pay'
      ? 'Playbook: Escrow / Payout'
      : `Playbook: ${stuckStep}`;

  return {
    stuck_step: stuckStep,
    title,
    items,
  };
}

function inferStuckStep(steps, live) {
  const st = String(live.job_status || '').toLowerCase();
  if (TERMINAL_STATUSES.has(st)) return null;
  if (st === 'disputed') return 'pay';

  const done = (key) => steps.find((s) => s.key === key)?.state === 'done';

  if (live.accepted_by && !done('pay') && !done('review')) return 'pay';
  if (done('pay') && st === 'completed' && !done('review')) return 'review';
  if ((live.bid_count || 0) > 0 && !live.accepted_by && !done('accept')) return 'accept';
  if (!done('bid') && st === 'open' && live.job_age_hours > 72 && (live.bid_count || 0) === 0) {
    return 'bid';
  }
  return null;
}

function buildSteps(nodes, live) {
  return FUNNEL_STEPS.map((def) => {
    const events = stepEvents(nodes, def);
    const done = events.length > 0
      || (def.key === 'post' && !!live.created_at)
      || (def.key === 'accept' && !!live.accepted_by)
      || (def.key === 'bid' && (live.bid_count || 0) > 0)
      || (def.key === 'pay' && (live.has_payment || live.has_escrow))
      || (def.key === 'review' && live.has_review);

    let state = done ? 'done' : 'pending';
    const latest = events.length
      ? events.reduce((a, b) => (new Date(a.ts) > new Date(b.ts) ? a : b))
      : null;

    let ts = latest?.ts || null;
    let amount = latest?.amount ?? null;

    if (def.key === 'post' && live.created_at) ts = live.created_at;
    if (def.key === 'accept' && live.accepted_at) ts = live.accepted_at;
    if (def.key === 'pay' && live.last_payment_at) ts = live.last_payment_at;

    const step = {
      key: def.key,
      label: def.label,
      state,
      ts,
      amount,
      events: events.map((e) => ({
        type: e.type,
        ts: e.ts,
        amount: e.amount,
        source: e.source || 'commerce_event',
      })),
      admin_actions: [],
    };
    step.admin_actions = buildAdminActions(def.key, live);
    return step;
  });
}

async function fetchLiveJobContext(pool, jobIds) {
  if (!jobIds.length) return new Map();

  const [jobsRes, bidsRes, ledgerRes, reviewsRes] = await Promise.all([
    pool.query(
      `SELECT id::text AS id, title, status, category, created_by::text, accepted_by::text,
              created_at, updated_at, payment_details, moderation_status
       FROM jobs WHERE id = ANY($1::uuid[])`,
      [jobIds],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT job_id::text AS job_id,
              COUNT(*)::int AS bid_count,
              COUNT(*) FILTER (WHERE LOWER(COALESCE(status,'')) = 'accepted')::int AS accepted_bids,
              MAX(updated_at) AS last_bid_at
       FROM job_bids WHERE job_id = ANY($1::uuid[])
       GROUP BY job_id`,
      [jobIds],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT job_id::text AS job_id,
              BOOL_OR(event_type IN ('payment_created', 'escrow_held')) AS has_payment,
              BOOL_OR(event_type = 'escrow_held') AS has_escrow,
              BOOL_OR(event_type = 'escrow_released') AS has_released,
              MAX(created_at) FILTER (WHERE event_type IN ('payment_created', 'escrow_held')) AS last_payment_at
       FROM payment_ledger_audit
       WHERE job_id = ANY($1::text[])
         AND event_type IN ('payment_created', 'escrow_held', 'escrow_released', 'escrow_refunded')
       GROUP BY job_id`,
      [jobIds],
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT job_id::text AS job_id, COUNT(*)::int AS review_count, MAX(created_at) AS last_review_at
       FROM job_reviews WHERE job_id = ANY($1::uuid[])
       GROUP BY job_id`,
      [jobIds],
    ).catch(() => ({ rows: [] })),
  ]);

  const bidsByJob = new Map((bidsRes.rows || []).map((r) => [r.job_id, r]));
  const ledgerByJob = new Map((ledgerRes.rows || []).map((r) => [r.job_id, r]));
  const reviewsByJob = new Map((reviewsRes.rows || []).map((r) => [r.job_id, r]));

  const map = new Map();
  for (const j of jobsRes.rows || []) {
    const bids = bidsByJob.get(j.id) || {};
    const ledger = ledgerByJob.get(j.id) || {};
    const reviews = reviewsByJob.get(j.id) || {};
    const pd = j.payment_details && typeof j.payment_details === 'object' ? j.payment_details : {};
    const createdAt = j.created_at ? new Date(j.created_at) : null;
    const ageHours = createdAt
      ? (Date.now() - createdAt.getTime()) / 3600000
      : 0;

    map.set(j.id, {
      job_id: j.id,
      title: j.title || null,
      job_status: j.status,
      moderation_status: j.moderation_status,
      category: j.category,
      created_by: j.created_by,
      accepted_by: j.accepted_by,
      created_at: j.created_at,
      updated_at: j.updated_at,
      accepted_at: j.accepted_by ? (j.updated_at || j.created_at) : null,
      bid_count: Number(bids.bid_count || 0),
      accepted_bids: Number(bids.accepted_bids || 0),
      last_bid_at: bids.last_bid_at || null,
      has_payment: !!ledger.has_payment || pd.escrow_held === true || pd.escrow_held === 'true',
      has_escrow: !!ledger.has_escrow || pd.escrow_held === true || pd.escrow_held === 'true',
      has_released: !!ledger.has_released || String(pd.released_status || '').toLowerCase() === 'released',
      last_payment_at: ledger.last_payment_at || null,
      has_review: Number(reviews.review_count || 0) > 0,
      last_review_at: reviews.last_review_at || null,
      released_status: pd.released_status || null,
      job_age_hours: Math.round(ageHours),
    });
  }
  return map;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ limit?: number }} [opts]
 */
export async function buildEnrichedJobGraphs(pool, userId, { limit = 40 } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 40, 10), 120);
  const uid = String(userId || '').trim();

  const rows = await pool.query(
    `SELECT event_type, job_id, event_at AS ts, amount, category, metadata, source_table, source_id
     FROM user_commerce_events
     WHERE user_id = $1::uuid
       AND job_id IS NOT NULL
       AND event_type IN (
         'job_posted', 'job_bid', 'job_bid_accepted', 'job_accepted',
         'payment_created', 'escrow_held', 'job_completed', 'job_disputed',
         'escrow_released', 'escrow_refunded', 'job_review'
       )
     ORDER BY event_at ASC
     LIMIT 800`,
    [uid],
  ).catch(() => ({ rows: [] }));

  const byJob = new Map();
  for (const r of rows.rows || []) {
    const jid = String(r.job_id || '');
    if (!jid) continue;
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid).push({
      type: r.event_type,
      ts: r.ts,
      amount: r.amount != null ? num(r.amount) : null,
      category: r.category,
      metadata: r.metadata,
      source: r.source_table ? `${r.source_table}:${r.source_id || ''}` : 'commerce_event',
    });
  }

  const jobIds = [...byJob.keys()];
  const liveMap = await fetchLiveJobContext(pool, jobIds);

  const graphs = [];
  for (const [jobId, nodes] of byJob.entries()) {
    nodes.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    const live = liveMap.get(jobId) || {
      job_id: jobId,
      job_status: 'unknown',
      bid_count: 0,
      accepted_by: null,
      has_payment: false,
      has_escrow: false,
      has_review: false,
      job_age_hours: 0,
    };

    const steps = buildSteps(nodes, live);
    const stuckStep = inferStuckStep(steps, live);
    if (stuckStep) {
      const stuck = steps.find((s) => s.key === stuckStep);
      if (stuck && stuck.state !== 'done') {
        stuck.state = String(live.job_status || '').toLowerCase() === 'disputed' ? 'blocked' : 'stuck';
      }
    }

    const extras = nodes.filter((n) => EXTRA_TYPES.has(n.type));
    const isStuck = !!stuckStep && !TERMINAL_STATUSES.has(String(live.job_status || '').toLowerCase());
    const playbook = stuckStep ? buildStuckPlaybook(stuckStep, live, steps) : null;
    graphs.push({
      job_id: jobId,
      title: live.title,
      job_status: live.job_status,
      category: live.category,
      user_role:
        live.created_by === uid
          ? 'poster'
          : live.accepted_by === uid
            ? 'provider'
            : 'participant',
      nodes,
      steps,
      stuck_step: stuckStep,
      is_stuck: isStuck,
      playbook,
      edge_summary: nodes.map((n) => n.type).join(' → '),
      extras: extras.map((e) => ({ type: e.type, ts: e.ts, amount: e.amount })),
      live: {
        bid_count: live.bid_count,
        accepted_by: live.accepted_by,
        has_payment: live.has_payment,
        has_escrow: live.has_escrow,
        has_released: live.has_released,
        has_review: live.has_review,
        released_status: live.released_status,
        moderation_status: live.moderation_status,
      },
      data_source: 'user_commerce_events+jobs+ledger',
    });
  }

  graphs.sort((a, b) => {
    const ta = a.nodes.length ? new Date(a.nodes[a.nodes.length - 1].ts).getTime() : 0;
    const tb = b.nodes.length ? new Date(b.nodes[b.nodes.length - 1].ts).getTime() : 0;
    return tb - ta;
  });

  return graphs.slice(0, cap);
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} jobId
 */
export async function buildSingleJobGraphDetail(pool, jobId) {
  const jid = String(jobId || '').trim();
  const rows = await pool.query(
    `SELECT DISTINCT user_id::text AS user_id FROM user_commerce_events WHERE job_id = $1 LIMIT 5`,
    [jid],
  ).catch(() => ({ rows: [] }));

  const liveMap = await fetchLiveJobContext(pool, [jid]);
  const live = liveMap.get(jid);
  if (!live && !rows.rows?.length) return null;

  const eventRows = await pool.query(
    `SELECT event_type, job_id, event_at AS ts, amount, category, metadata, user_id::text AS user_id, source_table, source_id
     FROM user_commerce_events
     WHERE job_id = $1
     ORDER BY event_at ASC`,
    [jid],
  ).catch(() => ({ rows: [] }));

  const nodes = (eventRows.rows || []).map((r) => ({
    type: r.event_type,
    ts: r.ts,
    amount: r.amount != null ? num(r.amount) : null,
    category: r.category,
    metadata: r.metadata,
    user_id: r.user_id,
    source: r.source_table ? `${r.source_table}:${r.source_id || ''}` : 'commerce_event',
  }));

  const ctx = live || { job_id: jid, job_status: 'unknown', bid_count: 0, job_age_hours: 0 };
  const steps = buildSteps(nodes, ctx);
  const stuckStep = inferStuckStep(steps, ctx);
  if (stuckStep) {
    const stuck = steps.find((s) => s.key === stuckStep);
    if (stuck && stuck.state !== 'done') {
      stuck.state = String(ctx.job_status || '').toLowerCase() === 'disputed' ? 'blocked' : 'stuck';
    }
  }
  const playbook = stuckStep ? buildStuckPlaybook(stuckStep, ctx, steps) : null;

  return {
    job_id: jid,
    title: ctx.title,
    job_status: ctx.job_status,
    category: ctx.category,
    nodes,
    steps,
    stuck_step: stuckStep,
    is_stuck: !!stuckStep,
    playbook,
    live: ctx,
    data_source: 'user_commerce_events+jobs+ledger',
  };
}
