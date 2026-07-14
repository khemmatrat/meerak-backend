/**
 * Compass onboarding — intent survey, step status, routing hints for mobile + v2.
 */

const COMPASS_GOALS = new Set([
  'use_services',
  'shop',
  'food',
  'open_shop',
  'provider_service',
  'rider_delivery',
  'ai_assist',
]);

const ACQUISITION_CHANNELS = new Set([
  'facebook',
  'line',
  'tiktok',
  'friend',
  'google',
  'ads',
  'other',
]);

/** primary_intent → Nexus M2 category label */
const INTENT_M2_CATEGORY = {
  rider_delivery: 'Delivery',
  delivery: 'Delivery',
  provider_service: 'Cleaning',
  cleaning: 'Cleaning',
  driving: 'Driving',
  messenger: 'Messenger',
  public_transport: 'Public Transport',
  technical: 'Repair',
  marine: 'Moving',
};

const COMPASS_TRACK_INTENTS = new Set([
  'rider_delivery',
  'delivery',
  'provider_service',
  'cleaning',
  'driving',
  'messenger',
  'public_transport',
  'technical',
]);

function normalizeKycStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'verified' || s === 'approved') return 'approved';
  if (s === 'pending' || s === 'submitted' || s === 'under_review') return 'pending';
  if (s === 'rejected') return 'rejected';
  return 'not_submitted';
}

function examPassed(examResults, module, category) {
  return (examResults || []).some(
    (r) =>
      Number(r.module) === module &&
      r.passed === true &&
      (category == null || !category || String(r.category || '') === String(category)),
  );
}

function resolveM2Category(primaryIntent) {
  return INTENT_M2_CATEGORY[primaryIntent] || 'Delivery';
}

const PACK_REQUIRED = {
  delivery: [
    'vehicle_photo',
    'vehicle_registration',
    'bank_book',
    'driver_license_front',
    'driver_license_back',
    'bank_account',
    'plate',
  ],
  cleaning: ['bank_book', 'bank_account', 'id_verified'],
  technical: ['bank_book', 'bank_account'],
  driving: [
    'driver_license_front',
    'driver_license_back',
    'vehicle_photo',
    'vehicle_registration',
    'bank_book',
    'bank_account',
  ],
  messenger: ['vehicle_photo', 'driver_license_front', 'bank_book', 'bank_account'],
  public_transport: [
    'yellow_plate',
    'public_transport_license',
    'vehicle_registration',
    'bank_book',
    'bank_account',
  ],
  marine: ['vehicle_photo', 'license_doc', 'bank_book', 'bank_account'],
};

function packKeyFromIntent(primaryIntent) {
  if (primaryIntent === 'rider_delivery') return 'delivery';
  if (primaryIntent === 'provider_service') return 'cleaning';
  return primaryIntent || 'delivery';
}

function categoryPackComplete(pack, primaryIntent) {
  const key = packKeyFromIntent(primaryIntent);
  const section = pack?.[key] || pack?.delivery;
  if (!section) return false;
  const required = PACK_REQUIRED[key] || PACK_REQUIRED.delivery;
  return required.every((f) => {
    const v = section[f];
    if (f === 'id_verified') return v === 'yes' || v === true;
    return !!v;
  });
}

function buildSteps(status) {
  const {
    primaryIntent,
    compassMode,
    kycStatus,
    kycSubmitted,
    categoryPackDone,
    onboardingStatus,
    examResults,
    m2Category,
    riderApproved,
    surveyDone,
  } = status;

  if (!surveyDone) {
    return [{ id: 'survey', label: 'บอกเป้าหมายของคุณ', done: false, href: '/onboarding/compass' }];
  }

  if (!compassMode) {
    return [{ id: 'explore', label: 'สำรวจแอป', done: true, href: '/' }];
  }

  const m1Done =
    examPassed(examResults, 1) ||
    ['MODULE1_PASSED', 'MODULE2_PASSED', 'QUALIFIED', 'TRAINING_COMPLETE'].includes(
      onboardingStatus,
    );
  const m2Done =
    examPassed(examResults, 2, m2Category) ||
    ['MODULE2_PASSED', 'QUALIFIED', 'TRAINING_COMPLETE'].includes(onboardingStatus);
  const m3Done =
    examPassed(examResults, 3) || onboardingStatus === 'TRAINING_COMPLETE';

  const steps = [
    {
      id: 'personal_kyc',
      label: 'ข้อมูลส่วนตัว',
      done: kycSubmitted,
      href: '/kyc?compass=1&step=personal',
      minutes: 4,
    },
    {
      id: 'id_card',
      label: 'ยืนยันบัตรประชาชน',
      done: kycSubmitted,
      href: '/kyc?compass=1&step=id-card',
      minutes: 3,
    },
    {
      id: 'category_pack',
      label: 'เอกสารอาชีพ',
      done: categoryPackDone,
      href: `/compass/category-pack?intent=${encodeURIComponent(primaryIntent || 'rider_delivery')}`,
      minutes: 6,
    },
    {
      id: 'kyc_review',
      label: 'รอตรวจสอบ KYC',
      done: kycStatus === 'approved',
      href: '/compass',
      minutes: 0,
    },
    {
      id: 'module1',
      label: 'Module 1 — ความปลอดภัย',
      done: m1Done,
      href: '/training/course/nexus-professional-standards',
      minutes: 45,
    },
    {
      id: 'module2',
      label: `Module 2 — ${m2Category}`,
      done: m2Done,
      href: `/training/nexus-module2/quiz/${encodeURIComponent(m2Category)}`,
      minutes: 40,
    },
    {
      id: 'module3',
      label: 'Module 3 — มารยาท AQOND',
      done: m3Done,
      href: '/training/nexus-module3',
      minutes: 15,
    },
    {
      id: 'rider_jobs',
      label:
        primaryIntent === 'rider_delivery' || primaryIntent === 'delivery'
          ? 'ไปหน้ารับงาน'
          : 'เริ่มรับงานบริการ',
      done:
        primaryIntent === 'rider_delivery' || primaryIntent === 'delivery'
          ? m3Done && riderApproved
          : m3Done && kycStatus === 'approved',
      href:
        primaryIntent === 'rider_delivery' || primaryIntent === 'delivery'
          ? '/storefront?p=/m/rider/jobs'
          : '/provider/dashboard',
      minutes: 0,
    },
  ];

  return steps;
}

function pickNextStep(steps) {
  const pending = steps.find((s) => !s.done && s.id !== 'kyc_review');
  if (pending) return pending;
  const kycReview = steps.find((s) => s.id === 'kyc_review' && !s.done);
  if (kycReview) return kycReview;
  return steps[steps.length - 1];
}

function derivePrimaryIntent(goals, role) {
  const g = Array.isArray(goals) ? goals : [];
  if (g.includes('rider_delivery')) return 'rider_delivery';
  if (g.includes('provider_service')) return 'provider_service';
  if (g.includes('open_shop')) return 'open_shop';
  if (g.includes('food')) return 'food';
  if (g.includes('shop')) return 'shop';
  if (g.includes('ai_assist')) return 'ai_assist';
  if (g.includes('use_services')) return 'use_services';
  if (String(role || '').toLowerCase() === 'provider') return 'provider_service';
  return 'use_services';
}

function marketplaceHref(primaryIntent) {
  switch (primaryIntent) {
    case 'food':
      return '/m/food';
    case 'shop':
      return '/m/home';
    case 'open_shop':
      return '/m/merchant/shops';
    case 'ai_assist':
      return '/m/home?jarvis=1';
    case 'rider_delivery':
    case 'delivery':
      return '/compass';
    case 'provider_service':
      return '/compass';
    default:
      return '/';
  }
}

export async function getUserRow(pool, userId) {
  const r = await pool.query(
    `SELECT id, role, phone, full_name, email, acquisition_channel, user_goals, primary_intent,
            compass_mode, onboarding_compass_completed_at, compass_category_pack,
            onboarding_status, provider_status, kyc_status
     FROM users WHERE firebase_uid = $1 OR id::text = $1 LIMIT 1`,
    [userId],
  );
  return r.rows[0] || null;
}

export async function getExamResults(pool, userId) {
  try {
    const examRes = await pool.query(
      `SELECT module, category, attempt, score, passed, submitted_at
       FROM user_exam_results WHERE user_id = $1 ORDER BY module, attempt DESC`,
      [userId],
    );
    return examRes.rows || [];
  } catch {
    return [];
  }
}

export async function getLatestKyc(pool, userId) {
  try {
    const r = await pool.query(
      `SELECT status, full_name, submitted_at, address
       FROM kyc_submissions WHERE user_id = $1
       ORDER BY submitted_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [userId],
    );
    return r.rows[0] || null;
  } catch {
    return null;
  }
}

export async function getRiderApproval(pool, userId) {
  try {
    const r = await pool.query(
      `SELECT id, status, kyc_status FROM riders WHERE user_id = $1::text OR user_id = $2 LIMIT 1`,
      [userId, userId],
    );
    const row = r.rows[0];
    if (!row) return { hasRider: false, approved: false, status: null };
    const st = String(row.status || '').toLowerCase();
    const approved = st === 'active' || st === 'approved';
    return { hasRider: true, approved, status: row.status, kyc_status: row.kyc_status };
  } catch {
    return { hasRider: false, approved: false, status: null };
  }
}

export async function buildCompassStatus(pool, userId) {
  const user = await getUserRow(pool, userId);
  if (!user) {
    return {
      found: false,
      surveyDone: false,
      compassMode: false,
      compassCompleted: false,
      steps: [],
      nextAction: { id: 'survey', label: 'เริ่มต้น', href: '/onboarding/compass' },
    };
  }

  const examResults = await getExamResults(pool, user.id);
  const kycRow = await getLatestKyc(pool, user.id);
  const kycStatus = normalizeKycStatus(kycRow?.status || user.kyc_status);
  const kycSubmitted = !!kycRow?.submitted_at || kycStatus === 'pending' || kycStatus === 'approved';
  const surveyDone = !!user.onboarding_compass_completed_at || !!user.acquisition_channel;
  const primaryIntent = user.primary_intent || derivePrimaryIntent(user.user_goals, user.role);
  const m2Category = resolveM2Category(primaryIntent);
  const pack = user.compass_category_pack || {};
  const categoryPackDone = categoryPackComplete(pack, primaryIntent);
  const rider = await getRiderApproval(pool, user.id);

  const inner = {
    primaryIntent,
    compassMode: !!user.compass_mode,
    kycStatus,
    kycSubmitted,
    categoryPackDone,
    onboardingStatus: user.onboarding_status || 'NOT_STARTED',
    examResults,
    m2Category,
    riderApproved: rider.approved,
    surveyDone,
  };

  const steps = buildSteps(inner);
  const next = pickNextStep(steps);
  const allDone =
    surveyDone &&
    (!user.compass_mode ||
      (steps.every((s) => s.done || s.id === 'kyc_review') &&
        (kycStatus === 'approved' || kycStatus === 'pending') &&
        steps.find((s) => s.id === 'module3')?.done));

  return {
    found: true,
    surveyDone,
    compassMode: !!user.compass_mode,
    compassCompleted: !!user.onboarding_compass_completed_at || (!user.compass_mode && surveyDone),
    primaryIntent,
    acquisitionChannel: user.acquisition_channel,
    userGoals: user.user_goals || [],
    kyc: { status: kycStatus, submitted: kycSubmitted },
    onboardingStatus: user.onboarding_status || 'NOT_STARTED',
    providerStatus: user.provider_status || 'UNVERIFIED',
    m2Category,
    categoryPackDone,
    rider: {
      registered: rider.hasRider,
      approved: rider.approved,
      status: rider.status,
    },
    steps,
    nextAction: {
      id: next.id,
      label: next.label,
      href: next.href,
      minutes: next.minutes,
    },
    marketplaceHref: marketplaceHref(primaryIntent),
    progress: {
      completed: steps.filter((s) => s.done).length,
      total: steps.length,
    },
    allDone,
  };
}

export async function submitCompassSurvey(pool, userId, body) {
  const channel = String(body.acquisition_channel || '').trim().toLowerCase();
  if (!ACQUISITION_CHANNELS.has(channel)) {
    throw Object.assign(new Error('invalid acquisition_channel'), { status: 400 });
  }
  const goalsRaw = Array.isArray(body.user_goals) ? body.user_goals : [];
  const goals = goalsRaw.filter((g) => COMPASS_GOALS.has(String(g)));
  if (goals.length === 0) {
    throw Object.assign(new Error('user_goals required'), { status: 400 });
  }

  const user = await getUserRow(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

  const primaryIntent = body.primary_intent
    ? String(body.primary_intent)
    : derivePrimaryIntent(goals, user.role);
  const compassMode =
    COMPASS_TRACK_INTENTS.has(primaryIntent) ||
    goals.includes('rider_delivery') ||
    goals.includes('provider_service') ||
    String(user.role || '').toLowerCase() === 'provider';

  await pool.query(
    `UPDATE users SET
       acquisition_channel = $2,
       user_goals = $3::jsonb,
       primary_intent = $4,
       compass_mode = $5,
       onboarding_compass_completed_at = COALESCE(onboarding_compass_completed_at, NOW()),
       updated_at = NOW()
     WHERE id = $1`,
    [user.id, channel, JSON.stringify(goals), primaryIntent, compassMode],
  );

  if (compassMode && String(user.role || '').toLowerCase() !== 'provider') {
    await pool.query(`UPDATE users SET role = 'provider' WHERE id = $1`, [user.id]);
  }

  return buildCompassStatus(pool, userId);
}

export async function saveCategoryPack(pool, userId, intent, fields) {
  const user = await getUserRow(pool, userId);
  if (!user) throw Object.assign(new Error('User not found'), { status: 404 });
  const key = intent === 'rider_delivery' ? 'delivery' : intent || 'delivery';
  const prev = user.compass_category_pack || {};
  const merged = {
    ...prev,
    [key]: {
      ...(prev[key] || {}),
      ...fields,
      updated_at: new Date().toISOString(),
    },
  };
  await pool.query(
    `UPDATE users SET compass_category_pack = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [user.id, JSON.stringify(merged)],
  );
  return merged;
}

export async function getCompassKycPrefill(pool, userId) {
  const user = await getUserRow(pool, userId);
  if (!user) return null;
  const kyc = await getLatestKyc(pool, user.id);
  const pack = user.compass_category_pack || {};
  const delivery = pack.delivery || {};
  return {
    display_name: user.full_name || kyc?.full_name || '',
    phone: user.phone || '',
    email: user.email || '',
    bank_account: delivery.bank_account || '',
    plate: delivery.plate || '',
    vehicle: delivery.vehicle_type || 'motorcycle',
  };
}

export async function listCompassQueue(pool, { limit = 50, intent } = {}) {
  const params = [limit];
  let where = `compass_mode = TRUE AND onboarding_compass_completed_at IS NOT NULL`;
  if (intent) {
    params.push(intent);
    where += ` AND primary_intent = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, phone, primary_intent, kyc_status, onboarding_status, provider_status,
            onboarding_compass_completed_at, compass_category_pack
     FROM users
     WHERE ${where}
     ORDER BY onboarding_compass_completed_at DESC NULLS LAST
     LIMIT $1`,
    params,
  );
  return r.rows;
}

export {
  COMPASS_GOALS,
  ACQUISITION_CHANNELS,
  COMPASS_TRACK_INTENTS,
  resolveM2Category,
  derivePrimaryIntent,
  marketplaceHref,
};
