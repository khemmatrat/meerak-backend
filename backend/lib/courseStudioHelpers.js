/**
 * Course Studio — quality checklist, quiz helpers, submit validation.
 */

import { asJson } from './courseMarketplaceShared.js';

export function buildCourseQualityChecklist(course, lessons = [], instructorProfile = null) {
  const outcomes = asJson(course?.learningOutcomes ?? course?.learning_outcomes, []);
  const outcomeCount = (Array.isArray(outcomes) ? outcomes : []).filter((o) => String(o || '').trim()).length;
  const lessonRows = Array.isArray(lessons) ? lessons : [];
  const previewCount = lessonRows.filter((l) => !!(l.isPreview ?? l.is_preview)).length;
  const paidCount = lessonRows.filter((l) => !(l.isPreview ?? l.is_preview)).length;
  const sectionIds = new Set(
    lessonRows.map((l) => l.sectionId ?? l.section_id).filter(Boolean),
  );
  const lessonMinutes = lessonRows.reduce(
    (sum, l) => sum + Number(l.durationMin ?? l.duration_min ?? 0),
    0,
  );
  const duration = Math.max(Number(course?.duration || 0), lessonMinutes);
  const price = Number(course?.priceThb ?? course?.price_thb ?? 0);
  const hasBio = !!String(instructorProfile?.bio || instructorProfile?.headline || '').trim();
  const hasThumbnail = !!String(course?.imageUrl ?? course?.image_url ?? '').trim();

  const items = [
    { id: 'title', label: 'ชื่อคอร์ส', ok: !!String(course?.title || '').trim(), required: true },
    { id: 'thumbnail', label: 'Thumbnail / รูปปก', ok: hasThumbnail, required: true },
    { id: 'section', label: 'อย่างน้อย 1 section', ok: sectionIds.size >= 1, required: true },
    { id: 'outcomes', label: 'Learning outcomes อย่างน้อย 2 ข้อ', ok: outcomeCount >= 2, required: true },
    { id: 'preview', label: 'Preview lesson อย่างน้อย 1 บท', ok: previewCount >= 1, required: true },
    { id: 'paid_lesson', label: 'บทเรียนที่ขายได้ อย่างน้อย 1 บท', ok: paidCount >= 1, required: true },
    { id: 'pricing', label: 'ตั้งราคาขายแล้ว (> 0)', ok: price > 0, required: true },
    { id: 'duration', label: 'ระยะเวลารวม ≥ 15 นาที', ok: duration >= 15, required: true },
    { id: 'bio', label: 'Bio / Headline ผู้สอน', ok: hasBio, required: true },
  ];
  const requiredItems = items.filter((i) => i.required);
  const passed = requiredItems.filter((i) => i.ok).length;
  return {
    items,
    ready: requiredItems.every((i) => i.ok),
    score: requiredItems.length ? Math.round((passed / requiredItems.length) * 100) : 0,
    stats: { previewCount, paidCount, duration, outcomeCount, sectionCount: sectionIds.size },
  };
}

export function buildRevenueProjections(quote, unitsList = [10, 25, 50]) {
  return unitsList.map((units) => ({
    units,
    gross: Math.round((Number(quote?.grossAmount || 0) * units + Number.EPSILON) * 100) / 100,
    platformFee: Math.round((Number(quote?.platformFee || 0) * units + Number.EPSILON) * 100) / 100,
    instructorNet: Math.round((Number(quote?.instructorNet || 0) * units + Number.EPSILON) * 100) / 100,
  }));
}

export function normalizeQuestionOptions(options) {
  if (Array.isArray(options)) {
    return options.map((o, i) => {
      if (typeof o === 'object' && o != null) {
        return {
          id: String(o.id ?? o.optionId ?? String.fromCharCode(65 + i)),
          text: String(o.text ?? o.label ?? ''),
        };
      }
      return { id: String.fromCharCode(65 + i), text: String(o) };
    });
  }
  if (options && typeof options === 'object') {
    return Object.entries(options).map(([k, v]) => ({ id: String(k), text: String(v) }));
  }
  return [];
}

export function mapCourseQuestion(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    questionText: row.question_text,
    options: asJson(row.options, []),
    correctOptionId: row.correct_option_id,
    sortOrder: row.sort_order,
  };
}

export function generateQuestionId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function evaluateSubmitReadiness(checklist) {
  if (!checklist?.ready) {
    return {
      allowed: false,
      error: 'Quality checklist incomplete',
      checklist,
    };
  }
  return { allowed: true, checklist };
}
