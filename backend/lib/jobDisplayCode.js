/**
 * Human-readable job reference code (PREFIX-YYMMDD-TAIL6) — same logic as mobile/utils/jobDisplayCode.ts
 */
const CATEGORY_PREFIX = {
  Cleaning: 'CLN',
  AC_Cleaning: 'ACN',
  Plumbing: 'PLM',
  Electrician: 'ELC',
  Moving: 'MOV',
  Gardening: 'GRD',
  Painting: 'PNT',
  Pest_Control: 'PST',
  Appliance_Repair: 'APR',
  Interior_Design: 'INT',
  Dating: 'DAT',
  Shopping_Buddy: 'SHP',
  Party_Guest: 'PTY',
  Model: 'MDL',
  Consultant: 'CNS',
  Fortune_Telling: 'FOR',
  Queue_Service: 'QUE',
  Private_Chef: 'CHF',
  Beauty: 'BTY',
  Massage: 'MSM',
  Physiotherapy: 'PHY',
  Personal_Trainer: 'FIT',
  Pet_Care: 'PET',
  Caregiving: 'CRG',
  IT_Support: 'ITS',
  Web_Dev: 'WEB',
  Graphic_Design: 'GRF',
  Photography: 'FTO',
  Videography: 'VID',
  Translation: 'TRL',
  Accounting: 'ACC',
  Legal: 'LEG',
  Driver: 'DRV',
  Messenger: 'MSG',
  Tutoring: 'TUT',
  General: 'GEN',
  Marine: 'SEA',
  Booking: 'BKG',
  Advance: 'ADV',
};

function prefixForCategory(category) {
  const c = String(category || 'General').trim();
  if (CATEGORY_PREFIX[c]) return CATEGORY_PREFIX[c];
  const alnum = c.replace(/[^A-Za-z0-9]/g, '');
  if (alnum.length >= 3) return alnum.slice(0, 4).toUpperCase();
  return 'JOB';
}

export function formatJobReferenceCode(job) {
  const prefix = prefixForCategory(job.category);
  const d = job.created_at ? new Date(job.created_at) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const yy = String(safe.getFullYear()).slice(-2);
  const mm = String(safe.getMonth() + 1).padStart(2, '0');
  const dd = String(safe.getDate()).padStart(2, '0');
  const raw = String(job.id || '').replace(/-/g, '');
  const tail = raw.length >= 6
    ? raw.slice(-6).toUpperCase()
    : raw.toUpperCase().padStart(6, '0').slice(-6);
  return `${prefix}-${yy}${mm}${dd}-${tail}`;
}
