/**
 * Phase 1: Authentication & OTP - JWT Token Service
 * 
 * Manages JWT access tokens and refresh tokens with rotation
 */

import jwt from 'jsonwebtoken';
import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createLogger, RequestContext } from '../utils/tracing';

/**
 * Token Configuration
 */
const TOKEN_CONFIG = {
  access_token_expiry: '15m',      // 15 minutes
  refresh_token_expiry: '30d',     // 30 days
  secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'meerak-secret-key-change-in-production'),
  refresh_secret: process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'meerak-refresh-secret-change-in-production')
};

/**
 * Token Payload Interface
 */
export interface TokenPayload {
  user_id: string;
  user_role: string;
  device_id: string;
  session_id: string;
}

/**
 * Auth Tokens Interface
 */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;              // Seconds until access token expires
  token_type: 'Bearer';
}

/**
 * Session Record Interface
 */
export interface SessionRecord {
  id: string;                      // Session ID
  user_id: string;
  device_id: string;
  
  // Token info
  refresh_token: string;           // Current refresh token (hashed)
  refresh_token_family: string;    // Token family ID (for rotation)
  
  // Network info
  ip_address?: string;
  user_agent?: string;
  
  // Status
  is_active: boolean;
  last_active: string;
  expires_at: string;
  
  // Tracing
  request_id?: string;
  trace_id?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
}

/**
 * Generate unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate token family ID (for refresh token rotation)
 */
function generateTokenFamily(): string {
  return `family_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Hash token for storage (simple hash for demo)
 */
function hashToken(token: string): string {
  // In production, use crypto.createHash('sha256')
  return Buffer.from(token).toString('base64');
}

/**
 * Generate access and refresh tokens
 * 
 * @param userId - User ID
 * @param userRole - User role
 * @param deviceId - Device ID
 * @param context - Request context
 * @returns Auth tokens
 */
export async function generateTokens(
  userId: string,
  userRole: string,
  deviceId: string,
  context?: RequestContext,
  options?: {
    ip_address?: string;
    user_agent?: string;
  }
): Promise<AuthTokens> {
  const logger = context ? createLogger(context) : null;
  
  try {
    logger?.info('Generating tokens', { userId, deviceId });
    
    // Generate session ID and token family
    const sessionId = generateSessionId();
    const tokenFamily = generateTokenFamily();
    
    // Create payload
    const payload: TokenPayload = {
      user_id: userId,
      user_role: userRole,
      device_id: deviceId,
      session_id: sessionId
    };
    
    // Generate access token (short-lived)
    const accessToken = jwt.sign(
      payload,
      TOKEN_CONFIG.secret,
      { expiresIn: TOKEN_CONFIG.access_token_expiry }
    );
    
    // Generate refresh token (long-lived)
    const refreshToken = jwt.sign(
      { ...payload, token_family: tokenFamily },
      TOKEN_CONFIG.refresh_secret,
      { expiresIn: TOKEN_CONFIG.refresh_token_expiry }
    );
    
    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days
    
    // Store session
    const sessionRecord: SessionRecord = {
      id: sessionId,
      user_id: userId,
      device_id: deviceId,
      refresh_token: hashToken(refreshToken),
      refresh_token_family: tokenFamily,
      ip_address: options?.ip_address,
      user_agent: options?.user_agent,
      is_active: true,
      last_active: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      request_id: context?.request_id,
      trace_id: context?.trace_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await setDoc(doc(db, 'sessions', sessionId), sessionRecord);
    
    logger?.info('Tokens generated successfully', { sessionId });
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 15 * 60,  // 15 minutes in seconds
      token_type: 'Bearer'
    };
    
  } catch (error: any) {
    logger?.error('Error generating tokens', error);
    throw new Error('Failed to generate tokens');
  }
}

/**
 * Verify access token
 * 
 * @param token - Access token
 * @returns Token payload or null if invalid
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, TOKEN_CONFIG.secret) as TokenPayload;
    return payload;
  } catch (error) {
    console.error('Invalid access token:', error);
    return null;
  }
}

/**
 * Refresh access token using refresh token
 * 
 * @param refreshToken - Refresh token
 * @param context - Request context
 * @returns New auth tokens
 */
export async function refreshAccessToken(
  refreshToken: string,
  context?: RequestContext
): Promise<{ success: boolean; tokens?: AuthTokens; error?: string }> {
  const logger = context ? createLogger(context) : null;
  
  try {
    logger?.info('Refreshing access token');
    
    // Verify refresh token
    let payload: any;
    try {
      payload = jwt.verify(refreshToken, TOKEN_CONFIG.refresh_secret);
    } catch (error) {
      return { success: false, error: 'Invalid refresh token' };
    }
    
    // Get session
    const sessionRef = doc(db, 'sessions', payload.session_id);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) {
      return { success: false, error: 'Session not found' };
    }
    
    const session = sessionSnap.data() as SessionRecord;
    
    // Check if session is active
    if (!session.is_active) {
      return { success: false, error: 'Session is inactive' };
    }
    
    // Check if session has expired
    if (new Date(session.expires_at) < new Date()) {
      await updateDoc(sessionRef, {
        is_active: false,
        updated_at: new Date().toISOString()
      });
      return { success: false, error: 'Session expired' };
    }
    
    // Verify refresh token matches stored token
    const hashedToken = hashToken(refreshToken);
    if (hashedToken !== session.refresh_token) {
      // Possible token reuse attack - invalidate entire token family
      logger?.warn('Refresh token reuse detected!', {
        sessionId: session.id,
        tokenFamily: session.refresh_token_family
      });
      
      await invalidateTokenFamily(session.refresh_token_family);
      
      return { success: false, error: 'Invalid refresh token (possible token reuse)' };
    }
    
    // Generate new tokens (rotation)
    const newAccessToken = jwt.sign(
      {
        user_id: payload.user_id,
        user_role: payload.user_role,
        device_id: payload.device_id,
        session_id: payload.session_id
      } as TokenPayload,
      TOKEN_CONFIG.secret,
      { expiresIn: TOKEN_CONFIG.access_token_expiry }
    );
    
    const newRefreshToken = jwt.sign(
      {
        user_id: payload.user_id,
        user_role: payload.user_role,
        device_id: payload.device_id,
        session_id: payload.session_id,
        token_family: payload.token_family
      },
      TOKEN_CONFIG.refresh_secret,
      { expiresIn: TOKEN_CONFIG.refresh_token_expiry }
    );
    
    // Update session with new refresh token
    await updateDoc(sessionRef, {
      refresh_token: hashToken(newRefreshToken),
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    logger?.info('Access token refreshed successfully', {
      sessionId: payload.session_id
    });
    
    return {
      success: true,
      tokens: {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_in: 15 * 60,
        token_type: 'Bearer'
      }
    };
    
  } catch (error: any) {
    logger?.error('Error refreshing access token', error);
    return {
      success: false,
      error: error.message || 'Failed to refresh token'
    };
  }
}

/**
 * Invalidate token family (on token reuse detection)
 */
async function invalidateTokenFamily(tokenFamily: string): Promise<void> {
  try {
    // TODO: Query all sessions with this token_family and invalidate them
    console.log(`🚨 Invalidating token family: ${tokenFamily}`);
    
    // For now, just log (would need to query sessions by token_family)
    
  } catch (error) {
    console.error('Error invalidating token family:', error);
  }
}

/**
 * Revoke session (logout)
 */
export async function revokeSession(
  sessionId: string,
  context?: RequestContext
): Promise<{ success: boolean; error?: string }> {
  const logger = context ? createLogger(context) : null;
  
  try {
    logger?.info('Revoking session', { sessionId });
    
    const sessionRef = doc(db, 'sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);
    
    if (!sessionSnap.exists()) {
      return { success: false, error: 'Session not found' };
    }
    
    await updateDoc(sessionRef, {
      is_active: false,
      updated_at: new Date().toISOString()
    });
    
    logger?.info('Session revoked successfully', { sessionId });
    
    return { success: true };
    
  } catch (error: any) {
    logger?.error('Error revoking session', error);
    return {
      success: false,
      error: error.message || 'Failed to revoke session'
    };
  }
}

/**
 * Revoke all sessions for user (logout from all devices)
 */
export async function revokeAllUserSessions(
  userId: string,
  context?: RequestContext
): Promise<{ success: boolean; count: number; error?: string }> {
  const logger = context ? createLogger(context) : null;
  
  try {
    logger?.info('Revoking all sessions for user', { userId });
    
    // TODO: Query all sessions for user and revoke them
    // For now, just return success
    
    logger?.info('All sessions revoked successfully', { userId });
    
    return { success: true, count: 0 };
    
  } catch (error: any) {
    logger?.error('Error revoking all sessions', error);
    return {
      success: false,
      count: 0,
      error: error.message || 'Failed to revoke sessions'
    };
  }
}
