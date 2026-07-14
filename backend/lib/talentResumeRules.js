/** Rule-based resume draft when ai-core unavailable */

const CATEGORY_LABELS = {
  chef: 'เชฟ / อาหาร',
  tailor: 'ช่างตัดเย็บ / แฟชั่น',
  artist: 'ศิลปิน / บันเทิง',
  barber: 'ช่างตัดผม',
  beauty: 'ความงาม / ซาลอน',
  wellness: 'สปา / สุขภาพ',
  party_guest: 'เพื่อนเที่ยว / บริการ',
  general: 'บริการทั่วไป',
};

function categoryLabel(hint) {
  const k = String(hint || 'general').toLowerCase();
  return CATEGORY_LABELS[k] || hint || 'ผู้ให้บริการมืออาชีพ';
}

export function ruleBasedResumeDraft(ctx) {
  const name = ctx.talent_name || 'ผู้ให้บริการ';
  const cat = categoryLabel(ctx.category_hint);
  const jobs = Number(ctx.completed_jobs_count) || 0;
  const rating = ctx.rating ? Number(ctx.rating).toFixed(1) : null;
  const skills = Array.isArray(ctx.skills) ? ctx.skills.filter(Boolean).slice(0, 5) : [];

  const headline =
    ctx.existing_headline ||
    `${cat} • ${jobs > 0 ? `${jobs} งานสำเร็จ` : 'พร้อมรับงาน'} • AQOND Verified`;

  const aboutParts = [];
  if (ctx.existing_journey) aboutParts.push(ctx.existing_journey);
  else if (ctx.bio) aboutParts.push(ctx.bio);
  else {
    aboutParts.push(
      `${name} เป็นผู้ให้บริการด้าน${cat} เน้นคุณภาพ ตรงเวลา และสื่อสารชัดเจนกับลูกค้า`,
    );
  }
  if (jobs > 0) aboutParts.push(`สะสมประสบการณ์ ${jobs} งานผ่าน AQOND`);
  if (rating) aboutParts.push(`คะแนนเฉลี่ย ${rating}/5 จากลูกค้าจริง`);
  aboutParts.push('จ้างงานปลอดภัยผ่าน AQOND — ดูผลงานและจองคิวได้ทันที');

  const videoScript =
    `สวัสดีครับ ผม${name.replace(/^คุณ/, '')} ครับ ผมเชี่ยวชาญด้าน${cat} ` +
    `${jobs > 0 ? `มีประสบการณ์ ${jobs} งาน ` : ''}` +
    `ทำงานตรงเวลา ใส่ใจทุกรายละเอียด สนใจจ้างงานกดจองผ่าน AQOND ได้เลยครับ`;

  const exp = Array.isArray(ctx.work_experience) ? ctx.work_experience : [];
  const experienceHighlight = exp.slice(0, 2).map((e) => ({
    title: e.title || 'ผู้ให้บริการ',
    company: e.company || 'อิสระ',
    bullet: (e.description || `ประสบการณ์ด้าน${cat}`).slice(0, 80),
  }));

  if (!experienceHighlight.length) {
    experienceHighlight.push({
      title: `ผู้เชี่ยวชาญ${cat}`,
      company: 'AQOND Talent',
      bullet: jobs > 0 ? `ให้บริการสำเร็จ ${jobs} งาน` : 'พร้อมเริ่มงานทันที',
    });
  }

  let score = 35;
  if (ctx.avatar_url) score += 15;
  if (ctx.expert_category || ctx.category_hint) score += 10;
  if (skills.length) score += 10;
  if (jobs > 0) score += 15;
  if (ctx.existing_journey || ctx.bio) score += 10;
  if (rating) score += 5;

  return {
    headline_th: headline.slice(0, 80),
    about_th: aboutParts.join(' ').slice(0, 500),
    video_script_th: videoScript.slice(0, 280),
    skills_highlight: skills.length ? skills : [cat, 'ตรงเวลา', 'สื่อสารดี'].slice(0, 3),
    experience_highlight: experienceHighlight,
    hashtags: ['#AQOND', '#จ้างมืออาชีพ'],
    completeness_score: Math.min(100, score),
    coaching_tip_th:
      score < 60
        ? 'เพิ่มรูปโปรไฟล์ + เลือกหมวดงาน + อัปโหลดพอร์ตโฟลิโอ 1 ชิ้น จะได้โปรไฟล์น่าจ้างขึ้นทันที'
        : 'อัปโหลดวิดีโอแนะนำตัว 15 วินาที แล้วกดเผยแพร่โปรไฟล์ — ลูกค้าจะเห็นเหมือน LinkedIn',
    source: 'rules',
  };
}
