// backend/src/services/shared-db.service.ts
// Shared database service ที่ใช้ schema เดียวกับ Functions

import { Pool } from 'pg';
import { pool } from '../index';

/**
 * Database Schema ที่ใช้ร่วมกับ Functions:
 * 
 * 1. users table:
 *    - id (UUID)
 *    - firebase_uid (VARCHAR) - UNIQUE, NOT NULL
 *    - email (VARCHAR) - UNIQUE
 *    - phone (VARCHAR)
 *    - full_name (VARCHAR)
 *    - role (VARCHAR) - 'user' | 'provider' | 'admin'
 *    - kyc_level (VARCHAR) - 'level_1' | 'level_2'
 *    - kyc_status (VARCHAR) - 'not_submitted' | 'pending_review' | 'verified' | 'rejected'
 *    - wallet_balance (DECIMAL) - DEFAULT 0
 *    - wallet_pending (DECIMAL) - DEFAULT 0
 *    - balance (DECIMAL) - สำหรับ Functions compatibility
 *    - total_deposits (DECIMAL) - สำหรับ Functions compatibility
 *    - avatar_url (TEXT)
 *    - location (JSONB)
 *    - created_at (TIMESTAMP)
 *    - updated_at (TIMESTAMP)
 * 
 * 2. kyc_submissions table:
 *    - id (UUID)
 *    - firebase_uid (VARCHAR) - NOT NULL
 *    - full_name (VARCHAR)
 *    - id_card_number (VARCHAR)
 *    - birth_date (DATE)
 *    - document_urls (JSONB)
 *    - ai_score (INTEGER)
 *    - ai_success (BOOLEAN)
 *    - ai_verified_at (TIMESTAMP)
 *    - background_check_passed (BOOLEAN)
 *    - background_check_risk_level (VARCHAR)
 *    - kyc_status (VARCHAR)
 *    - kyc_level (VARCHAR)
 *    - submitted_at (TIMESTAMP)
 *    - updated_at (TIMESTAMP)
 * 
 * 3. transactions table:
 *    - id (UUID)
 *    - user_id (UUID) - REFERENCES users(id)
 *    - amount (DECIMAL)
 *    - type (VARCHAR) - 'deposit' | 'withdraw' | 'transfer' | 'payment' | 'income' | 'payment_out' | 'refund' | 'commission' | 'fee'
 *    - reference_id (VARCHAR) - สำหรับ Functions compatibility
 *    - description (TEXT)
 *    - status (VARCHAR) - 'pending' | 'completed' | 'failed' | 'pending_release'
 *    - metadata (JSONB)
 *    - related_job_id (UUID) - สำหรับ job-related transactions
 *    - created_at (TIMESTAMP)
 *    - released_at (TIMESTAMP)
 */

export class SharedDatabaseService {
  constructor(private dbPool: Pool) {}

  /**
   * สร้างหรืออัพเดท user ใน PostgreSQL
   * ใช้ schema ที่ compatible กับ Functions
   */
  async createOrUpdateUser(data: {
    firebase_uid: string;
    email: string;
    phone?: string;
    full_name?: string;
    role?: 'user' | 'provider' | 'admin';
    kyc_level?: 'level_1' | 'level_2';
    kyc_status?: 'not_submitted' | 'pending_review' | 'verified' | 'rejected';
    wallet_balance?: number;
    wallet_pending?: number;
    avatar_url?: string;
    location?: { lat: number; lng: number };
  }): Promise<any> {
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      // ตรวจสอบว่ามี user อยู่แล้วหรือไม่
      const existingUser = await client.query(
        'SELECT id FROM users WHERE firebase_uid = $1',
        [data.firebase_uid]
      );

      let result;
      if (existingUser.rows.length > 0) {
        // อัพเดท user ที่มีอยู่
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (data.email !== undefined) {
          updateFields.push(`email = $${paramIndex++}`);
          values.push(data.email);
        }
        if (data.phone !== undefined) {
          updateFields.push(`phone = $${paramIndex++}`);
          values.push(data.phone);
        }
        if (data.full_name !== undefined) {
          updateFields.push(`full_name = $${paramIndex++}`);
          values.push(data.full_name);
        }
        if (data.role !== undefined) {
          updateFields.push(`role = $${paramIndex++}`);
          values.push(data.role);
        }
        if (data.kyc_level !== undefined) {
          updateFields.push(`kyc_level = $${paramIndex++}`);
          values.push(data.kyc_level);
        }
        if (data.kyc_status !== undefined) {
          updateFields.push(`kyc_status = $${paramIndex++}`);
          values.push(data.kyc_status);
        }
        if (data.wallet_balance !== undefined) {
          updateFields.push(`wallet_balance = $${paramIndex++}, balance = $${paramIndex - 1}`);
          values.push(data.wallet_balance);
        }
        if (data.wallet_pending !== undefined) {
          updateFields.push(`wallet_pending = $${paramIndex++}`);
          values.push(data.wallet_pending);
        }
        if (data.avatar_url !== undefined) {
          updateFields.push(`avatar_url = $${paramIndex++}`);
          values.push(data.avatar_url);
        }
        if (data.location !== undefined) {
          updateFields.push(`location = $${paramIndex++}`);
          values.push(JSON.stringify(data.location));
        }

        updateFields.push(`updated_at = NOW()`);
        values.push(data.firebase_uid);

        const updateQuery = `
          UPDATE users 
          SET ${updateFields.join(', ')}
          WHERE firebase_uid = $${paramIndex}
          RETURNING *
        `;

        result = await client.query(updateQuery, values);
      } else {
        // สร้าง user ใหม่
        const insertQuery = `
          INSERT INTO users (
            firebase_uid, email, phone, full_name, role,
            kyc_level, kyc_status, wallet_balance, wallet_pending,
            balance, avatar_url, location, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          RETURNING *
        `;

        result = await client.query(insertQuery, [
          data.firebase_uid,
          data.email,
          data.phone || null,
          data.full_name || null,
          data.role || 'user',
          data.kyc_level || 'level_1',
          data.kyc_status || 'not_submitted',
          data.wallet_balance || 0,
          data.wallet_pending || 0,
          data.wallet_balance || 0, // balance สำหรับ Functions compatibility
          data.avatar_url || null,
          data.location ? JSON.stringify(data.location) : null,
        ]);
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ดึง user โดย firebase_uid
   */
  async getUserByFirebaseUid(firebaseUid: string): Promise<any | null> {
    const result = await this.dbPool.query(
      'SELECT * FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );

    return result.rows[0] || null;
  }

  /**
   * ดึง user โดย ID
   */
  async getUserById(userId: string): Promise<any | null> {
    const result = await this.dbPool.query(
      'SELECT * FROM users WHERE id = $1 OR firebase_uid = $1',
      [userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Sync wallet balance กับ Functions schema
   * Functions ใช้ balance แต่ Backend Express ใช้ wallet_balance
   */
  async syncWalletBalance(firebaseUid: string): Promise<void> {
    await this.dbPool.query(
      `UPDATE users 
       SET balance = wallet_balance,
           updated_at = NOW()
       WHERE firebase_uid = $1`,
      [firebaseUid]
    );
  }

  /**
   * ดึง KYC submission จาก PostgreSQL
   */
  async getKYCSubmission(firebaseUid: string): Promise<any | null> {
    const result = await this.dbPool.query(
      `SELECT * FROM kyc_submissions 
       WHERE firebase_uid = $1 
       ORDER BY submitted_at DESC 
       LIMIT 1`,
      [firebaseUid]
    );

    return result.rows[0] || null;
  }

  /**
   * อัพเดท KYC status ใน users table จาก kyc_submissions
   */
  async syncKYCStatusFromSubmissions(firebaseUid: string): Promise<void> {
    const kycSubmission = await this.getKYCSubmission(firebaseUid);

    if (kycSubmission) {
      await this.dbPool.query(
        `UPDATE users 
         SET kyc_status = $1,
             kyc_level = $2,
             updated_at = NOW()
         WHERE firebase_uid = $3`,
        [
          kycSubmission.kyc_status,
          kycSubmission.kyc_level,
          firebaseUid,
        ]
      );
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number }> {
    const start = Date.now();
    try {
      await this.dbPool.query('SELECT 1');
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      return { healthy: false, latency: Date.now() - start };
    }
  }
}

// Singleton instance
let sharedDbService: SharedDatabaseService | null = null;

export function getSharedDatabaseService(): SharedDatabaseService {
  if (!sharedDbService) {
    sharedDbService = new SharedDatabaseService(pool);
  }
  return sharedDbService;
}

export default SharedDatabaseService;
