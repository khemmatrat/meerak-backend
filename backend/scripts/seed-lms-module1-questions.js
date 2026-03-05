/**
 * Copy Module 1 questions from questions table to course_questions
 * Run after 076_lms_courses.sql and after questions table is seeded
 * Usage: node backend/scripts/seed-lms-module1-questions.js
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_DATABASE || 'meera_db',
  user: process.env.DB_USER || 'meera',
  password: process.env.DB_PASSWORD || 'meera123',
});

async function seed() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT id, question_text, options, correct_option_id, sort_order
      FROM questions WHERE module = 1 ORDER BY sort_order, id
    `);
    if (rows.length === 0) {
      console.log('⚠️ No Module 1 questions in questions table. Run POST /api/admin/setup-database first.');
      return;
    }
    for (const r of rows) {
      let optionsJson = r.options;
      if (typeof optionsJson === 'object') {
        optionsJson = JSON.stringify(optionsJson);
      } else if (typeof optionsJson === 'string') {
        try {
          JSON.parse(optionsJson);
        } catch {
          optionsJson = JSON.stringify([]);
        }
      } else {
        optionsJson = JSON.stringify([]);
      }
      await client.query(`
        INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6)
        ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text, options = EXCLUDED.options, correct_option_id = EXCLUDED.correct_option_id
      `, [r.id, 'nexus-professional-standards', r.question_text, optionsJson, r.correct_option_id, r.sort_order ?? 0]);
    }
    console.log(`✅ Copied ${rows.length} Module 1 questions to course_questions`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
