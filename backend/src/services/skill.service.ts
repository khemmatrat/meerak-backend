// backend/src/services/skill.service.ts
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

export interface Skill {
  id: string;
  user_id: string;
  skill_name: string;
  skill_category: string;
  certification_id?: string;
  certification_url?: string;
  verified: boolean;
  created_at: Date;
}

export interface Certification {
  id: string;
  user_id: string;
  certification_name: string;
  certification_type: string;
  issuer: string;
  certificate_url?: string;
  issued_date?: Date;
  expiry_date?: Date;
  verified: boolean;
  created_at: Date;
}

export class SkillService {
  constructor(private pool: Pool) {}

  /**
   * เพิ่ม skill ให้ user
   */
  async addSkill(
    userId: string,
    skillName: string,
    skillCategory: string,
    certificationId?: string
  ): Promise<Skill> {
    const result = await this.pool.query(
      `INSERT INTO user_skills (
        user_id, skill_name, skill_category, certification_id, verified
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [userId, skillName, skillCategory, certificationId || null, false]
    );

    const skill = this.mapToSkill(result.rows[0]);

    // Clear cache
    try {
      const rc = await getRedisClient();
      await rc.del(`user:skills:${userId}`);
      await rc.del(`user:profile:${userId}`);
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    return skill;
  }

  /**
   * ดึง skills ของ user
   */
  async getUserSkills(userId: string): Promise<Skill[]> {
    // Check cache
    const cacheKey = `user:skills:${userId}`;
    try {
      const rc = await getRedisClient();
      const cached = await rc.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    const result = await this.pool.query(
      `SELECT * FROM user_skills 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    const skills = result.rows.map(this.mapToSkill);

    // Cache for 5 minutes
    await redisClient.setEx(cacheKey, 300, JSON.stringify(skills));

    return skills;
  }

  /**
   * ลบ skill
   */
  async removeSkill(skillId: string, userId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM user_skills WHERE id = $1 AND user_id = $2 RETURNING id',
      [skillId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Skill not found or unauthorized');
    }

    // Clear cache
    try {
      const rc = await getRedisClient();
      await rc.del(`user:skills:${userId}`);
      await rc.del(`user:profile:${userId}`);
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }
  }

  /**
   * อัพเดท skill
   */
  async updateSkill(
    skillId: string,
    userId: string,
    updates: {
      skill_name?: string;
      skill_category?: string;
      certification_id?: string;
      verified?: boolean;
    }
  ): Promise<Skill> {
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.skill_name !== undefined) {
      updateFields.push(`skill_name = $${paramIndex++}`);
      values.push(updates.skill_name);
    }

    if (updates.skill_category !== undefined) {
      updateFields.push(`skill_category = $${paramIndex++}`);
      values.push(updates.skill_category);
    }

    if (updates.certification_id !== undefined) {
      updateFields.push(`certification_id = $${paramIndex++}`);
      values.push(updates.certification_id);
    }

    if (updates.verified !== undefined) {
      updateFields.push(`verified = $${paramIndex++}`);
      values.push(updates.verified);
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(skillId, userId);

    const result = await this.pool.query(
      `UPDATE user_skills 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('Skill not found or unauthorized');
    }

    const skill = this.mapToSkill(result.rows[0]);

    // Clear cache
    try {
      const rc = await getRedisClient();
      await rc.del(`user:skills:${userId}`);
      await rc.del(`user:profile:${userId}`);
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    return skill;
  }

  /**
   * เพิ่ม certification
   */
  async addCertification(
    userId: string,
    certificationName: string,
    certificationType: string,
    issuer: string,
    certificateUrl?: string,
    issuedDate?: Date,
    expiryDate?: Date
  ): Promise<Certification> {
    const result = await this.pool.query(
      `INSERT INTO user_certifications (
        user_id, certification_name, certification_type, issuer,
        certificate_url, issued_date, expiry_date, verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId,
        certificationName,
        certificationType,
        issuer,
        certificateUrl || null,
        issuedDate || null,
        expiryDate || null,
        false,
      ]
    );

    const certification = this.mapToCertification(result.rows[0]);

    // Clear cache
    await redisClient.del(`user:certifications:${userId}`);
    await redisClient.del(`user:profile:${userId}`);

    return certification;
  }

  /**
   * ดึง certifications ของ user
   */
  async getUserCertifications(userId: string): Promise<Certification[]> {
    // Check cache
    const cacheKey = `user:certifications:${userId}`;
    try {
      const rc = await getRedisClient();
      const cached = await rc.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    const result = await this.pool.query(
      `SELECT * FROM user_certifications 
       WHERE user_id = $1 
       ORDER BY issued_date DESC, created_at DESC`,
      [userId]
    );

    const certifications = result.rows.map(this.mapToCertification);

    // Cache for 5 minutes
    try {
      const rc = await getRedisClient();
      await rc.setEx(cacheKey, 300, JSON.stringify(certifications));
    } catch (error) {
      console.warn('Redis cache unavailable:', error);
    }

    return certifications;
  }

  /**
   * ลบ certification
   */
  async removeCertification(certificationId: string, userId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM user_certifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [certificationId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Certification not found or unauthorized');
    }

    // Clear cache
    await redisClient.del(`user:certifications:${userId}`);
    await redisClient.del(`user:profile:${userId}`);
  }

  /**
   * Map database row to Skill
   */
  private mapToSkill(row: any): Skill {
    return {
      id: row.id,
      user_id: row.user_id,
      skill_name: row.skill_name,
      skill_category: row.skill_category,
      certification_id: row.certification_id,
      certification_url: row.certification_url,
      verified: row.verified || false,
      created_at: row.created_at,
    };
  }

  /**
   * Map database row to Certification
   */
  private mapToCertification(row: any): Certification {
    return {
      id: row.id,
      user_id: row.user_id,
      certification_name: row.certification_name,
      certification_type: row.certification_type,
      issuer: row.issuer,
      certificate_url: row.certificate_url,
      issued_date: row.issued_date,
      expiry_date: row.expiry_date,
      verified: row.verified || false,
      created_at: row.created_at,
    };
  }
}
