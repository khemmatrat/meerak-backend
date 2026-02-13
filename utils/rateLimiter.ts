/**
 * Phase 1: Authentication & OTP - Rate Limiting System
 * 
 * Provides rate limiting for API endpoints, OTP requests, and other operations
 * Uses Firestore for distributed rate limiting across multiple servers
 */

import { db } from '../services/firebase';
import { doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore';

/**
 * Rate Limit Configuration
 */
export interface RateLimitConfig {
  max: number;                   // Max requests allowed
  window: number;                // Time window in milliseconds
  key_prefix: string;            // Prefix for rate limit keys
}

/**
 * Rate Limit Record
 */
interface RateLimitRecord {
  count: number;
  window_start: string;
  first_request: string;
  last_request: string;
  updated_at: string;
}

/**
 * Rate Limit Result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  retry_after?: number;          // Seconds until reset (if blocked)
}

/**
 * Predefined Rate Limits
 */
export const RATE_LIMITS = {
  // API endpoints
  api_general: { max: 100, window: 60 * 1000, key_prefix: 'api_general' },        // 100 per minute
  api_auth: { max: 10, window: 60 * 1000, key_prefix: 'api_auth' },               // 10 per minute
  api_payment: { max: 20, window: 60 * 1000, key_prefix: 'api_payment' },         // 20 per minute
  
  // OTP requests
  otp_phone: { max: 3, window: 60 * 60 * 1000, key_prefix: 'otp_phone' },         // 3 per hour
  otp_email: { max: 5, window: 60 * 60 * 1000, key_prefix: 'otp_email' },         // 5 per hour
  otp_ip: { max: 10, window: 60 * 60 * 1000, key_prefix: 'otp_ip' },              // 10 per hour
  otp_device: { max: 5, window: 60 * 60 * 1000, key_prefix: 'otp_device' },       // 5 per hour
  
  // Login attempts
  login_phone: { max: 5, window: 15 * 60 * 1000, key_prefix: 'login_phone' },     // 5 per 15 minutes
  login_ip: { max: 10, window: 15 * 60 * 1000, key_prefix: 'login_ip' },          // 10 per 15 minutes
  
  // Job creation
  job_create: { max: 10, window: 60 * 60 * 1000, key_prefix: 'job_create' },      // 10 per hour
  
  // Wallet operations
  withdrawal: { max: 3, window: 24 * 60 * 60 * 1000, key_prefix: 'withdrawal' },  // 3 per day
  
  // KYC submissions
  kyc_submit: { max: 3, window: 24 * 60 * 60 * 1000, key_prefix: 'kyc_submit' },  // 3 per day
} as const;

/**
 * Check rate limit
 * 
 * @param identifier - Unique identifier (phone, IP, user ID, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const now = Date.now();
    const key = `${config.key_prefix}:${identifier}`;
    const recordRef = doc(db, 'rate_limits', key);
    
    // Use Firestore transaction for atomic increment
    const result = await runTransaction(db, async (transaction) => {
      const recordSnap = await transaction.get(recordRef);
      
      let record: RateLimitRecord;
      
      if (!recordSnap.exists()) {
        // First request in this window
        record = {
          count: 1,
          window_start: new Date(now).toISOString(),
          first_request: new Date(now).toISOString(),
          last_request: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        };
        
        transaction.set(recordRef, record);
        
        return {
          allowed: true,
          remaining: config.max - 1,
          reset_at: new Date(now + config.window).toISOString()
        } as RateLimitResult;
      }
      
      record = recordSnap.data() as RateLimitRecord;
      const windowStart = new Date(record.window_start).getTime();
      const windowEnd = windowStart + config.window;
      
      // Check if window has expired
      if (now >= windowEnd) {
        // Start new window
        record = {
          count: 1,
          window_start: new Date(now).toISOString(),
          first_request: record.first_request,
          last_request: new Date(now).toISOString(),
          updated_at: new Date(now).toISOString()
        };
        
        transaction.set(recordRef, record);
        
        return {
          allowed: true,
          remaining: config.max - 1,
          reset_at: new Date(now + config.window).toISOString()
        } as RateLimitResult;
      }
      
      // Check if limit exceeded
      if (record.count >= config.max) {
        const retryAfter = Math.ceil((windowEnd - now) / 1000);
        
        return {
          allowed: false,
          remaining: 0,
          reset_at: new Date(windowEnd).toISOString(),
          retry_after: retryAfter
        } as RateLimitResult;
      }
      
      // Increment count
      record.count++;
      record.last_request = new Date(now).toISOString();
      record.updated_at = new Date(now).toISOString();
      
      transaction.update(recordRef, {
        count: record.count,
        last_request: record.last_request,
        updated_at: record.updated_at
      });
      
      return {
        allowed: true,
        remaining: config.max - record.count,
        reset_at: new Date(windowEnd).toISOString()
      } as RateLimitResult;
    });
    
    return result;
    
  } catch (error) {
    console.error('Error checking rate limit:', error);
    
    // On error, allow request (fail open)
    return {
      allowed: true,
      remaining: 0,
      reset_at: new Date(Date.now() + config.window).toISOString()
    };
  }
}

/**
 * Rate limit middleware for Express
 * 
 * Usage:
 * ```typescript
 * app.post('/api/login', rateLimitMiddleware(RATE_LIMITS.login_phone), async (req, res) => {
 *   // Handler
 * });
 * ```
 */
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (req: any, res: any, next: any) => {
    // Get identifier from request (phone, IP, user ID)
    const identifier = req.body.phone || req.ip || req.user?.id || 'unknown';
    
    const result = await checkRateLimit(identifier, config);
    
    // Add rate limit headers
    res.setHeader('X-RateLimit-Limit', config.max.toString());
    res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
    res.setHeader('X-RateLimit-Reset', result.reset_at);
    
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retry_after?.toString() || '60');
      
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${result.retry_after} seconds.`,
        reset_at: result.reset_at,
        retry_after: result.retry_after
      });
    }
    
    next();
  };
}

/**
 * Reset rate limit for identifier
 * (For testing or admin override)
 */
export async function resetRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<boolean> {
  try {
    const key = `${config.key_prefix}:${identifier}`;
    const recordRef = doc(db, 'rate_limits', key);
    
    const recordSnap = await getDoc(recordRef);
    if (recordSnap.exists()) {
      await updateDoc(recordRef, {
        count: 0,
        window_start: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
    
    console.log(`✅ Rate limit reset for ${key}`);
    return true;
    
  } catch (error) {
    console.error('Error resetting rate limit:', error);
    return false;
  }
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(
  identifier: string,
  config: RateLimitConfig
): Promise<{
  count: number;
  max: number;
  remaining: number;
  reset_at: string;
}> {
  try {
    const key = `${config.key_prefix}:${identifier}`;
    const recordRef = doc(db, 'rate_limits', key);
    const recordSnap = await getDoc(recordRef);
    
    if (!recordSnap.exists()) {
      return {
        count: 0,
        max: config.max,
        remaining: config.max,
        reset_at: new Date(Date.now() + config.window).toISOString()
      };
    }
    
    const record = recordSnap.data() as RateLimitRecord;
    const windowStart = new Date(record.window_start).getTime();
    const windowEnd = windowStart + config.window;
    const now = Date.now();
    
    // Check if window expired
    if (now >= windowEnd) {
      return {
        count: 0,
        max: config.max,
        remaining: config.max,
        reset_at: new Date(now + config.window).toISOString()
      };
    }
    
    return {
      count: record.count,
      max: config.max,
      remaining: Math.max(0, config.max - record.count),
      reset_at: new Date(windowEnd).toISOString()
    };
    
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return {
      count: 0,
      max: config.max,
      remaining: config.max,
      reset_at: new Date(Date.now() + config.window).toISOString()
    };
  }
}

/**
 * Cleanup old rate limit records (run periodically)
 * Removes records older than 7 days
 */
export async function cleanupRateLimits(): Promise<number> {
  // TODO: Implement cleanup job
  // Query rate_limits where updated_at < 7 days ago
  // Delete those records
  return 0;
}
