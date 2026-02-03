/**
 * Phase 1: Browser-Compatible JWT Service (Mock)
 * 
 * This is a browser-compatible version that doesn't use Node.js 'jsonwebtoken'
 * For production, JWT should be generated on the backend only!
 */

import { db } from './firebase';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { createLogger, RequestContext } from '../utils/tracing';

const logger = createLogger('JWTService.Browser');

/**
 * Token Configuration
 */
const TOKEN_CONFIG = {
  ACCESS_TOKEN_EXPIRY: 15 * 60 * 1000,      // 15 minutes
  REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Token Payload Interface
 */
export interface TokenPayload {
  user_id: string;
  role: string;
  device_id: string;
  session_id: string;
  iat?: number;  // Issued at
  exp?: number;  // Expires at
}

/**
 * Auth Tokens
 */
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
}

/**
 * Session Record
 */
export interface SessionRecord {
  id: string;
  user_id: string;
  device_id: string;
  access_token: string;
  refresh_token: string;
  refresh_token_family: string;  // For rotation detection
  is_active: boolean;
  created_at: string;
  expires_at: string;
  last_used_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Generate mock tokens (Browser version)
 * 
 * IMPORTANT: In production, this should be done on the backend!
 */
export async function generateTokens(
  userId: string,
  role: string,
  deviceId: string,
  context: RequestContext,
  metadata?: { ip_address?: string; user_agent?: string }
): Promise<AuthTokens> {
  try {
    logger.log('Generating tokens (browser mock)', { userId, deviceId });

    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const familyId = `family_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const now = Date.now();
    const accessExpiry = now + TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY;
    const refreshExpiry = now + TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY;

    // Create mock tokens (base64 encoded payload - NOT SECURE, for dev only!)
    const accessPayload = {
      user_id: userId,
      role,
      device_id: deviceId,
      session_id: sessionId,
      type: 'access',
      iat: now,
      exp: accessExpiry
    };

    const refreshPayload = {
      user_id: userId,
      session_id: sessionId,
      family_id: familyId,
      type: 'refresh',
      iat: now,
      exp: refreshExpiry
    };

    // Mock tokens (base64 only - NOT cryptographically signed!)
    const accessToken = 'mock_' + btoa(JSON.stringify(accessPayload));
    const refreshToken = 'mock_' + btoa(JSON.stringify(refreshPayload));

    // Store session in Firestore
    const sessionRecord: SessionRecord = {
      id: sessionId,
      user_id: userId,
      device_id: deviceId,
      access_token: accessToken,
      refresh_token: refreshToken,
      refresh_token_family: familyId,
      is_active: true,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(refreshExpiry).toISOString(),
      last_used_at: new Date(now).toISOString(),
      ip_address: metadata?.ip_address,
      user_agent: metadata?.user_agent
    };

    // Remove undefined fields (Firestore doesn't allow undefined)
    const cleanedRecord = Object.fromEntries(
      Object.entries(sessionRecord).filter(([_, v]) => v !== undefined)
    );

    await setDoc(doc(db, 'sessions', sessionId), cleanedRecord);

    logger.log('✅ Tokens generated', { sessionId });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY / 1000,
      token_type: 'Bearer'
    };

  } catch (error) {
    logger.error('Failed to generate tokens', error);
    throw error;
  }
}

/**
 * Verify Access Token (Browser version)
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    // Check if it's a mock token
    if (!token.startsWith('mock_')) {
      return null;
    }

    // Decode base64
    const payload = JSON.parse(atob(token.substring(5)));

    // Check expiry
    if (payload.exp && payload.exp < Date.now()) {
      logger.warn('Token expired');
      return null;
    }

    return payload;
  } catch (error) {
    logger.error('Invalid token', error);
    return null;
  }
}

/**
 * Refresh Access Token (Browser version)
 */
export async function refreshAccessToken(
  refreshToken: string,
  context: RequestContext
): Promise<AuthTokens> {
  try {
    // Decode refresh token
    if (!refreshToken.startsWith('mock_')) {
      throw new Error('Invalid refresh token');
    }

    const payload = JSON.parse(atob(refreshToken.substring(5)));

    // Check expiry
    if (payload.exp && payload.exp < Date.now()) {
      throw new Error('Refresh token expired');
    }

    // Get session
    const sessionDoc = await getDoc(doc(db, 'sessions', payload.session_id));

    if (!sessionDoc.exists()) {
      throw new Error('Session not found');
    }

    const session = sessionDoc.data() as SessionRecord;

    // Check if token matches
    if (session.refresh_token !== refreshToken) {
      // Token reuse detected! Invalidate entire family
      await updateDoc(doc(db, 'sessions', payload.session_id), {
        is_active: false
      });
      throw new Error('Token reuse detected - session invalidated');
    }

    // Generate new tokens (rotation)
    const newTokens = await generateTokens(
      session.user_id,
      'USER', // Default role
      session.device_id,
      context
    );

    // Invalidate old refresh token
    await updateDoc(doc(db, 'sessions', payload.session_id), {
      is_active: false
    });

    logger.log('✅ Token refreshed', { sessionId: payload.session_id });

    return newTokens;

  } catch (error) {
    logger.error('Failed to refresh token', error);
    throw error;
  }
}

/**
 * Revoke Session (Logout)
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'sessions', sessionId), {
      is_active: false
    });

    logger.log('✅ Session revoked', { sessionId });
  } catch (error) {
    logger.error('Failed to revoke session', error);
    throw error;
  }
}

/**
 * Revoke All User Sessions (Logout everywhere)
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  try {
    // This would need a backend endpoint in production
    logger.warn('revokeAllUserSessions not fully implemented in browser version');
    
    // TODO: Call backend API to invalidate all sessions
    
  } catch (error) {
    logger.error('Failed to revoke all sessions', error);
    throw error;
  }
}

export default {
  generateTokens,
  verifyAccessToken,
  refreshAccessToken,
  revokeSession,
  revokeAllUserSessions
};
