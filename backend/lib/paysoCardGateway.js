/**

 * PaySo card gateway — ใช้คีย์จาก merchant dashboard โดยตรง

 * (PromptPay/Mobile Banking deposit ใช้ paysoService.js แยก — ไม่แตะ flow นั้น)

 *

 * คีย์จากหน้า PaySo "พารามิเตอร์คีย์":

 *   Auth Key (JWT ยาว)  → PAYSO_API_KEY + PAYSO_AUTH_MODE=bearer (ฝาก PromptPay เท่านั้น)

 *   Secret Key          → PAYSO_SECRET_KEY หรือ PAYSO_MERCHANT_SECRET_KEY

 *   API Key             → PAYSO_PUBLIC_KEY หรือ PAYSO_INQUIRY_API_KEY (tokenize บัตร)

 *

 * ถ้าไม่มี pkey_... (Omise test/live) ระบบใช้ tokenMode=backend — tokenize ผ่าน backend

 */



function trimEnv(v) {

  return String(v ?? '').trim().replace(/^["']|["']$/g, '');

}



function isNonProd() {

  return process.env.NODE_ENV !== 'production';

}



function pickTest(prodVal, testVal) {

  const p = trimEnv(prodVal);

  const t = trimEnv(testVal);

  if (isNonProd() && t) return t;

  return p || t;

}



/** Auth Key สำหรับ PromptPay — ไม่ใช้เป็น Omise Basic auth */

export function looksLikePaysoBearerAuthKey(v) {

  const s = trimEnv(v);

  return s.startsWith('eyJ') && s.includes('.');

}



function looksLikeOmisePublicKey(v) {

  return /^pkey_(test|live)_/i.test(trimEnv(v));

}



function parseBaseUrlParts(raw) {

  const s = trimEnv(raw);

  if (!s) return { hostname: '', pathPrefix: '' };

  try {

    const u = new URL(s.startsWith('http') ? s : `https://${s}`);

    let prefix = u.pathname.replace(/\/$/, '');

    if (prefix === '/') prefix = '';

    return { hostname: u.hostname, pathPrefix: prefix };

  } catch {

    return { hostname: '', pathPrefix: '' };

  }

}



function pickCardSecretCandidate(...values) {

  for (const v of values) {

    const s = trimEnv(v);

    if (!s || s.includes('xxxxx') || looksLikePaysoBearerAuthKey(s)) continue;

    return s;

  }

  return '';

}



export function getPaysoCardSecretKey() {

  return pickTest(

    pickCardSecretCandidate(

      process.env.PAYMENT_GATEWAY_SECRET_KEY,

      process.env.PAYSO_OMISE_SECRET_KEY,

      process.env.PAYSO_SECRET_KEY,

      process.env.PAYSO_MERCHANT_SECRET_KEY,

    ),

    pickCardSecretCandidate(

      process.env.PAYMENT_GATEWAY_SECRET_KEY_TEST,

      process.env.PAYSO_OMISE_SECRET_KEY_TEST,

      process.env.PAYSO_SECRET_KEY_TEST,

      process.env.PAYSO_MERCHANT_SECRET_KEY_TEST,

    ),

  );

}



export function getPaysoCardPublicKey() {

  return pickTest(

    trimEnv(process.env.PAYMENT_GATEWAY_PUBLIC_KEY) ||

    trimEnv(process.env.PAYSO_OMISE_PUBLIC_KEY) ||

    trimEnv(process.env.PAYSO_PUBLIC_KEY) ||

    trimEnv(process.env.PAYSO_INQUIRY_API_KEY) ||

    trimEnv(process.env.PAYSO_MERCHANT_API_KEY),

    trimEnv(process.env.PAYMENT_GATEWAY_PUBLIC_KEY_TEST) ||

    trimEnv(process.env.PAYSO_OMISE_PUBLIC_KEY_TEST) ||

    trimEnv(process.env.PAYSO_PUBLIC_KEY_TEST) ||

    trimEnv(process.env.PAYSO_INQUIRY_API_KEY_TEST) ||

    trimEnv(process.env.PAYSO_MERCHANT_API_KEY_TEST),

  );

}



export function getPaysoCardApiHost() {

  const explicit = trimEnv(process.env.PAYMENT_GATEWAY_API_HOST);

  if (explicit) return explicit;

  const fromOmiseBase = parseBaseUrlParts(process.env.PAYSO_OMISE_API_BASE_URL);

  if (fromOmiseBase.hostname) return fromOmiseBase.hostname;

  const fromPayso = parseBaseUrlParts(process.env.PAYSO_API_BASE_URL);

  return fromPayso.hostname;

}



export function getPaysoCardApiPathPrefix() {

  const explicit =

    trimEnv(process.env.PAYMENT_GATEWAY_API_PATH_PREFIX) ||

    trimEnv(process.env.PAYSO_OMISE_API_PATH_PREFIX);

  if (explicit) return explicit.startsWith('/') ? explicit.replace(/\/$/, '') : `/${explicit}`.replace(/\/$/, '');

  const fromOmiseBase = parseBaseUrlParts(process.env.PAYSO_OMISE_API_BASE_URL);

  if (fromOmiseBase.pathPrefix) return fromOmiseBase.pathPrefix;

  const fromPayso = parseBaseUrlParts(process.env.PAYSO_API_BASE_URL);

  return fromPayso.pathPrefix || '';

}



export function getPaysoCardSdkUrl() {

  return (

    trimEnv(process.env.PAYSO_CARD_SDK_URL) ||

    trimEnv(process.env.PAYMENT_GATEWAY_CARD_SDK_URL) ||

    'https://cdn.omise.co/omise.js'

  );

}



export function getPaysoCardSdkGlobal() {

  return (

    trimEnv(process.env.PAYSO_CARD_SDK_GLOBAL) ||

    trimEnv(process.env.PAYMENT_GATEWAY_CARD_SDK_GLOBAL) ||

    'Omise'

  );

}



/** client = Omise.js ฝั่ง mobile (pkey_) | backend = tokenize ผ่าน API ของเรา (คีย์ PaySo จริง) */

export function getPaysoCardTokenMode() {

  const publicKey = getPaysoCardPublicKey();

  const secretKey = getPaysoCardSecretKey();

  const host = getPaysoCardApiHost();

  if (!secretKey || !host || secretKey.includes('xxxxx')) return 'none';

  if (looksLikeOmisePublicKey(publicKey)) return 'client';

  if (publicKey) return 'backend';

  return 'none';

}



export function isPaysoCardGatewayConfigured() {

  return getPaysoCardTokenMode() !== 'none';

}



/** ส่งให้ mobile ตั้ง card token SDK (public key เท่านั้น — โหมด client) */

export function getPaysoCardClientConfig() {

  const publicKey = getPaysoCardPublicKey();

  const tokenMode = getPaysoCardTokenMode();

  return {

    provider: 'payso',

    tokenMode,

    publicKey: tokenMode === 'client' ? publicKey : null,

    sdkUrl: getPaysoCardSdkUrl(),

    sdkGlobal: getPaysoCardSdkGlobal(),

    configured: tokenMode !== 'none',

  };

}


