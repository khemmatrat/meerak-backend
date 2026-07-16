/**
 * Rider face session — Level B (standard) + Level C (strong) verification gates.
 */
import { createHash, randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { getRiderKycPortrait } from './riderKycPortrait.js';
import { compareRiderFaces, riderFaceMatchThreshold } from './riderFaceMatch.js';
import { notifyRiderFaceIncident } from './riderFaceAlerts.js';
import { detectRiderUniform } from './riderUniformCheck.js';

const REQUIRED_LIVENESS_STEPS = ['center', 'turn_left', 'turn_right', 'blink'];

function jwtSecret() {
  return (
    process.env.JWT_SECRET ||
    process.env.MEERAK_JWT_SECRET ||
    ''
  ).trim();
}

export function riderFaceSessionTtlHours() {
  const n = Number(process.env.RIDER_FACE_SESSION_TTL_HOURS ?? 8);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export function riderFacePassengerTtlMinutes() {
  const n = Number(process.env.RIDER_FACE_PASSENGER_TTL_MINUTES ?? 30);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

/** โซนเวลาสำหรับ “วันละครั้ง” (ตอกบัตรเช้า) */
export function riderFaceDailyTz() {
  return String(process.env.RIDER_FACE_DAILY_TZ || 'Asia/Bangkok').trim() || 'Asia/Bangkok';
}

/** ชั่วโมงรีเซ็ตกิจวัตรรายวัน (เช่น 06:00 = สแกนใหม่หลัง 6 โมงเช้า Bangkok) */
export function riderFaceDailyResetHour() {
  const n = Number(process.env.RIDER_FACE_DAILY_RESET_HOUR ?? 6);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.floor(n) : 5;
}

/**
 * รอบตรวจเข้มงวด — Strong (default 3 วัน)
 */
export function riderFaceStrictReverifyDays() {
  const n = Number(process.env.RIDER_FACE_STRICT_REVERIFY_DAYS ?? 3);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

/** รอบตรวจเข้มงวด — Standard (default 5 วัน) */
export function riderFaceStrictReverifyDaysStandard() {
  const n = Number(
    process.env.RIDER_FACE_STRICT_REVERIFY_DAYS_STANDARD ??
      process.env.RIDER_FACE_STRICT_REVERIFY_DAYS_RELAXED ??
      5,
  );
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export function riderFaceStrictReverifyDaysForLevel(level) {
  return level === 'strong' ? riderFaceStrictReverifyDays() : riderFaceStrictReverifyDaysStandard();
}

/** @deprecated ใช้ riderFaceStrictReverifyDaysStandard */
export function riderFaceStrictReverifyDaysRelaxed() {
  return riderFaceStrictReverifyDaysStandard();
}

/** @deprecated ใช้ riderFaceStrictReverifyDays แทน */
export function riderFaceReverifyIntervalHours() {
  return riderFaceStrictReverifyDays() * 24;
}

export function riderFaceHighCodMicro() {
  const n = Number(process.env.RIDER_FACE_HIGH_COD_MICRO ?? 1_000_000);
  return Number.isFinite(n) && n > 0 ? n : 1_000_000;
}

function formatCalendarDay(date = new Date(), tz = riderFaceDailyTz()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** วันทำงานปัจจุบัน — รีเซ็ตหลัง RIDER_FACE_DAILY_RESET_HOUR ในโซน TZ */
function currentWorkdayKey(now = new Date()) {
  const tz = riderFaceDailyTz();
  const resetHour = riderFaceDailyResetHour();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const pick = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const y = pick('year');
  const m = pick('month');
  const d = pick('day');
  const h = pick('hour');
  const day = new Date(Date.UTC(y, m - 1, d));
  if (h < resetHour) day.setUTCDate(day.getUTCDate() - 1);
  return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}-${String(day.getUTCDate()).padStart(2, '0')}`;
}

function nextDailyResetAt(now = new Date()) {
  const tz = riderFaceDailyTz();
  const resetHour = riderFaceDailyResetHour();
  const workday = currentWorkdayKey(now);
  const [y, m, d] = workday.split('-').map(Number);
  let probe = Date.UTC(y, m - 1, d + 1, resetHour, 0, 0);
  for (let i = 0; i < 96; i++) {
    const candidate = new Date(probe);
    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(candidate),
    );
    const dayKey = formatCalendarDay(candidate, tz);
    const targetDay = new Date(Date.UTC(y, m - 1, d + 1));
    const targetStr = `${targetDay.getUTCFullYear()}-${String(targetDay.getUTCMonth() + 1).padStart(2, '0')}-${String(targetDay.getUTCDate()).padStart(2, '0')}`;
    if (hour === resetHour && (dayKey === targetStr || i > 48)) {
      return candidate;
    }
    probe += 15 * 60 * 1000;
  }
  return new Date(now.getTime() + 24 * 3600_000);
}

export function normalizeFacePurpose(purpose) {
  const p = String(purpose || 'daily').toLowerCase();
  if (p === 'online') return 'daily';
  if (p === 'reverify') return 'strict';
  return p;
}

const DAILY_PURPOSES = new Set(['daily', 'online']);
const STRICT_PURPOSES = new Set(['strict', 'reverify']);

function strongVehicleTypes() {
  const raw = process.env.RIDER_FACE_STRONG_VEHICLE_TYPES || 'public_transport,van';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function gpsDistanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((v) => v == null || !Number.isFinite(Number(v)))) return null;
  const R = 6371;
  const dLat = ((Number(lat2) - Number(lat1)) * Math.PI) / 180;
  const dLng = ((Number(lng2) - Number(lng1)) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((Number(lat1) * Math.PI) / 180) *
      Math.cos((Number(lat2) * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validateLivenessPayload(liveness) {
  const steps = Array.isArray(liveness?.steps) ? liveness.steps : [];
  const ids = steps.map((s) => String(s?.id || '').trim()).filter(Boolean);
  const missing = REQUIRED_LIVENESS_STEPS.filter((id) => !ids.includes(id));
  if (missing.length) {
    const err = new Error('liveness_incomplete');
    err.code = 'liveness_incomplete';
    err.missing = missing;
    throw err;
  }
  const times = steps
    .map((s) => Date.parse(s.completed_at || s.at || ''))
    .filter((t) => Number.isFinite(t));
  if (times.length < REQUIRED_LIVENESS_STEPS.length) {
    const err = new Error('liveness_invalid_timestamps');
    err.code = 'liveness_invalid_timestamps';
    throw err;
  }
  const spanMs = Math.max(...times) - Math.min(...times);
  if (spanMs < 2000 || spanMs > 120_000) {
    const err = new Error('liveness_timing_invalid');
    err.code = 'liveness_timing_invalid';
    throw err;
  }
  return { ok: true, step_count: steps.length, span_ms: spanMs };
}

async function fetchRiderVehicle(pool, riderId) {
  try {
    const q = await pool.query(
      `SELECT vehicle FROM commerce.dispatch_riders WHERE id = $1 LIMIT 1`,
      [String(riderId)],
    );
    return String(q.rows?.[0]?.vehicle || 'motorcycle').toLowerCase();
  } catch {
    return 'motorcycle';
  }
}

export async function resolveRiderVerifyLevel(pool, riderId) {
  const vehicle = await fetchRiderVehicle(pool, riderId);
  return strongVehicleTypes().includes(vehicle) ? 'strong' : 'standard';
}

async function fetchIdCardFrontUrl(pool, userId) {
  try {
    const q = await pool.query(
      `SELECT id_card_front_url FROM kyc_submissions
        WHERE user_id = $1::uuid
          AND (
            address ILIKE '%AQOND แอปไรเดอร์%'
            OR vehicles_json::text ILIKE '%rider_os%'
          )
        ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return String(q.rows?.[0]?.id_card_front_url || '').trim() || null;
  } catch {
    return null;
  }
}

function signFaceSessionToken(payload) {
  const secret = jwtSecret();
  if (!secret) throw new Error('jwt_secret_missing');
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

export function verifyFaceSessionToken(token) {
  const secret = jwtSecret();
  if (!secret || !token) return null;
  try {
    const decoded = jwt.verify(String(token), secret, { algorithms: ['HS256'] });
    if (decoded?.typ !== 'rider_face_session') return null;
    return decoded;
  } catch {
    return null;
  }
}

async function insertSession(pool, row) {
  await pool.query(
    `INSERT INTO commerce.rider_face_sessions (
       id, user_id, rider_id, session_token_hash, verify_level, purpose,
       liveness_passed, match_score, match_threshold, id_card_match_score,
       face_match_passed, device_fingerprint, bind_lat, bind_lng,
       verified_at, expires_at, metadata
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13, $14,
       NOW(), $15::timestamptz, $16::jsonb
     )`,
    [
      row.id,
      row.user_id,
      row.rider_id,
      row.session_token_hash,
      row.verify_level,
      row.purpose,
      row.liveness_passed,
      row.match_score,
      row.match_threshold,
      row.id_card_match_score,
      row.face_match_passed,
      row.device_fingerprint,
      row.bind_lat,
      row.bind_lng,
      row.expires_at,
      JSON.stringify(row.metadata || {}),
    ],
  );
}

async function getDailySessionForWorkday(pool, userId, workdayKey = currentWorkdayKey()) {
  const q = await pool.query(
    `SELECT id, verify_level, purpose, match_score, device_fingerprint,
            bind_lat, bind_lng, verified_at, expires_at, metadata
       FROM commerce.rider_face_sessions
      WHERE user_id = $1::uuid
        AND purpose IN ('daily', 'online', 'strict', 'reverify')
        AND revoked_at IS NULL
        AND face_match_passed = TRUE
        AND (
          metadata->>'workday' = $2
          OR metadata->>'calendar_day' = $2
        )
      ORDER BY verified_at DESC
      LIMIT 1`,
    [userId, workdayKey],
  );
  return q.rows?.[0] || null;
}

async function getLastStrictSession(pool, userId) {
  const q = await pool.query(
    `SELECT id, verified_at, expires_at, metadata
       FROM commerce.rider_face_sessions
      WHERE user_id = $1::uuid
        AND purpose IN ('strict', 'reverify')
        AND revoked_at IS NULL
        AND face_match_passed = TRUE
      ORDER BY verified_at DESC
      LIMIT 1`,
    [userId],
  );
  return q.rows?.[0] || null;
}

async function getStrictReverifyAnchor(pool, userId, level, lastStrict) {
  if (lastStrict?.verified_at) return lastStrict.verified_at;
  if (level === 'strong') return null;
  const q = await pool.query(
    `SELECT verified_at
       FROM commerce.rider_face_sessions
      WHERE user_id = $1::uuid
        AND face_match_passed = TRUE
        AND revoked_at IS NULL
      ORDER BY verified_at DESC
      LIMIT 1`,
    [userId],
  ).catch(() => ({ rows: [] }));
  return q.rows?.[0]?.verified_at || null;
}

function isStrictReverifyDue(level, anchorAt) {
  if (level === 'strong' && !anchorAt) return true;
  if (!anchorAt) return false;
  const days = riderFaceStrictReverifyDaysForLevel(level);
  const elapsed = Date.now() - new Date(anchorAt).getTime();
  return elapsed >= days * 86_400_000;
}

async function getLatestValidSession(pool, userId, purpose) {
  const q = await pool.query(
    `SELECT id, verify_level, purpose, match_score, device_fingerprint,
            bind_lat, bind_lng, verified_at, expires_at
       FROM commerce.rider_face_sessions
      WHERE user_id = $1::uuid
        AND revoked_at IS NULL
        AND expires_at > NOW()
        AND ($2::text IS NULL OR purpose = $2)
      ORDER BY verified_at DESC
      LIMIT 1`,
    [userId, purpose || null],
  );
  return q.rows?.[0] || null;
}

export async function getRiderFaceSessionStatus(pool, userId, riderId) {
  const level = await resolveRiderVerifyLevel(pool, riderId);
  const workday = currentWorkdayKey();
  const dailySession = await getDailySessionForWorkday(pool, userId, workday);
  const passengerSession = await getLatestValidSession(pool, userId, 'passenger');
  const lastStrict = await getLastStrictSession(pool, userId);
  const strictAnchor = await getStrictReverifyAnchor(pool, userId, level, lastStrict);
  const strictIntervalDays = riderFaceStrictReverifyDaysForLevel(level);
  const strictDue = isStrictReverifyDue(level, strictAnchor);
  const strictActive =
    !!lastStrict?.verified_at &&
    !strictDue &&
    new Date(lastStrict.expires_at).getTime() > Date.now();

  return {
    verify_level: level,
    workday,
    daily_active: !!dailySession,
    daily_expires_at: dailySession?.expires_at || null,
    daily_reset_hour: riderFaceDailyResetHour(),
    daily_tz: riderFaceDailyTz(),
    strict_due: strictDue,
    strict_active: strictActive,
    strict_last_at: lastStrict?.verified_at || strictAnchor || null,
    strict_expires_at: lastStrict?.expires_at || null,
    strict_interval_days: strictIntervalDays,
    strict_interval_days_standard: riderFaceStrictReverifyDaysStandard(),
    strict_interval_days_strong: riderFaceStrictReverifyDays(),
    passenger_active: !!passengerSession,
    passenger_expires_at: passengerSession?.expires_at || null,
    match_threshold: riderFaceMatchThreshold(),
    session_ttl_hours: riderFaceSessionTtlHours(),
    passenger_ttl_minutes: riderFacePassengerTtlMinutes(),
    high_cod_micro: riderFaceHighCodMicro(),
    /** backward-compat aliases */
    online_active: !!dailySession,
    online_expires_at: dailySession?.expires_at || null,
    reverify_due: strictDue,
    reverify_active: strictActive,
    reverify_interval_hours: strictIntervalDays * 24,
    reverify_interval_days: strictIntervalDays,
  };
}

async function recordIncident(pool, row) {
  const id = randomUUID();
  const ins = await pool.query(
    `INSERT INTO commerce.rider_face_incidents (
       id, user_id, rider_id, incident_type, severity, session_id,
       match_score, device_fingerprint, attempt_device_fingerprint,
       bind_lat, bind_lng, attempt_lat, attempt_lng,
       rider_suspended, metadata
     ) VALUES (
       $1::uuid, $2::uuid, $3, $4, $5, $6::uuid,
       $7, $8, $9,
       $10, $11, $12, $13,
       $14, $15::jsonb
     ) RETURNING *`,
    [
      id,
      row.user_id,
      row.rider_id,
      row.incident_type,
      row.severity || 'high',
      row.session_id || null,
      row.match_score ?? null,
      row.device_fingerprint || null,
      row.attempt_device_fingerprint || null,
      row.bind_lat ?? null,
      row.bind_lng ?? null,
      row.attempt_lat ?? null,
      row.attempt_lng ?? null,
      row.rider_suspended === true,
      JSON.stringify(row.metadata || {}),
    ],
  );
  const rec = ins.rows[0];
  const notified = await notifyRiderFaceIncident({
    ...rec,
    metadata: row.metadata,
  });
  if (notified) {
    await pool.query(
      `UPDATE commerce.rider_face_incidents SET admin_notified = TRUE WHERE id = $1::uuid`,
      [id],
    );
  }
  return rec;
}

async function suspendRider(pool, riderId, reason) {
  try {
    await pool.query(
      `UPDATE commerce.dispatch_riders
          SET suspended = TRUE,
              metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE id = $1`,
      [String(riderId), JSON.stringify({ face_suspend_reason: reason, face_suspended_at: new Date().toISOString() })],
    );
    return true;
  } catch {
    return false;
  }
}

export async function verifyAndIssueRiderFaceSession(pool, {
  userId,
  riderId,
  purpose = 'daily',
  selfieBase64,
  liveness,
  deviceFingerprint,
  lat,
  lng,
}) {
  validateLivenessPayload(liveness);
  const normalizedPurpose = normalizeFacePurpose(purpose);
  if (!['daily', 'strict', 'passenger'].includes(normalizedPurpose)) {
    const err = new Error('invalid_purpose');
    err.code = 'invalid_purpose';
    throw err;
  }
  const verifyLevel = await resolveRiderVerifyLevel(pool, riderId);
  const portrait = await getRiderKycPortrait(pool, userId);
  if (!portrait?.portrait_url) {
    const err = new Error('no_enrollment_portrait');
    err.code = 'no_enrollment_portrait';
    throw err;
  }

  const match = await compareRiderFaces({
    portraitUrl: portrait.portrait_url,
    selfieBase64,
    livenessPassed: true,
  });

  let idCardMatchScore = null;
  if (String(process.env.RIDER_FACE_COMPARE_ID_CARD || '0') === '1') {
    const idUrl = await fetchIdCardFrontUrl(pool, userId);
    if (idUrl) {
      try {
        const idMatch = await compareRiderFaces({
          portraitUrl: idUrl,
          selfieBase64,
          livenessPassed: true,
        });
        idCardMatchScore = idMatch.score;
      } catch {
        /* optional */
      }
    }
  }

  if (!match.passed) {
    await recordIncident(pool, {
      user_id: userId,
      rider_id: riderId,
      incident_type: 'face_mismatch',
      severity: 'high',
      match_score: match.score,
      attempt_device_fingerprint: deviceFingerprint,
      attempt_lat: lat,
      attempt_lng: lng,
      rider_suspended: false,
      metadata: { purpose, mode: match.mode, threshold: match.threshold },
    });
    const err = new Error('face_match_failed');
    err.code = 'face_match_failed';
    err.score = match.score;
    err.threshold = match.threshold;
    throw err;
  }

  // Uniform / PPE check — same selfie, different model, NEVER blocks. Only a
  // manual-review flag when we are highly confident a required item is missing.
  let uniformResult = { checked: false, flagged: false, flags: [] };
  if (DAILY_PURPOSES.has(normalizedPurpose) || STRICT_PURPOSES.has(normalizedPurpose)) {
    try {
      uniformResult = await detectRiderUniform({ selfieBase64 });
    } catch {
      uniformResult = { checked: false, flagged: false, flags: [] };
    }
  }

  const workday = currentWorkdayKey();
  const sessionId = randomUUID();
  let expiresAt;
  if (normalizedPurpose === 'passenger') {
    expiresAt = new Date(Date.now() + riderFacePassengerTtlMinutes() * 60_000);
  } else if (normalizedPurpose === 'strict') {
    const days = riderFaceStrictReverifyDaysForLevel(verifyLevel);
    expiresAt = new Date(Date.now() + days * 86_400_000);
  } else {
    expiresAt = nextDailyResetAt();
  }
  const expSec = Math.floor(expiresAt.getTime() / 1000);
  const sessionPurpose =
    normalizedPurpose === 'daily' && purpose === 'online' ? 'daily' : normalizedPurpose;
  const token = signFaceSessionToken({
    typ: 'rider_face_session',
    sub: String(userId),
    rid: String(riderId),
    sid: sessionId,
    lvl: verifyLevel,
    pur: sessionPurpose,
    dev: deviceFingerprint || null,
    lat: lat ?? null,
    lng: lng ?? null,
    wday: workday,
    exp: expSec,
  });

  const sessionMeta = {
    mode: match.mode,
    liveness_steps: liveness?.steps?.length || 0,
    workday,
    calendar_day: formatCalendarDay(),
    tz: riderFaceDailyTz(),
    clock_in: true,
    strict_satisfies_daily: normalizedPurpose === 'strict',
    uniform: {
      checked: !!uniformResult.checked,
      flagged: !!uniformResult.flagged,
      flags: uniformResult.flags || [],
    },
  };

  await insertSession(pool, {
    id: sessionId,
    user_id: userId,
    rider_id: riderId,
    session_token_hash: hashToken(token),
    verify_level: verifyLevel,
    purpose: sessionPurpose,
    liveness_passed: true,
    match_score: match.score,
    match_threshold: match.threshold,
    id_card_match_score: idCardMatchScore,
    face_match_passed: true,
    device_fingerprint: deviceFingerprint || null,
    bind_lat: lat ?? null,
    bind_lng: lng ?? null,
    expires_at: expiresAt.toISOString(),
    metadata: sessionMeta,
  });

  // Uniform flag → low-severity manual-review incident. Non-blocking: the
  // session is already issued above; this never affects go-online.
  if (uniformResult.flagged) {
    try {
      await recordIncident(pool, {
        user_id: userId,
        rider_id: riderId,
        incident_type: 'uniform_flag',
        severity: 'low',
        session_id: sessionId,
        device_fingerprint: deviceFingerprint || null,
        bind_lat: lat ?? null,
        bind_lng: lng ?? null,
        rider_suspended: false,
        metadata: {
          purpose: sessionPurpose,
          flags: uniformResult.flags,
          helmet: uniformResult.helmet || null,
          uniform: uniformResult.uniform || null,
          mode: uniformResult.mode,
        },
      });
    } catch {
      /* flag recording must not affect verification */
    }
  }

  return {
    ok: true,
    session_token: token,
    session_id: sessionId,
    verify_level: verifyLevel,
    purpose: sessionPurpose,
    workday,
    match_score: match.score,
    match_threshold: match.threshold,
    id_card_match_score: idCardMatchScore,
    expires_at: expiresAt.toISOString(),
    strict_interval_days: riderFaceStrictReverifyDaysForLevel(verifyLevel),
    uniform: {
      checked: !!uniformResult.checked,
      flagged: !!uniformResult.flagged,
      flags: uniformResult.flags || [],
    },
  };
}

async function loadSessionByToken(pool, token) {
  const decoded = verifyFaceSessionToken(token);
  if (!decoded) return { decoded: null, row: null };
  const q = await pool.query(
    `SELECT * FROM commerce.rider_face_sessions
      WHERE id = $1::uuid AND session_token_hash = $2 AND revoked_at IS NULL AND expires_at > NOW()
      LIMIT 1`,
    [decoded.sid, hashToken(token)],
  );
  return { decoded, row: q.rows?.[0] || null };
}

export async function checkRiderFaceAction(pool, {
  userId,
  riderId,
  action,
  faceSessionToken,
  deviceFingerprint,
  lat,
  lng,
  jobType,
  paymentMethod,
  amountMicro,
}) {
  const level = await resolveRiderVerifyLevel(pool, riderId);
  const status = await getRiderFaceSessionStatus(pool, userId, riderId);
  const workday = currentWorkdayKey();

  const dailyGate = () => {
    if (!status.daily_active) {
      return {
        ok: false,
        code: 'face_daily_required',
        needs_verify: 'daily',
        verify_level: level,
        message: 'ต้องสแกนหน้าเช้านี้ (ตอกบัตรเข้างาน) ก่อนเปิดรับงาน',
      };
    }
    return null;
  };

  const strictGate = () => {
    if (status.strict_due) {
      return {
        ok: false,
        code: 'face_strict_due',
        needs_verify: 'strict',
        verify_level: level,
        strict_interval_days: riderFaceStrictReverifyDaysForLevel(level),
        message: `ครบรอบตรวจเข้มงวด ${riderFaceStrictReverifyDaysForLevel(level)} วัน — สแกนหน้าอีกครั้ง`,
      };
    }
    return null;
  };

  if (action === 'go_online') {
    const strictBlock = strictGate();
    if (strictBlock) return strictBlock;
    const dailyBlock = dailyGate();
    if (dailyBlock && !faceSessionToken) return dailyBlock;

    if (!faceSessionToken) {
      return {
        ok: false,
        code: 'face_daily_required',
        needs_verify: 'daily',
        verify_level: level,
      };
    }

    const { decoded, row } = await loadSessionByToken(pool, faceSessionToken);
    if (!row || decoded.sub !== String(userId) || decoded.rid !== String(riderId)) {
      return { ok: false, code: 'face_session_invalid', needs_verify: 'daily' };
    }

    const rowWorkday = row.metadata?.workday || row.metadata?.calendar_day;
    const purposeOk =
      DAILY_PURPOSES.has(row.purpose) ||
      STRICT_PURPOSES.has(row.purpose) ||
      rowWorkday === workday ||
      decoded.wday === workday;

    if (!purposeOk && !status.daily_active) {
      return { ok: false, code: 'face_daily_required', needs_verify: 'daily' };
    }

    const bindCheck = await enforceStrongBindings(pool, {
      userId,
      riderId,
      level,
      row,
      decoded,
      deviceFingerprint,
      lat,
      lng,
      action,
    });
    if (!bindCheck.ok) return bindCheck;
    return { ok: true, verify_level: level, session_id: row.id, workday };
  }

  if (action === 'accept_job') {
    const jt = String(jobType || '').toLowerCase();
    const pm = String(paymentMethod || '').toLowerCase();
    const amt = Number(amountMicro || 0);
    const isPassenger = jt === 'passenger';
    const isHighCod = pm === 'cod' && amt >= riderFaceHighCodMicro();

    const strictBlock = strictGate();
    if (strictBlock) return strictBlock;

    const dailyBlock = dailyGate();
    if (dailyBlock && !faceSessionToken) return dailyBlock;

    if (!faceSessionToken) {
      if (isPassenger) {
        return {
          ok: false,
          code: 'face_passenger_verify_required',
          needs_verify: 'passenger',
          verify_level: level,
        };
      }
      return {
        ok: false,
        code: 'face_daily_required',
        needs_verify: 'daily',
        verify_level: level,
      };
    }

    const { decoded, row } = await loadSessionByToken(pool, faceSessionToken);
    if (!row || decoded.sub !== String(userId) || decoded.rid !== String(riderId)) {
      return {
        ok: false,
        code: 'face_session_invalid',
        needs_verify: isPassenger ? 'passenger' : 'daily',
      };
    }

    if (!status.daily_active) {
      const rowWorkday = row.metadata?.workday || row.metadata?.calendar_day;
      if (rowWorkday !== workday && decoded.wday !== workday) {
        return { ok: false, code: 'face_daily_required', needs_verify: 'daily' };
      }
    }

    if (isPassenger) {
      const passengerOk = row.purpose === 'passenger';
      if (!passengerOk) {
        const ps = await getLatestValidSession(pool, userId, 'passenger');
        if (!ps) {
          return {
            ok: false,
            code: 'face_passenger_verify_required',
            needs_verify: 'passenger',
            verify_level: level,
          };
        }
      }
    }

    if (isHighCod && !row.face_match_passed) {
      return { ok: false, code: 'face_high_cod_verify_required', needs_verify: 'daily' };
    }

    const bindCheck = await enforceStrongBindings(pool, {
      userId,
      riderId,
      level,
      row,
      decoded,
      deviceFingerprint,
      lat,
      lng,
      action,
    });
    if (!bindCheck.ok) return bindCheck;

    return { ok: true, verify_level: level, session_id: row.id, workday };
  }

  return { ok: false, code: 'unknown_action' };
}

async function enforceStrongBindings(pool, {
  userId,
  riderId,
  level,
  row,
  decoded,
  deviceFingerprint,
  lat,
  lng,
  action,
}) {
  if (level !== 'strong') return { ok: true };

  const boundDev = row.device_fingerprint || decoded.dev;
  if (boundDev && deviceFingerprint && boundDev !== deviceFingerprint) {
    const suspended = await suspendRider(pool, riderId, 'device_mismatch');
    await recordIncident(pool, {
      user_id: userId,
      rider_id: riderId,
      incident_type: 'device_mismatch',
      severity: 'critical',
      session_id: row.id,
      device_fingerprint: boundDev,
      attempt_device_fingerprint: deviceFingerprint,
      rider_suspended: suspended,
      metadata: { action },
    });
    return { ok: false, code: 'face_device_mismatch', suspended };
  }

  const maxKm = Number(process.env.RIDER_FACE_GPS_BIND_MAX_KM ?? 50);
  if (row.bind_lat != null && row.bind_lng != null && lat != null && lng != null) {
    const dist = gpsDistanceKm(row.bind_lat, row.bind_lng, lat, lng);
    if (dist != null && dist > maxKm) {
      const suspended = await suspendRider(pool, riderId, 'gps_mismatch');
      await recordIncident(pool, {
        user_id: userId,
        rider_id: riderId,
        incident_type: 'gps_mismatch',
        severity: 'critical',
        session_id: row.id,
        bind_lat: row.bind_lat,
        bind_lng: row.bind_lng,
        attempt_lat: lat,
        attempt_lng: lng,
        rider_suspended: suspended,
        metadata: { action, distance_km: dist, max_km: maxKm },
      });
      return { ok: false, code: 'face_gps_mismatch', suspended, distance_km: dist };
    }
  }

  return { ok: true };
}

export async function listRiderFaceIncidents(pool, { limit = 50, riderId } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const params = [lim];
  let where = '';
  if (riderId) {
    params.push(String(riderId));
    where = `WHERE rider_id = $2`;
  }
  const q = await pool.query(
    `SELECT id, user_id, rider_id, incident_type, severity, match_score,
            rider_suspended, admin_notified, metadata, created_at
       FROM commerce.rider_face_incidents
       ${where}
      ORDER BY created_at DESC
      LIMIT $1`,
    params,
  );
  return { incidents: q.rows || [] };
}
