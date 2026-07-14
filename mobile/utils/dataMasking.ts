/**
 * Phase 2: Data Masking Utilities
 * 
 * Masks sensitive data for display purposes
 * Never show full sensitive information in UI
 */

/**
 * Mask Thai National ID
 * 1234567890123 → 1-xxxx-xxxxx-xx-3
 */
export function maskThaiID(id: string): string {
  if (!id) return '';
  
  const cleaned = id.replace(/[\s-]/g, '');
  
  if (cleaned.length !== 13) {
    return 'Invalid ID';
  }
  
  return `${cleaned[0]}-xxxx-xxxxx-xx-${cleaned[12]}`;
}

/**
 * Mask phone number
 * +66812345678 → +66xxx345678
 * 0812345678 → 08xxx5678
 */
export function maskPhone(phone: string): string {
  if (!phone) return '';
  
  const cleaned = phone.replace(/[\s-]/g, '');
  
  if (cleaned.startsWith('+66')) {
    // International format: +66812345678 → +66xxx345678
    return `+66xxx${cleaned.slice(-6)}`;
  } else if (cleaned.startsWith('0')) {
    // Local format: 0812345678 → 08xxx5678
    return `${cleaned.slice(0, 2)}xxx${cleaned.slice(-4)}`;
  }
  
  return cleaned;
}

/**
 * Mask email
 * john.doe@example.com → j***e@example.com
 */
export function maskEmail(email: string): string {
  if (!email) return '';
  
  const [local, domain] = email.split('@');
  
  if (!local || !domain) return email;
  
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

/**
 * Mask name
 * สมชาย ใจดี → ส***ย ใ***ี
 */
export function maskName(name: string): string {
  if (!name) return '';
  
  const parts = name.split(' ');
  
  return parts.map(part => {
    if (part.length <= 2) return part;
    return `${part[0]}***${part[part.length - 1]}`;
  }).join(' ');
}

/**
 * Mask address
 * 123 ถนนสุขุมวิท แขวงคลองเตย → 123 ถ***ท แ***ย
 */
export function maskAddress(address: string): string {
  if (!address) return '';
  
  // Split by spaces and mask each word longer than 3 chars
  const words = address.split(' ');
  
  return words.map(word => {
    if (word.length <= 3) return word;
    return `${word[0]}***${word[word.length - 1]}`;
  }).join(' ');
}

/**
 * Mask bank account number
 * 1234567890 → 12xxx7890
 */
export function maskBankAccount(account: string): string {
  if (!account) return '';
  
  const cleaned = account.replace(/[\s-]/g, '');
  
  if (cleaned.length < 8) {
    return 'xxx';
  }
  
  return `${cleaned.slice(0, 2)}xxx${cleaned.slice(-4)}`;
}

/**
 * Mask credit card number
 * 1234567890123456 → 1234 **** **** 3456
 */
export function maskCreditCard(card: string): string {
  if (!card) return '';
  
  const cleaned = card.replace(/[\s-]/g, '');
  
  if (cleaned.length !== 16) {
    return 'Invalid Card';
  }
  
  return `${cleaned.slice(0, 4)} **** **** ${cleaned.slice(-4)}`;
}

/**
 * Get masking level based on user role
 */
export type MaskingLevel = 'none' | 'partial' | 'full';

export function getMaskingLevel(userRole: string, isOwner: boolean): MaskingLevel {
  if (isOwner) return 'none'; // Owner sees everything
  
  switch (userRole) {
    case 'SUPER_ADMIN':
      return 'partial'; // Admins see partial data
    case 'ADMIN':
      return 'partial';
    default:
      return 'full'; // Others see fully masked
  }
}

/**
 * Apply masking based on level
 */
export function applyMasking<T extends Record<string, any>>(
  data: T,
  level: MaskingLevel,
  sensitiveFields: (keyof T)[]
): T {
  if (level === 'none') return data;
  
  const masked = { ...data };
  
  for (const field of sensitiveFields) {
    const value = data[field];
    
    if (!value) continue;
    
    if (level === 'full') {
      // Fully mask
      if (field === 'national_id' || field === 'id_number') {
        masked[field] = maskThaiID(value as string) as any;
      } else if (field === 'phone') {
        masked[field] = maskPhone(value as string) as any;
      } else if (field === 'email') {
        masked[field] = maskEmail(value as string) as any;
      } else if (field === 'name' || field === 'full_name') {
        masked[field] = maskName(value as string) as any;
      } else if (field === 'address') {
        masked[field] = maskAddress(value as string) as any;
      } else {
        masked[field] = '***' as any;
      }
    } else if (level === 'partial') {
      // Partial mask (show more info)
      if (field === 'national_id' || field === 'id_number') {
        const cleaned = (value as string).replace(/[\s-]/g, '');
        masked[field] = `${cleaned.slice(0, 3)}xxx${cleaned.slice(-3)}` as any;
      } else if (field === 'phone') {
        masked[field] = maskPhone(value as string) as any;
      } else {
        // Other fields: show half
        const str = value as string;
        masked[field] = `${str.slice(0, Math.ceil(str.length / 2))}***` as any;
      }
    }
  }
  
  return masked;
}

/**
 * Redact sensitive data from logs
 */
export function redactFromLogs(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'api_key',
    'national_id',
    'id_number',
    'ssn',
    'credit_card',
    'bank_account',
    'access_token',
    'refresh_token'
  ];
  
  const redacted: any = Array.isArray(obj) ? [] : {};
  
  for (const key in obj) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      redacted[key] = redactFromLogs(obj[key]);
    } else {
      redacted[key] = obj[key];
    }
  }
  
  return redacted;
}

export default {
  maskThaiID,
  maskPhone,
  maskEmail,
  maskName,
  maskAddress,
  maskBankAccount,
  maskCreditCard,
  getMaskingLevel,
  applyMasking,
  redactFromLogs
};
