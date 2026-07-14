import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const VAULT_KEY = createHash('sha256').update(process.env.AIVOS_VAULT_KEY || 'aivos-dev-vault-key').digest();

function encrypt(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decrypt(blob) {
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', VAULT_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function ensureVault(store) {
  if (store?.kind !== 'memory') return null;
  if (!store._tables.credentialVault) store._tables.credentialVault = new Map();
  return store._tables.credentialVault;
}

export function createCredentialVault({ store } = {}) {
  const map = () => ensureVault(store);

  return {
    store({ connectorId, tenantId = 'default', secret, kind = 'api_key' } = {}) {
      const table = map();
      if (!table) throw new Error('credential_vault_requires_memory_store');
      const key = `${tenantId}::${connectorId}`;
      const row = {
        connectorId,
        tenantId,
        kind,
        ciphertext: encrypt(secret),
        masked: this.mask(secret),
        stored_at: new Date().toISOString(),
      };
      table.set(key, row);
      return { connectorId, tenantId, kind, masked: row.masked };
    },

    get(connectorId, { tenantId = 'default' } = {}) {
      const row = map()?.get(`${tenantId}::${connectorId}`);
      if (!row) return null;
      return { ...row, secret: decrypt(row.ciphertext) };
    },

    rotateSecret(connectorId, { tenantId = 'default', secret } = {}) {
      return this.store({ connectorId, tenantId, secret });
    },

    revoke(connectorId, { tenantId = 'default' } = {}) {
      map()?.delete(`${tenantId}::${connectorId}`);
      return { connectorId, tenantId, revoked: true };
    },

    mask(secret) {
      const s = String(secret || '');
      if (s.length <= 4) return '****';
      return `${s.slice(0, 2)}${'*'.repeat(Math.min(s.length - 4, 8))}${s.slice(-2)}`;
    },
  };
}
