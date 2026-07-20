/**
 * SMS delivery for auth OTP — mirrors aqond-v2/services/bff-svc/sms.go
 * AQOND_SMS_PROVIDER: thaibulk | twilio | http | log
 */
import crypto from 'crypto';

function otpMessage(code) {
  const brand = String(process.env.AQOND_SMS_SENDER || 'AQOND').trim() || 'AQOND';
  return `${brand}: รหัส OTP ของคุณคือ ${code} (หมดอายุใน 5 นาที)`;
}

function resolveProvider() {
  const explicit = String(process.env.AQOND_SMS_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.THAIBULKSMS_API_KEY && process.env.THAIBULKSMS_API_SECRET) return 'thaibulk';
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';
  if (process.env.AQOND_SMS_HTTP_URL) return 'http';
  if (process.env.NODE_ENV !== 'production' || process.env.AQOND_OTP_DEV_EXPOSE === '1') return 'log';
  return '';
}

async function sendThaiBulkSMS(phone, message) {
  const key = String(process.env.THAIBULKSMS_API_KEY || '').trim();
  const secret = String(process.env.THAIBULKSMS_API_SECRET || '').trim();
  if (!key || !secret) {
    const e = new Error('thaibulksms_credentials_missing');
    e.code = 'SMS_CONFIG';
    throw e;
  }
  let sender = String(process.env.AQOND_SMS_SENDER || 'AQOND').trim() || 'AQOND';
  let msisdn = phone;
  if (msisdn.startsWith('0')) msisdn = '66' + msisdn.slice(1);
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const resp = await fetch('https://api-v2.thaibulksms.com/sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({ msisdn, message, sender }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const b = await resp.text().catch(() => '');
    const e = new Error(`thaibulksms http ${resp.status}: ${b.slice(0, 200)}`);
    e.code = 'SMS_SEND_FAILED';
    throw e;
  }
}

async function sendTwilioSMS(phone, message) {
  const sid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const token = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const from = String(process.env.TWILIO_FROM_NUMBER || '').trim();
  if (!sid || !token || !from) {
    const e = new Error('twilio_credentials_missing');
    e.code = 'SMS_CONFIG';
    throw e;
  }
  let to = phone;
  if (to.startsWith('0')) to = '+66' + to.slice(1);
  else if (!to.startsWith('+')) to = '+' + to;
  const form = new URLSearchParams({ To: to, From: from, Body: message });
  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!resp.ok) {
    const b = await resp.text().catch(() => '');
    const e = new Error(`twilio http ${resp.status}: ${b.slice(0, 200)}`);
    e.code = 'SMS_SEND_FAILED';
    throw e;
  }
}

async function sendHttpOtpSMS(phone, code, message) {
  const endpoint = String(process.env.AQOND_SMS_HTTP_URL || '').trim();
  if (!endpoint) {
    const e = new Error('AQOND_SMS_HTTP_URL required');
    e.code = 'SMS_CONFIG';
    throw e;
  }
  const headers = { 'Content-Type': 'application/json' };
  const authHdr = String(process.env.AQOND_SMS_HTTP_AUTH || '').trim();
  if (authHdr) headers.Authorization = authHdr;
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, code, message }),
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) {
    const b = await resp.text().catch(() => '');
    const e = new Error(`sms http ${resp.status}: ${b.slice(0, 200)}`);
    e.code = 'SMS_SEND_FAILED';
    throw e;
  }
}

/**
 * @returns {{ provider: string, devCode?: string }}
 */
export async function deliverAuthOtpSms(phoneNorm, code) {
  const provider = resolveProvider();
  const message = otpMessage(code);

  if (!provider) {
    const e = new Error('sms_provider_not_configured');
    e.code = 'SMS_CONFIG';
    throw e;
  }

  switch (provider) {
    case 'log':
    case 'dev':
      console.log(`📱 [auth-otp/${provider}] ${phoneNorm}: ${code}`);
      return { provider, devCode: code };
    case 'twilio':
      await sendTwilioSMS(phoneNorm, message);
      return { provider };
    case 'http':
      await sendHttpOtpSMS(phoneNorm, code, message);
      return { provider };
    case 'thaibulk':
    case 'thaibulksms':
      try {
        await sendThaiBulkSMS(phoneNorm, message);
        return { provider: 'thaibulk' };
      } catch (smsErr) {
        const allowDevFailover =
          process.env.NODE_ENV !== 'production' &&
          String(process.env.AQOND_SMS_DEV_FAILOVER || '1') !== '0';
        if (allowDevFailover) {
          console.warn(
            `[auth-otp] ThaiBulk failed (${smsErr?.message || smsErr}) — dev failover to log`,
          );
          console.log(`📱 [auth-otp/dev-failover] ${phoneNorm}: ${code}`);
          return { provider: 'dev-failover', devCode: code };
        }
        throw smsErr;
      }
    default: {
      const e = new Error(`unknown_sms_provider: ${provider}`);
      e.code = 'SMS_CONFIG';
      throw e;
    }
  }
}

export function stablePhoneFirebaseUid(phoneNorm) {
  const h = crypto.createHash('sha256').update(`aqond-phone:v1:${phoneNorm}`).digest('hex');
  return `ph_${h.slice(0, 32)}`;
}
