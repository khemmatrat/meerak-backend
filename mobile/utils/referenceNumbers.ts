/**
 * Phase 0: Foundation Lock - Reference Number Generation System
 * 
 * This module provides generators for unique reference numbers:
 * - Bill Numbers: BL-YYYYMMDD-XXXX
 * - Transaction Numbers: TX-YYYYMMDD-XXXX
 * - Payment Numbers: PY-YYYYMMDD-XXXX
 * - Request Numbers: RQ-YYYYMMDD-XXXX
 * 
 * These numbers provide human-readable, sortable identifiers for tracking
 */

import { db } from '../services/firebase';
import { doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';

/**
 * Reference Number Type
 */
export type ReferenceType = 'bill' | 'transaction' | 'payment' | 'request' | 'dispute' | 'kyc';

/**
 * Reference Number Prefixes
 */
const PREFIXES: Record<ReferenceType, string> = {
  bill: 'BL',
  transaction: 'TX',
  payment: 'PY',
  request: 'RQ',
  dispute: 'DS',
  kyc: 'KY'
};

/**
 * Sequence Counter Interface (stored in Firestore)
 */
interface SequenceCounter {
  current: number;
  date: string;
  last_updated: string;
}

/**
 * Generate reference number
 * Format: PREFIX-YYYYMMDD-XXXX
 * 
 * @param type - Type of reference number
 * @returns Generated reference number
 * 
 * @example
 * generateReferenceNumber('bill') // => 'BL-20260127-0001'
 * generateReferenceNumber('transaction') // => 'TX-20260127-0042'
 */
export async function generateReferenceNumber(type: ReferenceType): Promise<string> {
  const prefix = PREFIXES[type];
  const dateStr = getCurrentDateString();
  
  try {
    // Get next sequence number
    const sequence = await getNextSequence(type);
    
    // Format: PREFIX-YYYYMMDD-XXXX (4 digits, zero-padded)
    const refNumber = `${prefix}-${dateStr}-${sequence.toString().padStart(4, '0')}`;
    
    console.log(`Generated ${type} reference number: ${refNumber}`);
    return refNumber;
    
  } catch (error) {
    console.error(`Error generating ${type} reference number:`, error);
    
    // Fallback: use timestamp-based number
    const fallback = `${prefix}-${dateStr}-${Date.now().toString().slice(-4)}`;
    console.warn(`Using fallback reference number: ${fallback}`);
    return fallback;
  }
}

/**
 * Get next sequence number for today
 * Uses Firestore transaction for atomic increment
 */
async function getNextSequence(type: ReferenceType): Promise<number> {
  const today = getCurrentDateString();
  const counterDocRef = doc(db, 'sequences', `${type}_${today}`);
  
  try {
    // Use Firestore transaction for atomic increment
    const nextSeq = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterDocRef);
      
      let current = 1;
      
      if (counterDoc.exists()) {
        const data = counterDoc.data() as SequenceCounter;
        current = data.current + 1;
        
        // Update existing counter
        transaction.update(counterDocRef, {
          current,
          last_updated: new Date().toISOString()
        });
      } else {
        // Create new counter for today
        transaction.set(counterDocRef, {
          current: 1,
          date: today,
          last_updated: new Date().toISOString()
        } as SequenceCounter);
      }
      
      return current;
    });
    
    return nextSeq;
    
  } catch (error) {
    console.error(`Error getting sequence for ${type}:`, error);
    
    // Fallback: use timestamp-based sequence
    return Date.now() % 10000;
  }
}

/**
 * Get current date string in YYYYMMDD format
 */
function getCurrentDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Parse reference number to extract information
 * 
 * @param refNumber - Reference number to parse
 * @returns Parsed components or null if invalid
 * 
 * @example
 * parseReferenceNumber('BL-20260127-0042')
 * // => { type: 'bill', prefix: 'BL', date: '20260127', sequence: 42, valid: true }
 */
export function parseReferenceNumber(refNumber: string): {
  type: ReferenceType | 'unknown';
  prefix: string;
  date: string;
  sequence: number;
  valid: boolean;
} | null {
  // Match format: PREFIX-YYYYMMDD-XXXX
  const regex = /^([A-Z]{2})-(\d{8})-(\d{4})$/;
  const match = refNumber.match(regex);
  
  if (!match) {
    return null;
  }
  
  const [, prefix, date, seqStr] = match;
  const sequence = parseInt(seqStr, 10);
  
  // Find type by prefix
  const type = Object.entries(PREFIXES).find(([, p]) => p === prefix)?.[0] as ReferenceType || 'unknown';
  
  // Validate date
  const year = parseInt(date.substring(0, 4), 10);
  const month = parseInt(date.substring(4, 6), 10);
  const day = parseInt(date.substring(6, 8), 10);
  
  const valid = year >= 2024 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
  
  return {
    type,
    prefix,
    date,
    sequence,
    valid
  };
}

/**
 * Validate reference number format
 */
export function isValidReferenceNumber(refNumber: string): boolean {
  const parsed = parseReferenceNumber(refNumber);
  return parsed !== null && parsed.valid;
}

/**
 * Generate Bill Number
 * Shorthand for generateReferenceNumber('bill')
 */
export async function generateBillNo(): Promise<string> {
  return generateReferenceNumber('bill');
}

/**
 * Generate Transaction Number
 * Shorthand for generateReferenceNumber('transaction')
 */
export async function generateTransactionNo(): Promise<string> {
  return generateReferenceNumber('transaction');
}

/**
 * Generate Payment Number
 * Shorthand for generateReferenceNumber('payment')
 */
export async function generatePaymentNo(): Promise<string> {
  return generateReferenceNumber('payment');
}

/**
 * Generate Request Number
 * Shorthand for generateReferenceNumber('request')
 */
export async function generateRequestNo(): Promise<string> {
  return generateReferenceNumber('request');
}

/**
 * Generate Dispute Number
 * Shorthand for generateReferenceNumber('dispute')
 */
export async function generateDisputeNo(): Promise<string> {
  return generateReferenceNumber('dispute');
}

/**
 * Generate KYC Request Number
 * Shorthand for generateReferenceNumber('kyc')
 */
export async function generateKYCNo(): Promise<string> {
  return generateReferenceNumber('kyc');
}

/**
 * Reset sequence counters (for testing only)
 * ⚠️ DO NOT USE IN PRODUCTION
 */
export async function resetSequences(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('resetSequences() can only be called in development mode');
  }
  
  console.warn('⚠️ Resetting all sequence counters...');
  // Implementation would delete all sequence documents
}
