// backend/src/services/wallet.service.ts
import { Pool } from 'pg';

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

export interface WalletSummary {
  available: number;
  pending: number;
  total: number;
  recentTransactions: Transaction[];
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'income' | 'payment_out' | 'refund' | 'commission' | 'fee' | 'deposit' | 'withdrawal';
  amount: number;
  description: string;
  status: 'pending' | 'completed' | 'failed' | 'pending_release';
  related_job_id?: string;
  metadata?: any;
  created_at: Date;
}

export class WalletService {
  constructor(private pool: Pool) {}

  /**
   * ดึง wallet summary
   */
  async getWalletSummary(userId: string): Promise<WalletSummary> {
    // Check cache
    const cacheKey = `wallet:summary:${userId}`;
    try {
      const rc = await getRedisClient();
      const cached = await rc.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    // ดึงข้อมูล user (รองรับทั้ง wallet_balance และ balance สำหรับ Functions compatibility)
    const userResult = await this.pool.query(
      'SELECT wallet_balance, wallet_pending, balance FROM users WHERE id = $1 OR firebase_uid = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    // ใช้ wallet_balance หรือ balance (สำหรับ Functions compatibility)
    const available = parseFloat(user.wallet_balance || user.balance || 0);
    const pending = parseFloat(user.wallet_pending || 0);

    // ดึง transactions ล่าสุด
    const transactionsResult = await this.pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [userId]
    );

    const summary: WalletSummary = {
      available,
      pending,
      total: available + pending,
      recentTransactions: transactionsResult.rows.map(this.mapToTransaction),
    };

    // Cache for 1 minute
    try {
      const rc = await getRedisClient();
      await rc.setEx(cacheKey, 60, JSON.stringify(summary));
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    return summary;
  }

  /**
   * เพิ่มเงินเข้า wallet (deposit)
   */
  async deposit(
    userId: string,
    amount: number,
    description: string = 'Deposit',
    metadata?: any
  ): Promise<Transaction> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // อัพเดท balance (sync ทั้ง wallet_balance และ balance สำหรับ Functions compatibility)
      const updateResult = await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance + $1,
             balance = balance + $1,
             updated_at = NOW()
         WHERE id = $2 OR firebase_uid = $2
         RETURNING id, wallet_balance, balance`,
        [amount, userId]
      );

      if (updateResult.rows.length === 0) {
        throw new Error('User not found');
      }

      // สร้าง transaction record
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          user_id, type, amount, description, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          userId,
          'deposit',
          amount,
          description,
          'completed',
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      await client.query('COMMIT');

      const transaction = this.mapToTransaction(transactionResult.rows[0]);

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`wallet:summary:${userId}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ถอนเงินจาก wallet (withdrawal)
   */
  async withdraw(
    userId: string,
    amount: number,
    description: string = 'Withdrawal',
    metadata?: any
  ): Promise<Transaction> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // ตรวจสอบ balance (รองรับทั้ง wallet_balance และ balance)
      const userResult = await client.query(
        'SELECT wallet_balance, balance FROM users WHERE id = $1 OR firebase_uid = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentBalance = parseFloat(userResult.rows[0].wallet_balance || userResult.rows[0].balance || 0);

      if (currentBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // อัพเดท balance (sync ทั้ง wallet_balance และ balance)
      await client.query(
        `UPDATE users 
         SET wallet_balance = wallet_balance - $1,
             balance = balance - $1,
             updated_at = NOW()
         WHERE id = $2 OR firebase_uid = $2`,
        [amount, userId]
      );

      // สร้าง transaction record
      const transactionResult = await client.query(
        `INSERT INTO transactions (
          user_id, type, amount, description, status, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          userId,
          'withdrawal',
          -amount,
          description,
          'completed',
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      await client.query('COMMIT');

      const transaction = this.mapToTransaction(transactionResult.rows[0]);

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`wallet:summary:${userId}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }

      return transaction;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * เพิ่ม pending balance (สำหรับงานที่รอ release)
   */
  async addPending(
    userId: string,
    amount: number,
    jobId: string,
    description: string = 'Pending payment'
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // อัพเดท pending balance
      await client.query(
        `UPDATE users 
         SET wallet_pending = COALESCE(wallet_pending, 0) + $1, updated_at = NOW()
         WHERE id = $2 OR firebase_uid = $2`,
        [amount, userId]
      );

      // สร้าง transaction record
      await client.query(
        `INSERT INTO transactions (
          user_id, type, amount, description, status, related_job_id
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, 'income', amount, description, 'pending_release', jobId]
      );

      await client.query('COMMIT');

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`wallet:summary:${userId}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release pending balance (โอนจาก pending ไป balance)
   */
  async releasePending(
    userId: string,
    amount: number,
    jobId: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // ตรวจสอบ pending balance
      const userResult = await client.query(
        'SELECT wallet_pending FROM users WHERE id = $1 OR firebase_uid = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const currentPending = parseFloat(userResult.rows[0].wallet_pending || 0);

      if (currentPending < amount) {
        throw new Error('Insufficient pending balance');
      }

      // โอนจาก pending ไป balance (sync ทั้ง wallet_balance และ balance)
      await client.query(
        `UPDATE users 
         SET wallet_pending = wallet_pending - $1,
             wallet_balance = wallet_balance + $1,
             balance = balance + $1,
             updated_at = NOW()
         WHERE id = $2 OR firebase_uid = $2`,
        [amount, userId]
      );

      // อัพเดท transaction status
      await client.query(
        `UPDATE transactions 
         SET status = 'completed', released_at = NOW()
         WHERE user_id = $1 
           AND related_job_id = $2 
           AND type = 'income' 
           AND status = 'pending_release'`,
        [userId, jobId]
      );

      await client.query('COMMIT');

      // Clear cache
      try {
        const rc = await getRedisClient();
        await rc.del(`wallet:summary:${userId}`);
      } catch (error) {
        console.warn('Redis cache unavailable:', error);
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * ดึง transaction history
   */
  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const result = await this.pool.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows.map(this.mapToTransaction);
  }

  /**
   * Map database row to Transaction
   */
  private mapToTransaction(row: any): Transaction {
    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      amount: parseFloat(row.amount || 0),
      description: row.description,
      status: row.status,
      related_job_id: row.related_job_id,
      metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : undefined,
      created_at: row.created_at,
    };
  }
}
