// Omise API Client (ใช้ HTTPS โดยตรงแทน SDK)
import https from 'https';

export class OmiseClient {
  constructor(secretKey) {
    this.secretKey = secretKey;
    this.auth = Buffer.from(secretKey + ':').toString('base64');
  }

  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.omise.co',
        path: path,
        method: method,
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Omise-Version': '2019-05-29',
          'Content-Type': 'application/json'
        }
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

  // Create PromptPay Source
  async createPromptPaySource(amount, currency = 'thb') {
    return this.request('POST', '/sources', {
      type: 'promptpay',
      amount: amount,
      currency: currency
    });
  }

  // Create TrueMoney Wallet Source
  async createTrueMoneySource(amount, phoneNumber, currency = 'thb') {
    return this.request('POST', '/sources', {
      type: 'truemoney',
      amount: amount,
      currency: currency,
      phone_number: phoneNumber
    });
  }

  // Create Charge
  async createCharge(data) {
    return this.request('POST', '/charges', data);
  }

  // Get Charge
  async getCharge(chargeId) {
    return this.request('GET', `/charges/${chargeId}`);
  }

  // Get Balance
  async getBalance() {
    return this.request('GET', '/balance');
  }

  // Create Recipient (for Transfer)
  async createRecipient({ name, email, type = 'individual', bank_account }) {
    return this.request('POST', '/recipients', {
      name,
      email: email || `${name}@payout.meerak.app`,
      type,
      bank_account
    });
  }

  // Create Transfer (โอนจากบัญชี Omise ไปยัง Recipient)
  async createTransfer(amount, recipientId) {
    return this.request('POST', '/transfers', {
      amount: Math.round(amount * 100), // satang
      recipient: recipientId
    });
  }
}
