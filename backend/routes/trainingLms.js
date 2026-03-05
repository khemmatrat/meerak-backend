/**
 * LMS Training Routes — GET /api/training/courses, Admin CRUD
 * Integrates with courses, course_lessons, course_questions
 */
import { logTrainingEvent } from './trainingLmsLog.js';

export function registerTrainingLmsRoutes(app, pool, adminAuthMiddleware) {
  if (!pool) return;

  // ── Public: GET /api/training/courses ──
  app.get('/api/training/courses', async (req, res) => {
    try {
      const { module: mod, category } = req.query || {};
      let sql = `
        SELECT c.id, c.title, c.description, c.category, c.duration, c.level, c.image_url,
               c.nexus_module, c.job_category, c.pass_percent, c.time_limit_min
        FROM courses c
        WHERE 1=1
      `;
      const params = [];
      let i = 1;
      if (mod) { sql += ` AND c.nexus_module = $${i}`; params.push(parseInt(mod, 10)); i++; }
      if (category) { sql += ` AND c.job_category = $${i}`; params.push(category); i++; }
      sql += ` ORDER BY c.nexus_module NULLS LAST, c.job_category NULLS LAST, c.id`;

      const coursesRes = await pool.query(sql, params);
      const courses = coursesRes.rows || [];

      const result = [];
      for (const c of courses) {
        const lessonsRes = await pool.query(
          `SELECT id, title, sort_order, step_type, video_url, text_content, duration_min, quiz_pass_percent
           FROM course_lessons WHERE course_id = $1 ORDER BY sort_order`,
          [c.id]
        );
        const lessons = (lessonsRes.rows || []).map((l) => ({
          id: l.id,
          title: l.title,
          sortOrder: l.sort_order,
          stepType: l.step_type,
          videoUrl: l.video_url,
          textContent: l.text_content,
          durationMin: l.duration_min,
          quizPassPercent: l.quiz_pass_percent,
        }));

        let questions = [];
        const quizLesson = lessons.find((l) => l.stepType === 'quiz');
        if (quizLesson) {
          const qRes = await pool.query(
            `SELECT id, question_text, options, correct_option_id, sort_order
             FROM course_questions WHERE course_id = $1 ORDER BY sort_order, id`,
            [c.id]
          );
          questions = (qRes.rows || []).map((q) => ({
            id: q.id,
            text: q.question_text,
            options: Array.isArray(q.options) ? q.options : (q.options && typeof q.options === 'object' ? Object.entries(q.options).map(([k, v]) => ({ id: k, text: v })) : []),
            correctOptionId: q.correct_option_id,
          }));
        }

        result.push({
          id: c.id,
          title: c.title,
          description: c.description,
          category: c.category,
          duration: c.duration,
          level: c.level,
          imageUrl: c.image_url,
          nexusModule: c.nexus_module,
          jobCategory: c.job_category,
          passPercent: c.pass_percent,
          timeLimitMin: c.time_limit_min,
          lessons,
          questions,
        });
      }

      res.json({ courses: result });
    } catch (e) {
      console.error('GET /api/training/courses error:', e);
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  });

  // ── Public: GET /api/training/courses/:id ──
  app.get('/api/training/courses/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const cRes = await pool.query(
        `SELECT id, title, description, category, duration, level, image_url, nexus_module, job_category, pass_percent, time_limit_min FROM courses WHERE id = $1`,
        [id]
      );
      const c = cRes.rows[0];
      if (!c) return res.status(404).json({ error: 'Course not found' });

      const lessonsRes = await pool.query(
        `SELECT id, title, sort_order, step_type, video_url, text_content, duration_min, quiz_pass_percent
         FROM course_lessons WHERE course_id = $1 ORDER BY sort_order`,
        [id]
      );
      const lessons = (lessonsRes.rows || []).map((l) => ({
        id: l.id,
        title: l.title,
        sortOrder: l.sort_order,
        stepType: l.step_type,
        videoUrl: l.video_url,
        textContent: l.text_content,
        durationMin: l.duration_min,
        quizPassPercent: l.quiz_pass_percent,
      }));

      const qRes = await pool.query(
        `SELECT id, question_text, options, correct_option_id, sort_order FROM course_questions WHERE course_id = $1 ORDER BY sort_order, id`,
        [id]
      );
      const questions = (qRes.rows || []).map((q) => ({
        id: q.id,
        text: q.question_text,
        options: Array.isArray(q.options) ? q.options : (q.options && typeof q.options === 'object' ? Object.entries(q.options).map(([k, v]) => ({ id: k, text: v })) : []),
        correctOptionId: q.correct_option_id,
      }));

      res.json({
        ...c,
        lessons,
        questions,
      });
    } catch (e) {
      console.error('GET /api/training/courses/:id error:', e);
      res.status(500).json({ error: 'Failed to fetch course' });
    }
  });

  // ── Admin: GET /api/admin/training/courses ──
  app.get('/api/admin/training/courses', adminAuthMiddleware, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT id, title, description, category, duration, level, image_url, nexus_module, job_category, pass_percent, time_limit_min, created_at, updated_at FROM courses ORDER BY nexus_module NULLS LAST, job_category NULLS LAST, id`
      );
      res.json({ courses: r.rows || [] });
    } catch (e) {
      console.error('GET admin training courses error:', e);
      res.status(500).json({ error: 'Failed to fetch courses' });
    }
  });

  // ── Admin: PUT /api/admin/training/courses/:id ──
  app.put('/api/admin/training/courses/:id', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { id } = req.params;
      const { title, description, category, duration, level, imageUrl, passPercent, timeLimitMin, videoUrl } = req.body || {};

      const before = await pool.query(`SELECT * FROM courses WHERE id = $1`, [id]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Course not found' });

      await pool.query(
        `UPDATE courses SET title = COALESCE($2, title), description = COALESCE($3, description), category = COALESCE($4, category),
         duration = COALESCE($5, duration), level = COALESCE($6, level), image_url = COALESCE($7, image_url),
         pass_percent = COALESCE($8, pass_percent), time_limit_min = COALESCE($9, time_limit_min), updated_at = NOW()
         WHERE id = $1`,
        [id, title, description, category, duration, level, imageUrl, passPercent, timeLimitMin]
      );

      if (videoUrl) {
        await pool.query(
          `UPDATE course_lessons SET video_url = $2, updated_at = NOW() WHERE course_id = $1 AND step_type = 'video' AND sort_order = 0`,
          [id, videoUrl]
        );
      }

      await logTrainingEvent(pool, adminId, 'ADMIN_UPDATED_COURSE', 'course', id, before.rows[0], { title, description, videoUrl });

      const after = await pool.query(`SELECT * FROM courses WHERE id = $1`, [id]);
      res.json(after.rows[0]);
    } catch (e) {
      console.error('PUT admin training courses error:', e);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  // ── Admin: GET /api/admin/training/courses/:id/lessons ──
  app.get('/api/admin/training/courses/:id/lessons', adminAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `SELECT id, course_id, title, sort_order, step_type, video_url, text_content, duration_min, quiz_pass_percent FROM course_lessons WHERE course_id = $1 ORDER BY sort_order`,
        [id]
      );
      res.json({ lessons: r.rows || [] });
    } catch (e) {
      console.error('GET admin training lessons error:', e);
      res.status(500).json({ error: 'Failed to fetch lessons' });
    }
  });

  // ── Admin: PUT /api/admin/training/lessons/:lessonId ──
  app.put('/api/admin/training/lessons/:lessonId', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { lessonId } = req.params;
      const { title, videoUrl, textContent, durationMin, quizPassPercent } = req.body || {};

      const before = await pool.query(`SELECT * FROM course_lessons WHERE id = $1`, [lessonId]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Lesson not found' });

      await pool.query(
        `UPDATE course_lessons SET title = COALESCE($2, title), video_url = COALESCE($3, video_url), text_content = COALESCE($4, text_content),
         duration_min = COALESCE($5, duration_min), quiz_pass_percent = COALESCE($6, quiz_pass_percent), updated_at = NOW() WHERE id = $1`,
        [lessonId, title, videoUrl, textContent, durationMin, quizPassPercent]
      );

      await logTrainingEvent(pool, adminId, 'ADMIN_UPDATED_LESSON', 'lesson', lessonId, before.rows[0], { title, videoUrl, textContent });

      const after = await pool.query(`SELECT * FROM course_lessons WHERE id = $1`, [lessonId]);
      res.json(after.rows[0]);
    } catch (e) {
      console.error('PUT admin training lessons error:', e);
      res.status(500).json({ error: 'Failed to update lesson' });
    }
  });

  // ── Admin: POST /api/admin/training/lessons ──
  app.post('/api/admin/training/lessons', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { courseId, title, sortOrder, stepType, videoUrl, textContent, durationMin, quizPassPercent } = req.body || {};
      if (!courseId || !title || stepType === undefined) {
        return res.status(400).json({ error: 'courseId, title, stepType required' });
      }

      const r = await pool.query(
        `INSERT INTO course_lessons (course_id, title, sort_order, step_type, video_url, text_content, duration_min, quiz_pass_percent)
         VALUES ($1, $2, COALESCE($3, 0), $4, $5, $6, $7, $8) RETURNING *`,
        [courseId, title, sortOrder, stepType, videoUrl || null, textContent || null, durationMin || null, quizPassPercent || null]
      );
      await logTrainingEvent(pool, adminId, 'ADMIN_CREATED_LESSON', 'lesson', r.rows[0].id, null, { courseId, title, stepType });
      res.json(r.rows[0]);
    } catch (e) {
      console.error('POST admin training lessons error:', e);
      res.status(500).json({ error: 'Failed to create lesson' });
    }
  });

  // ── Admin: DELETE /api/admin/training/lessons/:lessonId ──
  app.delete('/api/admin/training/lessons/:lessonId', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { lessonId } = req.params;
      const before = await pool.query(`SELECT * FROM course_lessons WHERE id = $1`, [lessonId]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Lesson not found' });
      await pool.query(`DELETE FROM course_lessons WHERE id = $1`, [lessonId]);
      await logTrainingEvent(pool, adminId, 'ADMIN_DELETED_LESSON', 'lesson', lessonId, before.rows[0], null);
      res.json({ deleted: true });
    } catch (e) {
      console.error('DELETE admin training lessons error:', e);
      res.status(500).json({ error: 'Failed to delete lesson' });
    }
  });

  // ── Admin: PUT /api/admin/training/lessons/reorder ──
  app.put('/api/admin/training/lessons/reorder', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { courseId, order } = req.body || {};
      if (!courseId || !Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'courseId and order array (lesson ids) required' });
      }
      const client = await pool.connect();
      try {
        for (let i = 0; i < order.length; i++) {
          await client.query(`UPDATE course_lessons SET sort_order = $2, updated_at = NOW() WHERE id = $1 AND course_id = $3`, [order[i], i, courseId]);
        }
        await logTrainingEvent(pool, adminId, 'ADMIN_REORDERED_LESSONS', 'course', courseId, null, { count: order.length });
      } finally {
        client.release();
      }
      res.json({ success: true, count: order.length });
    } catch (e) {
      console.error('PUT reorder lessons error:', e);
      res.status(500).json({ error: 'Failed to reorder' });
    }
  });

  // ── Admin: GET /api/admin/training/courses/:id/questions ──
  app.get('/api/admin/training/courses/:id/questions', adminAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `SELECT id, course_id, question_text, options, correct_option_id, sort_order FROM course_questions WHERE course_id = $1 ORDER BY sort_order, id`,
        [id]
      );
      res.json({ questions: r.rows || [] });
    } catch (e) {
      console.error('GET admin training questions error:', e);
      res.status(500).json({ error: 'Failed to fetch questions' });
    }
  });

  // ── Admin: POST /api/admin/training/questions ──
  app.post('/api/admin/training/questions', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { courseId, questionText, options, correctOptionId, sortOrder } = req.body || {};
      if (!courseId || !questionText || !options || correctOptionId === undefined) {
        return res.status(400).json({ error: 'courseId, questionText, options, correctOptionId required' });
      }

      const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const opts = Array.isArray(options) ? options : (typeof options === 'object' ? Object.entries(options).map(([k, v]) => ({ id: k, text: v })) : []);
      await pool.query(
        `INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0))`,
        [id, courseId, questionText, JSON.stringify(opts), String(correctOptionId), sortOrder]
      );
      await logTrainingEvent(pool, adminId, 'ADMIN_CREATED_QUIZ_Q', 'question', id, null, { courseId });
      const r = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [id]);
      res.json(r.rows[0]);
    } catch (e) {
      console.error('POST admin training questions error:', e);
      res.status(500).json({ error: 'Failed to create question' });
    }
  });

  // ── Admin: PUT /api/admin/training/questions/:qid ──
  app.put('/api/admin/training/questions/:qid', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { qid } = req.params;
      const { questionText, options, correctOptionId, sortOrder } = req.body || {};

      const before = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [qid]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Question not found' });

      const opts = options != null
        ? (Array.isArray(options) ? options : (typeof options === 'object' ? Object.entries(options).map(([k, v]) => ({ id: k, text: v })) : before.rows[0].options))
        : before.rows[0].options;

      await pool.query(
        `UPDATE course_questions SET question_text = COALESCE($2, question_text), options = COALESCE($3, options),
         correct_option_id = COALESCE($4, correct_option_id), sort_order = COALESCE($5, sort_order), updated_at = NOW() WHERE id = $1`,
        [qid, questionText, typeof opts === 'object' ? JSON.stringify(opts) : opts, correctOptionId != null ? String(correctOptionId) : null, sortOrder]
      );

      await logTrainingEvent(pool, adminId, 'ADMIN_UPDATED_QUIZ_Q', 'question', qid, before.rows[0], { questionText, correctOptionId });

      const after = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [qid]);
      res.json(after.rows[0]);
    } catch (e) {
      console.error('PUT admin training questions error:', e);
      res.status(500).json({ error: 'Failed to update question' });
    }
  });

  // ── Admin: POST /api/admin/training/questions/:qid/duplicate ──
  app.post('/api/admin/training/questions/:qid/duplicate', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { qid } = req.params;
      const { targetCourseId } = req.body || {};

      const orig = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [qid]);
      if (!orig.rows[0]) return res.status(404).json({ error: 'Question not found' });
      const row = orig.rows[0];
      const courseId = targetCourseId || row.course_id;

      const newId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const maxOrder = await pool.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM course_questions WHERE course_id = $1`,
        [courseId]
      );
      const nextOrder = maxOrder.rows?.[0]?.next ?? 0;

      await pool.query(
        `INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [newId, courseId, row.question_text, JSON.stringify(row.options || []), row.correct_option_id, nextOrder]
      );
      await logTrainingEvent(pool, adminId, 'ADMIN_DUPLICATED_QUIZ_Q', 'question', newId, null, { from: qid, to: courseId });

      const r = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [newId]);
      res.json(r.rows[0]);
    } catch (e) {
      console.error('POST duplicate question error:', e);
      res.status(500).json({ error: 'Failed to duplicate question' });
    }
  });

  // ── Admin: POST /api/admin/training/questions/bulk-import ──
  app.post('/api/admin/training/questions/bulk-import', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { courseId, questions } = req.body || {};
      if (!courseId || !Array.isArray(questions) || questions.length === 0) {
        return res.status(400).json({ error: 'courseId and questions array required' });
      }

      const inserted = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const text = q.questionText || q.question_text || q.text || '';
        const opts = q.options || [];
        const correct = q.correctOptionId ?? q.correct_option_id ?? (opts[0]?.id || 'a');
        if (!text.trim()) continue;

        const id = `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
        const optionsJson = Array.isArray(opts)
          ? opts.map((o) => (typeof o === 'object' && o.id ? { id: o.id, text: o.text || String(o) } : { id: `opt-${opts.indexOf(o)}`, text: String(o) }))
          : [];
        if (optionsJson.length === 0) optionsJson.push({ id: 'a', text: '' }, { id: 'b', text: '' });

        await pool.query(
          `INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, courseId, text.trim(), JSON.stringify(optionsJson), String(correct), i]
        );
        inserted.push({ id, question_text: text });
      }

      await logTrainingEvent(pool, adminId, 'ADMIN_BULK_IMPORT_QUIZ', 'course', courseId, null, { count: inserted.length });
      res.json({ inserted: inserted.length, questions: inserted });
    } catch (e) {
      console.error('POST bulk-import questions error:', e);
      res.status(500).json({ error: 'Failed to bulk import' });
    }
  });

  // ── Admin: PUT /api/admin/training/questions/reorder ──
  app.put('/api/admin/training/questions/reorder', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { courseId, order } = req.body || {};
      if (!courseId || !Array.isArray(order) || order.length === 0) {
        return res.status(400).json({ error: 'courseId and order array (question ids) required' });
      }

      const client = await pool.connect();
      try {
        for (let i = 0; i < order.length; i++) {
          await client.query(`UPDATE course_questions SET sort_order = $2 WHERE id = $1 AND course_id = $3`, [order[i], i, courseId]);
        }
        await logTrainingEvent(pool, adminId, 'ADMIN_REORDERED_QUIZ', 'course', courseId, null, { count: order.length });
      } finally {
        client.release();
      }
      res.json({ success: true, count: order.length });
    } catch (e) {
      console.error('PUT reorder questions error:', e);
      res.status(500).json({ error: 'Failed to reorder' });
    }
  });

  // ── Admin: DELETE /api/admin/training/questions/:qid ──
  app.delete('/api/admin/training/questions/:qid', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { qid } = req.params;

      const before = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [qid]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Question not found' });

      await pool.query(`DELETE FROM course_questions WHERE id = $1`, [qid]);
      await logTrainingEvent(pool, adminId, 'ADMIN_DELETED_QUIZ_Q', 'question', qid, before.rows[0], null);
      res.json({ deleted: true, id: qid });
    } catch (e) {
      console.error('DELETE admin training questions error:', e);
      res.status(500).json({ error: 'Failed to delete question' });
    }
  });

  // ── Admin: GET /api/admin/training/stats ──
  app.get('/api/admin/training/stats', adminAuthMiddleware, async (req, res) => {
    try {
      const stats = { passRateByModule: {}, attemptsOverTime: [], pendingAssignments: 0, totalAttempts: 0 };
      try {
        const modRes = await pool.query(`
          SELECT module, COUNT(*) FILTER (WHERE passed = true) AS passed, COUNT(*) AS total
          FROM user_exam_results GROUP BY module
        `);
        for (const r of modRes.rows || []) {
          const total = parseInt(r.total, 10) || 0;
          const passed = parseInt(r.passed, 10) || 0;
          stats.passRateByModule[r.module] = { passed, total, rate: total > 0 ? Math.round((passed / total) * 100) : 0 };
        }
      } catch (_) {}
      try {
        const timeRes = await pool.query(`
          SELECT DATE(started_at) AS d, COUNT(*) AS c
          FROM user_exam_results WHERE started_at IS NOT NULL
          GROUP BY DATE(started_at) ORDER BY d DESC LIMIT 30
        `);
        stats.attemptsOverTime = (timeRes.rows || []).map((r) => ({ date: r.d, count: parseInt(r.c, 10) }));
      } catch (_) {}
      try {
        const pendRes = await pool.query(`SELECT COUNT(*) AS c FROM assignment_submissions WHERE status = 'pending'`);
        stats.pendingAssignments = parseInt(pendRes.rows?.[0]?.c, 10) || 0;
      } catch (_) {}
      try {
        const totRes = await pool.query(`SELECT COUNT(*) AS c FROM user_exam_results`);
        stats.totalAttempts = parseInt(totRes.rows?.[0]?.c, 10) || 0;
      } catch (_) {}
      res.json(stats);
    } catch (e) {
      console.error('GET training stats error:', e);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  // ── Admin: GET /api/admin/training/courses/:id/export-questions ──
  app.get('/api/admin/training/courses/:id/export-questions', adminAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const r = await pool.query(
        `SELECT question_text, options, correct_option_id FROM course_questions WHERE course_id = $1 ORDER BY sort_order, id`,
        [id]
      );
      const rows = (r.rows || []).map((q) => {
        const opts = Array.isArray(q.options) ? q.options : (q.options && typeof q.options === 'object' ? Object.entries(q.options).map(([k, v]) => ({ id: k, text: v })) : []);
        const parts = [q.question_text, ...opts.map((o) => o.text || ''), q.correct_option_id];
        return parts.map((p) => `"${String(p || '').replace(/"/g, '""')}"`).join(',');
      });
      const csv = 'question,option_a,option_b,option_c,option_d,correct_id\n' + rows.join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="questions-${id}.csv"`);
      res.send('\uFEFF' + csv);
    } catch (e) {
      console.error('Export questions error:', e);
      res.status(500).json({ error: 'Export failed' });
    }
  });

  // ── Admin: POST /api/admin/training/courses/:id/duplicate ──
  app.post('/api/admin/training/courses/:id/duplicate', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { id } = req.params;
      const { newTitle } = req.body || {};
      const orig = await pool.query(`SELECT * FROM courses WHERE id = $1`, [id]);
      if (!orig.rows[0]) return res.status(404).json({ error: 'Course not found' });
      const c = orig.rows[0];
      const newId = `${id}-copy-${Date.now()}`;
      await pool.query(
        `INSERT INTO courses (id, title, description, category, duration, level, image_url, nexus_module, job_category, pass_percent, time_limit_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [newId, newTitle || `${c.title} (สำเนา)`, c.description, c.category, c.duration, c.level, c.image_url, c.nexus_module, c.job_category, c.pass_percent, c.time_limit_min]
      );
      const lessons = await pool.query(`SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY sort_order`, [id]);
      for (const l of lessons.rows || []) {
        const newLid = `l-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        await pool.query(
          `INSERT INTO course_lessons (id, course_id, title, sort_order, step_type, video_url, text_content, duration_min, quiz_pass_percent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [newLid, newId, l.title, l.sort_order, l.step_type, l.video_url, l.text_content, l.duration_min, l.quiz_pass_percent]
        );
      }
      const questions = await pool.query(`SELECT * FROM course_questions WHERE course_id = $1 ORDER BY sort_order`, [id]);
      for (const q of questions.rows || []) {
        const newQid = `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        await pool.query(
          `INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [newQid, newId, q.question_text, JSON.stringify(q.options || []), q.correct_option_id, q.sort_order]
        );
      }
      await logTrainingEvent(pool, adminId, 'ADMIN_DUPLICATED_COURSE', 'course', newId, null, { from: id });
      const after = await pool.query(`SELECT * FROM courses WHERE id = $1`, [newId]);
      res.json(after.rows[0]);
    } catch (e) {
      console.error('Duplicate course error:', e);
      res.status(500).json({ error: 'Failed to duplicate course' });
    }
  });

  // ── Admin: POST /api/admin/training/questions/ai-generate ──
  app.post('/api/admin/training/questions/ai-generate', adminAuthMiddleware, async (req, res) => {
    try {
      const { text } = req.body || {};
      if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
      if (!genAI) return res.status(503).json({ error: 'AI not configured', hint: 'Set GEMINI_API_KEY in .env' });
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
      const prompt = `Generate 5 multiple choice quiz questions (Thai) from this text. Return JSON array: [{"questionText":"...","options":[{"id":"a","text":"..."},{"id":"b","text":"..."},{"id":"c","text":"..."},{"id":"d","text":"..."}],"correctOptionId":"a"}]. Only valid JSON, no markdown.\n\nText:\n${text.slice(0, 4000)}`;
      const result = await model.generateContent(prompt);
      const raw = result?.response?.text?.() || '[]';
      let parsed = [];
      try {
        const cleaned = raw.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (_) {
        return res.status(500).json({ error: 'AI returned invalid format', raw: raw.slice(0, 200) });
      }
      if (!Array.isArray(parsed)) parsed = [];
      const normalized = parsed.slice(0, 10).map((q) => ({
        questionText: q.questionText || q.question_text || q.text || '',
        options: Array.isArray(q.options) ? q.options : [{ id: 'a', text: '' }, { id: 'b', text: '' }],
        correctOptionId: q.correctOptionId || q.correct_option_id || 'a',
      })).filter((q) => q.questionText.trim());
      res.json({ questions: normalized });
    } catch (e) {
      console.error('AI generate questions error:', e);
      res.status(500).json({ error: e?.message || 'AI generation failed' });
    }
  });

  // ── Admin: GET /api/admin/training/assignments (Module 3 pending) ──
  app.get('/api/admin/training/assignments', adminAuthMiddleware, async (req, res) => {
    try {
      const status = (req.query.status || 'pending').toString();
      let sql = `
        SELECT a.id, a.user_id, a.lesson_id, a.file_urls, a.submitted_at, a.status, a.admin_feedback, a.graded_at,
               u.full_name, u.email, u.phone, cl.title AS lesson_title, c.title AS course_title
        FROM assignment_submissions a
        JOIN users u ON u.id = a.user_id
        JOIN course_lessons cl ON cl.id = a.lesson_id
        JOIN courses c ON c.id = cl.course_id
        WHERE 1=1
      `;
      const params = [];
      if (status) { params.push(status); sql += ` AND a.status = $${params.length}`; }
      sql += ` ORDER BY a.submitted_at DESC LIMIT 100`;

      const r = await pool.query(sql, params);
      res.json({ submissions: r.rows || [] });
    } catch (e) {
      console.error('GET admin training assignments error:', e);
      res.status(500).json({ error: 'Failed to fetch assignments' });
    }
  });

  // ── Admin: PUT /api/admin/training/assignments/:id/grade ──
  app.put('/api/admin/training/assignments/:id/grade', adminAuthMiddleware, async (req, res) => {
    try {
      const adminId = req.adminUser?.id || 'unknown';
      const { id } = req.params;
      const { status, adminFeedback } = req.body || {};
      if (!['passed', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'status must be passed or failed' });
      }

      const before = await pool.query(`SELECT * FROM assignment_submissions WHERE id = $1`, [id]);
      if (!before.rows[0]) return res.status(404).json({ error: 'Submission not found' });

      await pool.query(
        `UPDATE assignment_submissions SET status = $2, admin_feedback = $3, graded_by = $4, graded_at = NOW() WHERE id = $1`,
        [id, status, adminFeedback || null, adminId]
      );

      await logTrainingEvent(pool, adminId, 'ADMIN_GRADED_ASSIGNMENT', 'assignment', id, before.rows[0], { status, adminFeedback });

      const after = await pool.query(`SELECT * FROM assignment_submissions WHERE id = $1`, [id]);
      res.json(after.rows[0]);
    } catch (e) {
      console.error('PUT admin training assignments grade error:', e);
      res.status(500).json({ error: 'Failed to grade assignment' });
    }
  });
}
