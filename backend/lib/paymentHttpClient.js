/**
 * HTTP client for the configured payment processor (gateway-agnostic).
 * Host, path prefix, and auth headers come from environment — PaySo .env เป็นหลัก
 */
import https from 'https';
import {
  getPaysoCardApiHost,
  getPaysoCardApiPathPrefix,
} from './paysoCardGateway.js';

function getApiHost() {
  return getPaysoCardApiHost();
}

function getApiPathPrefix() {
  return getPaysoCardApiPathPrefix();
}

function getVersionHeaders() {
  const name = (process.env.PAYMENT_GATEWAY_API_VERSION_HEADER_NAME || '').trim();
  const value = (process.env.PAYMENT_GATEWAY_API_VERSION_HEADER_VALUE || '').trim();
  if (!name || !value) return {};
  return { [name]: value };
}

function joinApiPath(prefix, path) {
  const p = String(path || '').startsWith('/') ? path : `/${path}`;
  const pre = String(prefix || '').replace(/\/$/, '');
  return pre ? `${pre}${p}` : p;
}

export class PaymentHttpClient {
  constructor(secretKey) {
    this.secretKey = (secretKey || '').trim().replace(/^["']|["']$/g, '');
    this.auth = Buffer.from(this.secretKey + ':', 'utf8').toString('base64');
    this.hostname = getApiHost();
    this.pathPrefix = getApiPathPrefix();
    if (!this.hostname) {
      throw new Error(
        'Payment API host not set — ตั้ง PAYSO_API_BASE_URL (เช่น https://apis.paysolutions.asia/tep) หรือ PAYMENT_GATEWAY_API_HOST',
      );
    }
  }

  async request(method, path, data = null) {
    const versionHeaders = getVersionHeaders();
    const fullPath = joinApiPath(this.pathPrefix, path);
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        path: fullPath,
        method,
        headers: {
          Authorization: `Basic ${this.auth}`,
          'Content-Type': 'application/json',
          ...versionHeaders,
        },
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', (chunk) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseData);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(parsed);
            }
          } catch (e) {
            reject({ error: 'Invalid JSON response', raw: responseData });
          }
        });
      });

      req.on('error', (e) => {
        reject({ error: 'Network error', details: e.message });
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async createPromptPaySource(amount, currency = 'thb') {
    return this.request('POST', '/sources', {
      type: 'promptpay',
      amount,
      currency,
    });
  }

  async createTrueMoneySource(amount, phoneNumber, currency = 'thb') {
    return this.request('POST', '/sources', {
      type: 'truemoney',
      amount,
      currency,
      phone_number: phoneNumber,
    });
  }

  async createSource(data) {
    return this.request('POST', '/sources', data);
  }

  async createInternetBankingSource(amount, bankCode = 'scb', currency = 'thb') {
    const code = String(bankCode || 'scb').trim().toLowerCase();
    const supported = new Set(['bbl', 'bay', 'ktb', 'scb', 'kbank']);
    if (!supported.has(code)) {
      const err = new Error(
        'ธนาคารนี้ไม่รองรับในเกตเวย์สำรอง — โปรดเลือกธนาคารจากรายการหรือติดต่อผู้ดูแลระบบ'
      );
      err.code = 'internet_banking_bank_not_supported';
      throw err;
    }
    return this.createSource({
      type: `internet_banking_${code}`,
      amount,
      currency,
    });
  }

  async createCharge(data) {
    return this.request('POST', '/charges', data);
  }

  async getCharge(chargeId) {
    return this.request('GET', `/charges/${chargeId}`);
  }

  async createCardToken(card) {
    return this.request('POST', '/tokens', { card });
  }

  async retrieveToken(tokenId) {
    const id = String(tokenId || '').trim();
    if (!id) throw new Error('token id required');
    return this.request('GET', `/tokens/${encodeURIComponent(id)}`);
  }

  async getBalance() {
    return this.request('GET', '/balance');
  }

  async createRecipient({ name, email, type = 'individual', bank_account }) {
    return this.request('POST', '/recipients', {
      name,
      email: email || `${name}@payout.meerak.app`,
      type,
      bank_account,
    });
  }

  async createTransfer(amount, recipientId) {
    return this.request('POST', '/transfers', {
      amount: Math.round(amount * 100),
      recipient: recipientId,
    });
  }
}
