// backend/src/services/user.service.ts
import { Pool } from 'pg';
import { getFirebaseUser, setCustomClaims } from './firebase.service';
import { getSharedDatabaseService } from './shared-db.service';

// Redis client interface
interface RedisClient {
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, seconds: number, value: string) => Promise<void>;
  del: (key: string) => Promise<void>;
}

// Lazy import redisClient to avoid circular dependency
let redisClient: RedisClient | null = null;

async function getRedisClient(): Promise<RedisClient> {
  if (!redisClient) {
    const { redisClient: rc } = await import('../index');
    redisClient = rc as any;
  }
  return redisClient;
}

export interface UserProfile {
  id: string;
  firebase_uid: string;
  email: string;
  phone?: string;
  full_name?: string;
  display_name?: string;
  role: 'user' | 'provider' | 'admin';
  kyc_level: 'level_1' | 'level_2';
  kyc_status: 'not_submitted' | 'pending_review' | 'verified' | 'rejected';
  wallet_balance: number;
  wallet_pending: number;
  avatar_url?: string;
  skills?: any[];
  trainings?: any[];
  location?: { lat: number; lng: number };
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  constructor(private pool: Pool) {}

  /**
   * สร้าง user ใหม่ใน PostgreSQL จาก Firebase UID
   * ใช้ shared database service เพื่อให้ compatible กับ Functions
   */
  async createUserFromFirebase(
    firebaseUid: string,
    email: string,
    additionalData?: {
      phone?: string;
      fullName?: string;
      role?: 'user' | 'provider';
    }
  ): Promise<UserProfile> {
    const sharedDb = getSharedDatabaseService();

    try {
      // ใช้ shared database service เพื่อสร้าง/อัพเดท user
      const user = await sharedDb.createOrUpdateUser({
        firebase_uid: firebaseUid,
        email: email,
        phone: additionalData?.phone,
        full_name: additionalData?.fullName,
        role: additionalData?.role || 'user',
        kyc_level: 'level_1',
        kyc_status: 'not_submitted',
        wallet_balance: 0,
        wallet_pending: 0,
      });

      // Set custom claims ใน Firebase
      try {
        await setCustomClaims(firebaseUid, {
          role: user.role,
          userId: user.id,
        });
      } catch (error) {
        console.warn('Failed to set custom claims:', error);
      }

      // Sync KYC status จาก kyc_submissions (ถ้ามี)
      await sharedDb.syncKYCStatusFromSubmissions(firebaseUid);

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`user:profile:${user.id}`);
        await rc.del(`user:profile:${firebaseUid}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }

      return this.mapToUserProfile(user);
    } catch (error) {
      throw error;
    }
  }

  /**
   * ดึง user profile โดย Firebase UID หรือ user ID
   */
  async getUserProfile(identifier: string): Promise<UserProfile | null> {
    // Check cache first
    const cacheKey = `user:profile:${identifier}`;
    try {
      const rc = await getRedisClient();
      const cached = await rc.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      // Redis not available, continue without cache
      console.warn('Redis cache unavailable:', error);
    }

    const sharedDb = getSharedDatabaseService();
    
    // ดึง user จาก shared database service
    let user = await sharedDb.getUserById(identifier);
    
    if (!user) {
      return null;
    }

    // ดึง skills และ certifications
    const result = await this.pool.query(
      `SELECT 
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', s.id,
            'skill_name', s.skill_name,
            'skill_category', s.skill_category,
            'certification_id', s.certification_id,
            'created_at', s.created_at
          )) FILTER (WHERE s.id IS NOT NULL), '[]'::json
        ) as skills,
        COALESCE(
          json_agg(DISTINCT jsonb_build_object(
            'id', t.id,
            'certification_name', t.certification_name,
            'certification_type', t.certification_type,
            'issuer', t.issuer,
            'certificate_url', t.certificate_url,
            'issued_date', t.issued_date,
            'expiry_date', t.expiry_date,
            'verified', t.verified,
            'created_at', t.created_at
          )) FILTER (WHERE t.id IS NOT NULL), '[]'::json
        ) as trainings
      FROM users u
      LEFT JOIN user_skills s ON s.user_id = u.id
      LEFT JOIN user_certifications t ON t.user_id = u.id
      WHERE u.id = $1 OR u.firebase_uid = $1
      GROUP BY u.id`,
      [user.id]
    );

    // Merge skills และ certifications เข้ากับ user
    if (result.rows.length > 0) {
      user.skills = result.rows[0].skills || [];
      user.trainings = result.rows[0].trainings || [];
    }

    // Sync KYC status จาก kyc_submissions
    await sharedDb.syncKYCStatusFromSubmissions(user.firebase_uid);

    // ดึง user อีกครั้งเพื่อได้ KYC status ที่อัพเดทแล้ว
    user = await sharedDb.getUserById(user.id);

    const userProfile = this.mapToUserProfile(user);

    // Cache for 5 minutes
    try {
      const rc = await getRedisClient();
      await rc.setEx(cacheKey, 300, JSON.stringify(userProfile));
    } catch (error) {
      // Redis not available, continue without cache
      console.warn('Redis cache unavailable:', error);
    }

    return userProfile;
  }

  /**
   * อัพเดท user profile
   * ใช้ shared database service เพื่อให้ compatible กับ Functions
   */
  async updateUserProfile(
    userId: string,
    updates: {
      full_name?: string;
      phone?: string;
      avatar_url?: string;
      location?: { lat: number; lng: number };
    }
  ): Promise<UserProfile> {
    const sharedDb = getSharedDatabaseService();

    try {
      // ดึง user ก่อนเพื่อหา firebase_uid
      const user = await sharedDb.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // อัพเดทผ่าน shared database service
      const updatedUser = await sharedDb.createOrUpdateUser({
        firebase_uid: user.firebase_uid,
        full_name: updates.full_name,
        phone: updates.phone,
        avatar_url: updates.avatar_url,
        location: updates.location,
      });

      // Sync wallet balance
      await sharedDb.syncWalletBalance(user.firebase_uid);

      const userProfile = this.mapToUserProfile(updatedUser);

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`user:profile:${userId}`);
        await rc.del(`user:profile:${user.firebase_uid}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }

      return userProfile;
    } catch (error) {
      throw error;
    }
  }

  /**
   * อัพเดท KYC level และ status
   */
  async updateKYCStatus(
    userId: string,
    kycLevel: 'level_1' | 'level_2',
    kycStatus: 'not_submitted' | 'pending_review' | 'verified' | 'rejected'
  ): Promise<UserProfile> {
    const result = await this.pool.query(
      `UPDATE users 
       SET kyc_level = $1, kyc_status = $2, updated_at = NOW()
       WHERE id = $3 OR firebase_uid = $3
       RETURNING *`,
      [kycLevel, kycStatus, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = this.mapToUserProfile(result.rows[0]);

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`user:profile:${userId}`);
        await rc.del(`user:profile:${user.firebase_uid}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }

    return user;
  }

  /**
   * Map database row to UserProfile
   * รองรับ schema ที่ compatible กับ Functions
   */
  private mapToUserProfile(row: any): UserProfile {
    return {
      id: row.id,
      firebase_uid: row.firebase_uid,
      email: row.email,
      phone: row.phone,
      full_name: row.full_name,
      display_name: row.display_name || row.full_name,
      role: row.role || 'user',
      kyc_level: row.kyc_level || 'level_1',
      kyc_status: row.kyc_status || 'not_submitted',
      wallet_balance: parseFloat(row.wallet_balance || row.balance || 0), // Support both wallet_balance and balance
      wallet_pending: parseFloat(row.wallet_pending || 0),
      avatar_url: row.avatar_url,
      skills: Array.isArray(row.skills) ? row.skills : [],
      trainings: Array.isArray(row.trainings) ? row.trainings : [],
      location: row.location 
        ? (typeof row.location === 'string' ? JSON.parse(row.location) : row.location)
        : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
