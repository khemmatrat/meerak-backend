/**
 * Auto-create home banner draft when a marketplace course is approved.
 */
import { createHomeBanner } from './homeBanners.js';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200';

export async function createCourseAnnouncementBannerDraft(pool, course, { adminUserId = null } = {}) {
  if (!course?.id) return { skipped: true, reason: 'missing_course' };

  const existing = await pool.query(
    `SELECT id FROM home_banners
     WHERE action_url ILIKE $1
     LIMIT 1`,
    [`%/courses/${course.id}%`],
  );
  if (existing.rows?.[0]) {
    return { skipped: true, reason: 'banner_exists', bannerId: existing.rows[0].id };
  }

  const title = `คอร์สใหม่: ${String(course.title || 'AQOND Course').slice(0, 80)}`;
  const imageUrl = String(course.image_url || course.imageUrl || '').trim() || FALLBACK_IMAGE;
  const actionUrl = `/courses/${course.id}`;
  const subtitle = String(course.subtitle || course.description || '').slice(0, 120);

  const banner = await createHomeBanner(pool, {
    title,
    imageUrl,
    actionUrl,
    order: 5,
    isActive: false,
    discountDescription: subtitle || 'เรียนทักษะบริการบน AQOND Courses',
    placements: ['home'],
    startDate: new Date().toISOString().slice(0, 10),
  });

  return {
    created: true,
    banner,
    metadata: {
      source: 'course_marketplace_auto',
      course_id: course.id,
      admin_user_id: adminUserId,
    },
  };
}
