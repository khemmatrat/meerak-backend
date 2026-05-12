/**
 * Verify Firebase Auth ID tokens using Google's public x509 certs.
 * Same approach as Firebase docs for third-party JWT verification — no service account needed.
 * @see https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
import jwt from 'jsonwebtoken';

const CERT_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const CACHE_TTL_MS = 45 * 60 * 1000;

let certCache = { certs: null, fetchedAt: 0 };

/** สำหรับชุดทดสอบเท่านั้น — รีเซ็ต cache ระหว่างเคส */
export function resetFirebaseCertCache() {
  certCache = { certs: null, fetchedAt: 0 };
}

async function loadCerts() {
  const now = Date.now();
  if (certCache.certs && now - certCache.fetchedAt < CACHE_TTL_MS) {
    return certCache.certs;
  }
  const res = await fetch(CERT_URL);
  if (!res.ok) {
    throw new Error(`cert_fetch_${res.status}`);
  }
  const certs = await res.json();
  certCache = { certs, fetchedAt: now };
  return certs;
}

function verifyWithCerts(idToken, certs, expectedProjectId) {
  const header = jwt.decode(idToken, { complete: true });
  if (!header?.header?.kid) {
    throw new Error('invalid_token_header');
  }
  const pem = certs[header.header.kid];
  if (!pem) {
    throw new Error('unknown_kid');
  }
  const payload = jwt.verify(idToken, pem, { algorithms: ['RS256'] });
  if (payload.aud !== expectedProjectId) {
    throw new Error('invalid_audience');
  }
  const expectedIss = `https://securetoken.google.com/${expectedProjectId}`;
  if (payload.iss !== expectedIss) {
    throw new Error('invalid_issuer');
  }
  return payload;
}

/**
 * @param {string} idToken
 * @param {string} expectedProjectId — ต้องตรงกับโปรเจกต์ที่แอปใช้ (เช่น aqond-production)
 * @returns {Promise<object>} decoded JWT payload (รวม phone_number ถ้ามา Phone Auth)
 */
export async function verifyFirebaseIdTokenWithPublicKeys(idToken, expectedProjectId) {
  if (!expectedProjectId || typeof expectedProjectId !== 'string') {
    throw new Error('missing_project_id');
  }

  let certs = await loadCerts();
  try {
    return verifyWithCerts(idToken, certs, expectedProjectId);
  } catch (e) {
    if (e?.message === 'unknown_kid') {
      certCache = { certs: null, fetchedAt: 0 };
      certs = await loadCerts();
      return verifyWithCerts(idToken, certs, expectedProjectId);
    }
    throw e;
  }
}
