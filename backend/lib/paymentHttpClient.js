/**
 * HTTP client for the configured payment processor (gateway-agnostic).
 * Host, path prefix, and auth headers come from environment — no vendor lock-in in code.
 */
import https from 'https';

function getApiHost() {
  return (process.env.PAYMENT_GATEWAY_API_HOST || '').trim().replace(/^["']|["']$/g, '');
}

function getVersionHeaders() {
  const name = (process.env.PAYMENT_GATEWAY_API_VERSION_HEADER_NAME || '').trim();
  const value = (process.env.PAYMENT_GATEWAY_API_VERSION_HEADER_VALUE || '').trim();
  if (!name || !value) return {};
  return { [name]: value };
}

export class PaymentHttpClient {
  constructor(secretKey) {
    this.secretKey = (secretKey || '').trim().replace(/^["']|["']$/g, '');
    this.auth = Buffer.from(this.secretKey + ':', 'utf8').toString('base64');
    this.hostname = getApiHost();
    if (!this.hostname) {
      throw new Error('PAYMENT_GATEWAY_API_HOST is not set');
    }
  }

  async request(method, path, data = null) {
    const versionHeaders = getVersionHeaders();
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.hostname,
        path,
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
    const supported = new Set(['bbl', 'bay', 'ktb', 'scb']);
    const normalized = supported.has(code) ? code : 'scb';
    return this.createSource({
      type: `internet_banking_${normalized}`,
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
