/**
 * KYC supplement — admin ขอเอกสารเพิ่มเฉพาะ (ป้ายเหลือง / ใบขับขี่สาธารณะ)
 * user อัปโหลดเฉพาะเอกสารที่ขอ ไม่ต้องกรอก KYC ใหม่ทั้งชุด
 */

export const KYC_PT_DOC_KEYS = [
  'yellow_plate',
  'public_transport_license_front',
  'public_transport_license_back',
];

const DOC_LABELS_TH = {
  yellow_plate: 'รูปป้ายเหลือง',
  public_transport_license_front: 'ใบอนุญาตขับขี่สาธารณะ (หน้า)',
  public_transport_license_back: 'ใบอนุญาตขับขี่สาธารณะ (หลัง)',
};

export function normalizeRequestedDocs(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const item of list) {
    const k = String(item || '').trim();
    if (KYC_PT_DOC_KEYS.includes(k) && !out.includes(k)) out.push(k);
  }
  if (out.length === 0) {
    return ['yellow_plate', 'public_transport_license_front'];
  }
  return out;
}

export function requestedDocsToStepLabels(docs) {
  return normalizeRequestedDocs(docs).map((k) => DOC_LABELS_TH[k] || k);
}

/** ขยาย CHECK constraint ของ users.kyc_status — รองรับ supplement_required / resubmission_required */
export async function ensureKycStatusCheckConstraint(pool) {
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kyc_status_check`).catch(() => { });
  await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_kyc_status`).catch(() => { });
  await pool.query(`
    ALTER TABLE users ADD CONSTRAINT users_kyc_status_check CHECK (
      kyc_status IS NULL OR kyc_status IN (
        'not_submitted', 'pending', 'pending_review', 'pending_ai_verification',
        'under_review', 'ai_verified', 'ai_failed', 'verified', 'approved',
        'rejected', 'verification_failed', 'resubmission_required', 'supplement_required'
      )
    )
  `).catch((e) => {
    console.warn('ensureKycStatusCheckConstraint:', e?.message || e);
  });
}

export async function ensureKycSupplementSchema(pool) {
  await ensureKycStatusCheckConstraint(pool);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kyc_supplement_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
      instruction TEXT NOT NULL DEFAULT '',
      deadline TIMESTAMPTZ,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_by VARCHAR(64),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(() => { });
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_kyc_supplement_user_status
     ON kyc_supplement_requests(user_id, status, created_at DESC)`,
  ).catch(() => { });
}

export async function getPendingSupplementRequest(pool, userUuid) {
  const r = await pool.query(
    `SELECT id, user_id, requested_docs, instruction, deadline, status, created_at
     FROM kyc_supplement_requests
     WHERE user_id = $1::uuid AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userUuid],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id,
    requested_docs: normalizeRequestedDocs(row.requested_docs),
    instruction: row.instruction || '',
    deadline: row.deadline ? new Date(row.deadline).toISOString() : null,
    status: row.status,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export async function requestKycSupplement(pool, {
  userUuid,
  adminId,
  instruction,
  deadline,
  requestedDocs,
}) {
  const docs = normalizeRequestedDocs(requestedDocs);
  const instr = String(instruction || 'กรุณาแนบเอกสารป้ายเหลืองและใบอนุญาตขับขี่สาธารณะ').trim().slice(0, 4000);
  const stepLabels = requestedDocsToStepLabels(docs);

  await pool.query(
    `UPDATE kyc_supplement_requests SET status = 'cancelled'
     WHERE user_id = $1::uuid AND status = 'pending'`,
    [userUuid],
  ).catch(() => { });

  const ins = await pool.query(
    `INSERT INTO kyc_supplement_requests (user_id, requested_docs, instruction, deadline, created_by)
     VALUES ($1::uuid, $2::jsonb, $3, $4::timestamptz, $5)
     RETURNING id, requested_docs, instruction, deadline, created_at`,
    [
      userUuid,
      JSON.stringify(docs),
      instr,
      deadline || null,
      adminId || 'admin',
    ],
  );

  await pool.query(
    `UPDATE users SET
       kyc_status = 'supplement_required',
       kyc_admin_instruction = $1,
       kyc_resubmission_deadline = $2::timestamptz,
       kyc_required_steps = $3::jsonb,
       updated_at = NOW()
     WHERE id = $4::uuid`,
    [instr, deadline || null, JSON.stringify(stepLabels), userUuid],
  );

  return {
    request: ins.rows[0],
    requested_docs: docs,
    step_labels: stepLabels,
  };
}

export async function submitKycSupplement(pool, {
  userUuid,
  yellowPlatePhotoUrl,
  publicTransportLicenseFrontUrl,
  publicTransportLicenseBackUrl,
}) {
  const pending = await getPendingSupplementRequest(pool, userUuid);
  if (!pending) {
    const err = new Error('ไม่พบคำขอเอกสารเพิ่มจากเจ้าหน้าที่');
    err.statusCode = 400;
    throw err;
  }

  const docs = pending.requested_docs;
  const patches = {};
  if (docs.includes('yellow_plate')) {
    if (!yellowPlatePhotoUrl) {
      const err = new Error('กรุณาแนบรูปป้ายเหลือง');
      err.statusCode = 400;
      throw err;
    }
    patches.yellow_plate_photo_url = yellowPlatePhotoUrl;
  }
  if (docs.includes('public_transport_license_front')) {
    if (!publicTransportLicenseFrontUrl) {
      const err = new Error('กรุณาแนบใบอนุญาตขับขี่สาธารณะ (ด้านหน้า)');
      err.statusCode = 400;
      throw err;
    }
    patches.public_transport_license_front_url = publicTransportLicenseFrontUrl;
  }
  if (docs.includes('public_transport_license_back') && publicTransportLicenseBackUrl) {
    patches.public_transport_license_back_url = publicTransportLicenseBackUrl;
  }

  const latest = await pool.query(
    `SELECT id FROM kyc_submissions WHERE user_id = $1::uuid ORDER BY submitted_at DESC NULLS LAST LIMIT 1`,
    [userUuid],
  );
  if (!latest.rows[0]) {
    const err = new Error('ไม่พบข้อมูล KYC เดิม — กรุณาติดต่อเจ้าหน้าที่');
    err.statusCode = 400;
    throw err;
  }
  const submissionId = latest.rows[0].id;

  const setParts = [
    'wants_public_transport = TRUE',
    "status = 'pending_review'",
    'submitted_at = NOW()',
  ];
  const params = [];
  let i = 1;
  for (const [col, val] of Object.entries(patches)) {
    setParts.push(`${col} = $${i}`);
    params.push(val);
    i += 1;
  }
  params.push(submissionId);
  await pool.query(
    `UPDATE kyc_submissions SET ${setParts.join(', ')} WHERE id = $${i}::uuid`,
    params,
  );

  await pool.query(
    `UPDATE kyc_supplement_requests SET status = 'completed', completed_at = NOW()
     WHERE id = $1::uuid`,
    [pending.id],
  );

  await pool.query(
    `UPDATE users SET
       kyc_status = 'pending_review',
       kyc_submitted_at = NOW(),
       kyc_admin_instruction = NULL,
       kyc_resubmission_deadline = NULL,
       kyc_required_steps = '[]'::jsonb,
       updated_at = NOW()
     WHERE id = $1::uuid`,
    [userUuid],
  );

  return { submissionId, requested_docs: docs, patches };
}

export async function requestKycResubmit(pool, {
  userUuid,
  adminId,
  instruction,
  deadline,
  requiredSteps,
  resubmitTrigger = 'admin_manual',
}) {
  const instr = String(instruction || 'กรุณาส่งเอกสารยืนยันตัวตนใหม่').trim().slice(0, 4000);
  const steps = Array.isArray(requiredSteps)
    ? requiredSteps.map((s) => String(s || '').trim()).filter(Boolean)
    : [];

  await pool.query(
    `UPDATE kyc_supplement_requests SET status = 'cancelled'
     WHERE user_id = $1::uuid AND status = 'pending'`,
    [userUuid],
  ).catch(() => { });

  await pool.query(
    `UPDATE users SET
       kyc_status = 'resubmission_required',
       kyc_admin_instruction = $1,
       kyc_resubmission_deadline = $2::timestamptz,
       kyc_required_steps = $3::jsonb,
       kyc_rejection_reason = NULL,
       kyc_resubmit_trigger = $4,
       updated_at = NOW()
     WHERE id = $5::uuid`,
    [instr, deadline || null, JSON.stringify(steps), String(resubmitTrigger || 'admin_manual').slice(0, 32), userUuid],
  );

  return { instruction: instr, required_steps: steps, adminId, resubmitTrigger };
}
