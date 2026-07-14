/**
 * Course Studio routes — instructor self-serve authoring (Phase 1).
 */
import { computeCoursePurchaseQuote } from '../lib/courseFeeEngine.js';
import {
  assertCanSellCourses,
  COURSE_SELL_DENIED_CODE,
  COURSE_SELL_DENIED_MESSAGE,
} from '../lib/courseSellEligibility.js';
import {
  asJson,
  assertStudioCourseEditable,
  assertStudioCourseOwner,
  loadCourseDetail,
  mapCourse,
  mapLessonRow,
  readCoursePolicy,
  readInstructorProfile,
  slugify,
  userId,
} from '../lib/courseMarketplaceShared.js';
import {
  buildCourseQualityChecklist,
  buildRevenueProjections,
  evaluateSubmitReadiness,
  generateQuestionId,
  mapCourseQuestion,
  normalizeQuestionOptions,
} from '../lib/courseStudioHelpers.js';

function mapSectionRow(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    sortOrder: row.sort_order,
  };
}

async function loadCourseQuestions(pool, courseId) {
  const r = await pool.query(
    `SELECT id, course_id, question_text, options, correct_option_id, sort_order
     FROM course_questions WHERE course_id = $1 ORDER BY sort_order, id`,
    [courseId],
  );
  return (r.rows || []).map(mapCourseQuestion);
}

export function registerCourseStudioRoutes(app, { pool, authenticateToken }) {
  if (!pool || !authenticateToken) return;
  app.set('courseStudioRoutesRegistered', true);

  app.get('/api/course-studio/courses', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const r = await pool.query(
        `SELECT c.*, u.full_name AS instructor_name
         FROM courses c
         LEFT JOIN users u ON u.id = c.instructor_user_id
         WHERE c.is_marketplace = TRUE AND c.instructor_user_id = $1::uuid
         ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC`,
        [uid],
      );
      res.json({ courses: (r.rows || []).map(mapCourse) });
    } catch (e) {
      console.error('GET /api/course-studio/courses error:', e);
      res.status(500).json({ error: 'Failed to load studio courses' });
    }
  });

  app.get('/api/course-studio/profile', authenticateToken, async (req, res) => {
    try {
      const profile = await readInstructorProfile(pool, userId(req));
      res.json({ profile: profile || { headline: '', bio: '', avatar_url: '' } });
    } catch (e) {
      console.error('GET /api/course-studio/profile error:', e);
      res.status(500).json({ error: 'Failed to load instructor profile' });
    }
  });

  app.patch('/api/course-studio/profile', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const headline = req.body?.headline != null ? String(req.body.headline).trim() : null;
    const bio = req.body?.bio != null ? String(req.body.bio).trim() : null;
    const avatarUrl = req.body?.avatarUrl ?? req.body?.avatar_url ?? null;
    try {
      await pool.query(
        `INSERT INTO course_instructor_profiles (user_id, headline, bio, avatar_url, payout_eligible)
         VALUES ($1::uuid, COALESCE($2, 'Course Instructor'), COALESCE($3, ''), $4, FALSE)
         ON CONFLICT (user_id) DO UPDATE SET
           headline = COALESCE($2, course_instructor_profiles.headline),
           bio = COALESCE($3, course_instructor_profiles.bio),
           avatar_url = COALESCE($4, course_instructor_profiles.avatar_url),
           updated_at = NOW()`,
        [uid, headline, bio, avatarUrl],
      );
      const profile = await readInstructorProfile(pool, uid);
      res.json({ profile });
    } catch (e) {
      console.error('PATCH /api/course-studio/profile error:', e);
      res.status(500).json({ error: 'Failed to update instructor profile' });
    }
  });

  app.get('/api/course-studio/courses/:id', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      if (!(await assertStudioCourseOwner(pool, req.params.id, uid))) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = await loadCourseDetail(pool, req.params.id, uid, true);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      res.json({ course });
    } catch (e) {
      console.error('GET /api/course-studio/courses/:id error:', e);
      res.status(500).json({ error: 'Failed to load studio course' });
    }
  });

  app.get('/api/course-studio/courses/:id/wizard', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      if (!(await assertStudioCourseOwner(pool, req.params.id, uid))) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = await loadCourseDetail(pool, req.params.id, uid, true);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      const instructorProfile = await readInstructorProfile(pool, uid);
      const policy = await readCoursePolicy(pool);
      const quote = computeCoursePurchaseQuote({
        priceThb: course.priceThb,
        originalPriceThb: course.originalPriceThb,
        policy,
      });
      const checklist = buildCourseQualityChecklist(course, course.lessons || [], instructorProfile);
      const questions = await loadCourseQuestions(pool, req.params.id);
      res.json({
        course,
        quote,
        checklist,
        projections: buildRevenueProjections(quote),
        questions,
        instructorProfile: instructorProfile || { headline: '', bio: '', avatar_url: '' },
      });
    } catch (e) {
      console.error('GET /api/course-studio/courses/:id/wizard error:', e);
      res.status(500).json({ error: 'Failed to load course wizard' });
    }
  });

  app.post('/api/course-studio/courses', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });

    const sellGate = await assertCanSellCourses(pool, uid);
    if (!sellGate.ok) {
      return res.status(403).json({
        error: sellGate.error || COURSE_SELL_DENIED_MESSAGE,
        code: sellGate.code || COURSE_SELL_DENIED_CODE,
      });
    }

    const id = `${slugify(title)}-${Date.now().toString(36)}`;
    try {
      await pool.query(
        `INSERT INTO course_instructor_profiles (user_id, headline, payout_eligible)
         VALUES ($1::uuid, 'Course Instructor', FALSE)
         ON CONFLICT (user_id) DO NOTHING`,
        [uid],
      );
      const r = await pool.query(
        `INSERT INTO courses (
           id, title, subtitle, description, category, duration, level, image_url,
           instructor_user_id, price_thb, original_price_thb, currency, status, is_marketplace,
           promo_video_url, thumbnail_variants, language, learning_outcomes, requirements
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::uuid,$10,$11,'THB','draft',TRUE,$12,$13::jsonb,$14,$15::jsonb,$16::jsonb)
         RETURNING *`,
        [
          id,
          title,
          req.body?.subtitle || '',
          req.body?.description || '',
          req.body?.category || 'business',
          Number(req.body?.duration || 0),
          req.body?.level || 'beginner',
          req.body?.imageUrl || req.body?.image_url || '',
          uid,
          Number(req.body?.priceThb ?? req.body?.price_thb ?? 0),
          req.body?.originalPriceThb ?? req.body?.original_price_thb ?? null,
          req.body?.promoVideoUrl || '',
          JSON.stringify(req.body?.thumbnailVariants || {}),
          req.body?.language || 'th',
          JSON.stringify(req.body?.learningOutcomes || []),
          JSON.stringify(req.body?.requirements || []),
        ],
      );
      res.status(201).json({ course: mapCourse(r.rows[0]) });
    } catch (e) {
      console.error('POST /api/course-studio/courses error:', e);
      res.status(500).json({ error: 'Failed to create course' });
    }
  });

  app.patch('/api/course-studio/courses/:id', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const existing = await pool.query(
        `SELECT id, status FROM courses WHERE id = $1 AND instructor_user_id = $2::uuid AND is_marketplace = TRUE`,
        [req.params.id, uid],
      );
      if (!existing.rows?.[0]) return res.status(404).json({ error: 'Course not found' });
      if (existing.rows[0].status === 'published' && req.body?.status && req.body.status !== 'unlisted') {
        return res.status(400).json({ error: 'Published courses can only be unlisted from studio' });
      }
      const r = await pool.query(
        `UPDATE courses SET
           title = COALESCE($3, title),
           subtitle = COALESCE($4, subtitle),
           description = COALESCE($5, description),
           category = COALESCE($6, category),
           duration = COALESCE($7, duration),
           level = COALESCE($8, level),
           image_url = COALESCE($9, image_url),
           price_thb = COALESCE($10, price_thb),
           original_price_thb = COALESCE($11, original_price_thb),
           promo_video_url = COALESCE($12, promo_video_url),
           thumbnail_variants = COALESCE($13::jsonb, thumbnail_variants),
           language = COALESCE($14, language),
           learning_outcomes = COALESCE($15::jsonb, learning_outcomes),
           requirements = COALESCE($16::jsonb, requirements),
           status = COALESCE($17, status),
           sequential_unlock = COALESCE($18, sequential_unlock),
           updated_at = NOW()
         WHERE id = $1 AND instructor_user_id = $2::uuid
         RETURNING *`,
        [
          req.params.id,
          uid,
          req.body?.title ?? null,
          req.body?.subtitle ?? null,
          req.body?.description ?? null,
          req.body?.category ?? null,
          req.body?.duration != null ? Number(req.body.duration) : null,
          req.body?.level ?? null,
          req.body?.imageUrl ?? req.body?.image_url ?? null,
          req.body?.priceThb != null ? Number(req.body.priceThb) : null,
          req.body?.originalPriceThb != null ? Number(req.body.originalPriceThb) : null,
          req.body?.promoVideoUrl ?? null,
          req.body?.thumbnailVariants ? JSON.stringify(req.body.thumbnailVariants) : null,
          req.body?.language ?? null,
          req.body?.learningOutcomes ? JSON.stringify(req.body.learningOutcomes) : null,
          req.body?.requirements ? JSON.stringify(req.body.requirements) : null,
          req.body?.status ?? null,
          req.body?.sequentialUnlock != null ? !!req.body.sequentialUnlock : null,
        ],
      );
      res.json({ course: mapCourse(r.rows[0]) });
    } catch (e) {
      console.error('PATCH /api/course-studio/courses/:id error:', e);
      res.status(500).json({ error: 'Failed to update course' });
    }
  });

  app.post('/api/course-studio/courses/:id/unlist', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      if (!(await assertStudioCourseOwner(pool, req.params.id, uid))) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const r = await pool.query(
        `UPDATE courses SET status = 'unlisted', updated_at = NOW()
         WHERE id = $1 AND instructor_user_id = $2::uuid AND is_marketplace = TRUE AND status = 'published'
         RETURNING *`,
        [req.params.id, uid],
      );
      if (!r.rows?.[0]) {
        return res.status(400).json({ error: 'Only published courses can be unlisted' });
      }
      res.json({ course: mapCourse(r.rows[0]) });
    } catch (e) {
      console.error('POST /api/course-studio/courses/:id/unlist error:', e);
      res.status(500).json({ error: 'Failed to unlist course' });
    }
  });

  app.post('/api/course-studio/courses/:id/submit', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      if (!(await assertStudioCourseOwner(pool, req.params.id, uid))) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const course = await loadCourseDetail(pool, req.params.id, uid, true);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      const instructorProfile = await readInstructorProfile(pool, uid);
      const checklist = buildCourseQualityChecklist(course, course.lessons || [], instructorProfile);
      const gate = evaluateSubmitReadiness(checklist);
      if (!gate.allowed) {
        return res.status(400).json({
          error: gate.error,
          checklist: gate.checklist,
        });
      }
      const r = await pool.query(
        `UPDATE courses SET status = 'in_review', submitted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND instructor_user_id = $2::uuid AND is_marketplace = TRUE
           AND title IS NOT NULL AND price_thb >= 0
         RETURNING *`,
        [req.params.id, uid],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Course not found or invalid' });
      res.json({ course: mapCourse(r.rows[0]), checklist });
    } catch (e) {
      console.error('POST /api/course-studio/courses/:id/submit error:', e);
      res.status(500).json({ error: 'Failed to submit course' });
    }
  });

  app.post('/api/course-studio/courses/:id/sections', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `INSERT INTO course_sections (course_id, title, sort_order) VALUES ($1, $2, $3) RETURNING *`,
        [req.params.id, title, Number(req.body?.sortOrder || 0)],
      );
      res.status(201).json({ section: mapSectionRow(r.rows[0]) });
    } catch (e) {
      console.error('POST /api/course-studio/courses/:id/sections error:', e);
      res.status(500).json({ error: 'Failed to create section' });
    }
  });

  app.patch('/api/course-studio/courses/:id/sections/:sectionId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `UPDATE course_sections SET
           title = COALESCE($3, title),
           sort_order = COALESCE($4, sort_order),
           updated_at = NOW()
         WHERE id = $1::uuid AND course_id = $2
         RETURNING *`,
        [
          req.params.sectionId,
          req.params.id,
          req.body?.title ?? null,
          req.body?.sortOrder != null ? Number(req.body.sortOrder) : null,
        ],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Section not found' });
      res.json({ section: mapSectionRow(r.rows[0]) });
    } catch (e) {
      console.error('PATCH section error:', e);
      res.status(500).json({ error: 'Failed to update section' });
    }
  });

  app.delete('/api/course-studio/courses/:id/sections/:sectionId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      await pool.query(
        `UPDATE course_lessons SET section_id = NULL WHERE section_id = $1::uuid AND course_id = $2`,
        [req.params.sectionId, req.params.id],
      );
      const r = await pool.query(
        `DELETE FROM course_sections WHERE id = $1::uuid AND course_id = $2 RETURNING id`,
        [req.params.sectionId, req.params.id],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Section not found' });
      res.json({ ok: true, deletedId: r.rows[0].id });
    } catch (e) {
      console.error('DELETE section error:', e);
      res.status(500).json({ error: 'Failed to delete section' });
    }
  });

  app.post('/api/course-studio/courses/:id/lessons', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `INSERT INTO course_lessons (
          course_id, section_id, title, sort_order, step_type, video_url, text_content,
          duration_min, quiz_pass_percent, is_preview, resource_urls
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
        [
          req.params.id,
          req.body?.sectionId || null,
          title,
          Number(req.body?.sortOrder || 0),
          req.body?.stepType || 'video',
          req.body?.videoUrl || '',
          req.body?.textContent || '',
          Number(req.body?.durationMin || 0),
          req.body?.quizPassPercent != null ? Number(req.body.quizPassPercent) : null,
          !!req.body?.isPreview,
          JSON.stringify(req.body?.resourceUrls || []),
        ],
      );
      res.status(201).json({ lesson: mapLessonRow(r.rows[0]) });
    } catch (e) {
      console.error('POST /api/course-studio/courses/:id/lessons error:', e);
      res.status(500).json({ error: 'Failed to create lesson' });
    }
  });

  app.patch('/api/course-studio/courses/:id/lessons/:lessonId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `UPDATE course_lessons SET
           title = COALESCE($3, title),
           section_id = COALESCE($4::uuid, section_id),
           sort_order = COALESCE($5, sort_order),
           step_type = COALESCE($6, step_type),
           video_url = COALESCE($7, video_url),
           text_content = COALESCE($8, text_content),
           duration_min = COALESCE($9, duration_min),
           quiz_pass_percent = COALESCE($10, quiz_pass_percent),
           is_preview = COALESCE($11, is_preview),
           resource_urls = COALESCE($12::jsonb, resource_urls),
           updated_at = NOW()
         WHERE id = $1::uuid AND course_id = $2
         RETURNING *`,
        [
          req.params.lessonId,
          req.params.id,
          req.body?.title ?? null,
          req.body?.sectionId ?? null,
          req.body?.sortOrder != null ? Number(req.body.sortOrder) : null,
          req.body?.stepType ?? null,
          req.body?.videoUrl ?? null,
          req.body?.textContent ?? null,
          req.body?.durationMin != null ? Number(req.body.durationMin) : null,
          req.body?.quizPassPercent != null ? Number(req.body.quizPassPercent) : null,
          req.body?.isPreview != null ? !!req.body.isPreview : null,
          req.body?.resourceUrls ? JSON.stringify(req.body.resourceUrls) : null,
        ],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Lesson not found' });
      res.json({ lesson: mapLessonRow(r.rows[0]) });
    } catch (e) {
      console.error('PATCH lesson error:', e);
      res.status(500).json({ error: 'Failed to update lesson' });
    }
  });

  app.delete('/api/course-studio/courses/:id/lessons/:lessonId', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `DELETE FROM course_lessons WHERE id = $1::uuid AND course_id = $2 RETURNING id`,
        [req.params.lessonId, req.params.id],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Lesson not found' });
      res.json({ ok: true, deletedId: r.rows[0].id });
    } catch (e) {
      console.error('DELETE lesson error:', e);
      res.status(500).json({ error: 'Failed to delete lesson' });
    }
  });

  app.get('/api/course-studio/courses/:id/questions', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      if (!(await assertStudioCourseOwner(pool, req.params.id, uid))) {
        return res.status(404).json({ error: 'Course not found' });
      }
      const questions = await loadCourseQuestions(pool, req.params.id);
      res.json({ questions });
    } catch (e) {
      console.error('GET questions error:', e);
      res.status(500).json({ error: 'Failed to load questions' });
    }
  });

  app.post('/api/course-studio/courses/:id/questions', authenticateToken, async (req, res) => {
    const uid = userId(req);
    const questionText = String(req.body?.questionText || req.body?.question_text || '').trim();
    const correctOptionId = req.body?.correctOptionId ?? req.body?.correct_option_id;
    if (!questionText || correctOptionId == null) {
      return res.status(400).json({ error: 'questionText and correctOptionId required' });
    }
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const opts = normalizeQuestionOptions(req.body?.options);
      if (!opts.length) return res.status(400).json({ error: 'At least one option required' });
      const id = generateQuestionId();
      const maxOrder = await pool.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM course_questions WHERE course_id = $1`,
        [req.params.id],
      );
      const sortOrder = req.body?.sortOrder != null ? Number(req.body.sortOrder) : Number(maxOrder.rows?.[0]?.next || 0);
      await pool.query(
        `INSERT INTO course_questions (id, course_id, question_text, options, correct_option_id, sort_order)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [id, req.params.id, questionText, JSON.stringify(opts), String(correctOptionId), sortOrder],
      );
      const r = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [id]);
      res.status(201).json({ question: mapCourseQuestion(r.rows[0]) });
    } catch (e) {
      console.error('POST question error:', e);
      res.status(500).json({ error: 'Failed to create question' });
    }
  });

  app.patch('/api/course-studio/courses/:id/questions/:qid', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const before = await pool.query(
        `SELECT * FROM course_questions WHERE id = $1 AND course_id = $2`,
        [req.params.qid, req.params.id],
      );
      if (!before.rows?.[0]) return res.status(404).json({ error: 'Question not found' });
      const opts = req.body?.options != null
        ? normalizeQuestionOptions(req.body.options)
        : asJson(before.rows[0].options, []);
      await pool.query(
        `UPDATE course_questions SET
           question_text = COALESCE($3, question_text),
           options = COALESCE($4::jsonb, options),
           correct_option_id = COALESCE($5, correct_option_id),
           sort_order = COALESCE($6, sort_order),
           updated_at = NOW()
         WHERE id = $1 AND course_id = $2`,
        [
          req.params.qid,
          req.params.id,
          req.body?.questionText ?? req.body?.question_text ?? null,
          req.body?.options != null ? JSON.stringify(opts) : null,
          req.body?.correctOptionId != null ? String(req.body.correctOptionId) : null,
          req.body?.sortOrder != null ? Number(req.body.sortOrder) : null,
        ],
      );
      const r = await pool.query(`SELECT * FROM course_questions WHERE id = $1`, [req.params.qid]);
      res.json({ question: mapCourseQuestion(r.rows[0]) });
    } catch (e) {
      console.error('PATCH question error:', e);
      res.status(500).json({ error: 'Failed to update question' });
    }
  });

  app.delete('/api/course-studio/courses/:id/questions/:qid', authenticateToken, async (req, res) => {
    const uid = userId(req);
    try {
      const editGate = await assertStudioCourseEditable(pool, req.params.id, uid);
      if (!editGate.ok) return res.status(editGate.httpStatus).json({ error: editGate.error, code: editGate.code });
      const r = await pool.query(
        `DELETE FROM course_questions WHERE id = $1 AND course_id = $2 RETURNING id`,
        [req.params.qid, req.params.id],
      );
      if (!r.rows?.[0]) return res.status(404).json({ error: 'Question not found' });
      res.json({ ok: true, deletedId: r.rows[0].id });
    } catch (e) {
      console.error('DELETE question error:', e);
      res.status(500).json({ error: 'Failed to delete question' });
    }
  });
}
