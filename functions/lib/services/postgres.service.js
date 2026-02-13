"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresService = void 0;
const pg_1 = require("pg");
class PostgresService {
    constructor() {
        this.pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        });
    }
    async saveKYCSubmission(data) {
        const query = `
      INSERT INTO kyc_submissions (
        firebase_uid, full_name, id_card_number, birth_date,
        document_urls, ai_score, ai_success, ai_verified_at,
        background_check_passed, background_check_risk_level,
        kyc_status, kyc_level, submitted_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `;
        const result = await this.pool.query(query, [
            data.firebaseUid,
            data.fullName,
            data.idCardNumber,
            data.birthDate,
            JSON.stringify(data.documentUrls),
            data.aiScore,
            data.aiSuccess,
            data.aiVerifiedAt,
            data.backgroundCheckPassed,
            data.backgroundCheckRiskLevel,
            data.kycStatus,
            data.kycLevel,
            data.submittedAt,
        ]);
        return { id: result.rows[0].id };
    }
    async getKYCStatus(firebaseUid) {
        const query = `
      SELECT * FROM kyc_submissions 
      WHERE firebase_uid = $1 
      ORDER BY submitted_at DESC 
      LIMIT 1
    `;
        const result = await this.pool.query(query, [firebaseUid]);
        if (result.rows.length === 0) {
            return null;
        }
        return this.mapRowToKYCSubmission(result.rows[0]);
    }
    async updateKYCStatus(firebaseUid, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;
        Object.entries(updates).forEach(([key, value]) => {
            if (value !== undefined) {
                fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        });
        if (fields.length === 0) {
            return;
        }
        values.push(firebaseUid);
        const query = `
      UPDATE kyc_submissions 
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE firebase_uid = $${paramIndex}
    `;
        await this.pool.query(query, values);
    }
    // สำหรับธุรกรรมทางการเงิน (อนาคต)
    async createTransaction(data) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // 1. ตรวจสอบ KYC status ก่อนทำธุรกรรม
            const kycCheck = await client.query('SELECT kyc_status FROM kyc_submissions WHERE firebase_uid = $1', [data.userId]);
            if (kycCheck.rows.length === 0 ||
                !['ai_verified', 'verified', 'admin_approved'].includes(kycCheck.rows[0].kyc_status)) {
                throw new Error('User not KYC verified');
            }
            // 2. สร้างธุรกรรม
            const transactionQuery = `
        INSERT INTO transactions (
          user_id, amount, type, reference_id, metadata, status
        ) VALUES (
          (SELECT id FROM users WHERE firebase_uid = $1),
          $2, $3, $4, $5, 'pending'
        ) RETURNING id
      `;
            const transactionResult = await client.query(transactionQuery, [
                data.userId,
                data.amount,
                data.type,
                data.referenceId,
                JSON.stringify(data.metadata || {}),
            ]);
            // 3. อัพเดทยอดเงิน (ถ้าเป็น deposit/withdraw)
            if (data.type === 'deposit') {
                await client.query(`
          UPDATE users 
          SET balance = balance + $1,
              total_deposits = total_deposits + $1
          WHERE firebase_uid = $2
        `, [data.amount, data.userId]);
            }
            await client.query('COMMIT');
            return { transactionId: transactionResult.rows[0].id };
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    // Helper methods
    mapRowToKYCSubmission(row) {
        return {
            id: row.id,
            firebaseUid: row.firebase_uid,
            fullName: row.full_name,
            idCardNumber: row.id_card_number,
            birthDate: row.birth_date,
            documentUrls: row.document_urls,
            aiScore: row.ai_score,
            aiSuccess: row.ai_success,
            aiVerifiedAt: row.ai_verified_at,
            backgroundCheckPassed: row.background_check_passed,
            backgroundCheckRiskLevel: row.background_check_risk_level,
            kycStatus: row.kyc_status,
            kycLevel: row.kyc_level,
            submittedAt: row.submitted_at,
            updatedAt: row.updated_at,
        };
    }
    camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }
    // Health check
    async healthCheck() {
        const start = Date.now();
        try {
            await this.pool.query('SELECT 1');
            const latency = Date.now() - start;
            return { healthy: true, latency };
        }
        catch (error) {
            return { healthy: false, latency: Date.now() - start };
        }
    }
}
exports.PostgresService = PostgresService;
