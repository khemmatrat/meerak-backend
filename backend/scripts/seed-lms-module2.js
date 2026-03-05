/**
 * Seed Module 2 courses and questions from module2Questions.js
 * Run after 076_lms_courses.sql
 * Usage: node backend/scripts/seed-lms-module2.js
 */
import pg from 'pg';
import { getModule2Questions, AVAILABLE_CATEGORIES } from '../data/module2Questions.js';
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

const MODULE2_PASS = 80;
const MODULE2_TIME = 40;

async function seed() {
  const client = await pool.connect();
  try {
    for (const category of AVAILABLE_CATEGORIES) {
      const courseId = `nexus-module2-${category}`;
      const questions = getModule2Questions(category);
      if (questions.length === 0) continue;

      await client.query(`
        INSERT INTO courses (id, title, description, category, duration, level, nexus_module, job_category, pass_percent, time_limit_min, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 2, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, pass_percent = EXCLUDED.pass_percent, time_limit_min = EXCLUDED.time_limit_min, updated_at = CURRENT_TIMESTAMP
      `, [
        courseId,
        `Module 2 — ทักษะทางเทคนิค (${category})`,
        `ข้อสอบทักษะทางเทคนิคสำหรับหมวด ${category}`,
        'Professional Standards',
        'ประมาณ 40 นาที',
        'required',
        category,
        MODULE2_PASS,
        MODULE2_TIME,
      ]);

      const existing = await client.query(`SELECT id FROM course_lessons WHERE course_id = $1 LIMIT 1`, [courseId]);
      if (existing.rows.length === 0) {
        await client.query(`
          INSERT INTO course_lessons (course_id, title, sort_order, step_type, quiz_pass_percent)
          VALUES ($1, $2, 0, 'quiz', $3)
        `, [courseId, `แบบทดสอบ Module 2 — ${category}`, MODULE2_PASS]);
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const options = Array.isArray(q.options) ? q.options : [];
        const optionsJson = options.map(o => ({ id: o.id, text: o.text }));
        const qid = `${courseId}-${q.id || `q${i + 1}`}`;
        await client.query(`
          INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET question_text = EXCLUDED.question_text, options = EXCLUDED.options, correct_option_id = EXCLUDED.correct_option_id, sort_order = EXCLUDED.sort_order
        `, [qid, courseId, q.text, JSON.stringify(optionsJson), String(q.correct || 'a'), i]);
      }

      console.log(`✅ Seeded ${courseId}: ${questions.length} questions`);
    }
    console.log('✅ Module 2 seed complete');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(e => { console.error(e); process.exit(1); });
