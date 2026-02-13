/**
 * Phase 2: Field-Level Encryption for Sensitive Data
 * 
 * CRITICAL SECURITY:
 * - Encrypts sensitive PII before storing in database
 * - Uses AES-256-GCM encryption (browser-compatible)
 * - Never store plaintext sensitive data
 * - Encryption key should be stored in secure environment variable
 */

/**
 * IMPORTANT: In production, NEVER hardcode encryption keys!
 * Use environment variables and rotate keys regularly.
 */
const ENCRYPTION_KEY_DEV = 'meerak_dev_encryption_key_32bytes_long_12345'; // 32 bytes

/**
 * Get encryption key (from env in production)
 */
function getEncryptionKey(): string {
  // In production: return process.env.ENCRYPTION_KEY!;
  return ENCRYPTION_KEY_DEV;
}

/**
 * Browser-compatible AES-256-GCM encryption using Web Crypto API
 */
export async function encryptField(plaintext: string): Promise<string> {
  try {
    // Convert key to CryptoKey
    const keyMaterial = new TextEncoder().encode(getEncryptionKey());
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial.slice(0, 32), // Use first 32 bytes
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('❌ Encryption failed:', error);
    throw new Error('Failed to encrypt sensitive data');
  }
}

/**
 * Decrypt encrypted field
 */
export async function decryptField(encrypted: string): Promise<string> {
  try {
    // Convert key to CryptoKey
    const keyMaterial = new TextEncoder().encode(getEncryptionKey());
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial.slice(0, 32),
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('❌ Decryption failed:', error);
    throw new Error('Failed to decrypt sensitive data');
  }
}

/**
 * Hash sensitive data (one-way, for verification only)
 * Uses SHA-256
 */
export async function hashField(data: string): Promise<string> {
  try {
    const encoded = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('❌ Hashing failed:', error);
    throw new Error('Failed to hash data');
  }
}

/**
 * Encrypt multiple fields at once
 */
export async function encryptFields(data: Record<string, string>): Promise<Record<string, string>> {
  const encrypted: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      encrypted[key] = await encryptField(value);
    }
  }
  
  return encrypted;
}

/**
 * Decrypt multiple fields at once
 */
export async function decryptFields(data: Record<string, string>): Promise<Record<string, string>> {
  const decrypted: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value) {
      try {
        decrypted[key] = await decryptField(value);
      } catch (error) {
        console.error(`Failed to decrypt field: ${key}`);
        decrypted[key] = '[DECRYPTION_FAILED]';
      }
    }
  }
  
  return decrypted;
}

/**
 * Validate Thai National ID format (13 digits)
 */
export function validateThaiID(id: string): boolean {
  // Remove spaces and dashes
  const cleaned = id.replace(/[\s-]/g, '');
  
  // Must be 13 digits
  if (!/^\d{13}$/.test(cleaned)) {
    return false;
  }
  
  // Checksum algorithm
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleaned[i]) * (13 - i);
  }
  
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(cleaned[12]);
}

/**
 * Format Thai National ID for display (masked)
 * Example: 1-2345-67890-12-3 → 1-xxxx-xxxxx-xx-3
 */
export function formatThaiIDMasked(id: string): string {
  const cleaned = id.replace(/[\s-]/g, '');
  
  if (cleaned.length !== 13) {
    return 'Invalid ID';
  }
  
  // Show only first and last digit
  return `${cleaned[0]}-xxxx-xxxxx-xx-${cleaned[12]}`;
}

export default {
  encryptField,
  decryptField,
  hashField,
  encryptFields,
  decryptFields,
  validateThaiID,
  formatThaiIDMasked
};
