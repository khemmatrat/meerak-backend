/**
 * Course order ↔ fiscal / WHT documents for self-service tax filing.
 */
import { getDocumentWithLines } from './taxDocumentService.js';
import { isFiscalDocumentPdfReady } from './fiscalDocumentPdf.js';
import { providerWhtEligibility } from './providerWhtService.js';

function mapFiscalDocRow(row, { purpose, label } = {}) {
  const status = String(row.status || 'draft').toLowerCase();
  return {
    id: row.id,
    documentType: row.document_type,
    documentNo: row.document_no || null,
    status,
    partyRole: row.party_role || null,
    purpose: purpose || row.document_type,
    label: label || row.document_type,
    issuedAt: row.issued_at || null,
    createdAt: row.created_at || null,
    downloadable: isFiscalDocumentPdfReady(row),
    sourceEventId: row.source_event_id || null,
  };
}

async function loadTaxProfile(client, userId) {
  const r = await client.query(
    `SELECT * FROM tax_user_profiles WHERE user_id = $1::uuid LIMIT 1`,
    [String(userId)],
  ).catch(() => ({ rows: [] }));
  return r.rows?.[0] || null;
}

export async function loadCourseOrderTaxDocuments(client, orderId, viewerUserId) {
  const orderRes = await client.query(
    `SELECT o.*, c.title AS course_title
     FROM course_purchase_orders o
     JOIN courses c ON c.id = o.course_id
     WHERE o.id = $1::uuid LIMIT 1`,
    [orderId],
  );
  const order = orderRes.rows?.[0];
  if (!order) return { ok: false, code: 'order_not_found' };

  const viewer = String(viewerUserId || '');
  const isBuyer = viewer && (
    String(order.user_id) === viewer
    || String(order.metadata?.purchased_by_user_id || '') === viewer
  );
  const isInstructor = viewer && String(order.instructor_user_id) === viewer;
  if (!isBuyer && !isInstructor) {
    return { ok: false, code: 'forbidden' };
  }

  const documents = [];
  const meta = typeof order.metadata === 'string'
    ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
    : (order.metadata || {});

  if (isBuyer && order.ledger_id) {
    const purchaseDocs = await client.query(
      `SELECT * FROM fiscal_documents WHERE source_event_id = $1 ORDER BY created_at ASC`,
      [order.ledger_id],
    ).catch(() => ({ rows: [] }));

    for (const row of purchaseDocs.rows || []) {
      const type = String(row.document_type || '').toLowerCase();
      const role = String(row.party_role || '').toLowerCase();
      if (role === 'customer' || String(row.party_user_id) === String(order.user_id)) {
        documents.push(mapFiscalDocRow(row, {
          purpose: type === 'tax_invoice' ? 'platform_fee_invoice' : 'buyer_receipt',
          label: type === 'tax_invoice' ? 'ใบกำกับภาษีค่าธรรมเนียม' : 'ใบเสร็จการซื้อคอร์ส',
        }));
      }
    }
  }

  if (isInstructor && order.payout_ledger_id) {
    const whtRes = await client.query(
      `SELECT tw.*,
              ed.id AS earning_doc_id, ed.document_type AS earning_doc_type, ed.document_no AS earning_doc_no,
              ed.status AS earning_doc_status, ed.issued_at AS earning_doc_issued_at, ed.created_at AS earning_doc_created_at,
              ed.party_role AS earning_party_role, ed.source_event_id AS earning_source_event_id,
              wd.id AS wht_doc_id, wd.document_type AS wht_doc_type, wd.document_no AS wht_doc_no,
              wd.status AS wht_doc_status, wd.issued_at AS wht_doc_issued_at, wd.created_at AS wht_doc_created_at,
              wd.party_role AS wht_party_role, wd.source_event_id AS wht_source_event_id
       FROM tax_withholding_postings tw
       LEFT JOIN fiscal_documents ed ON ed.id = tw.earning_document_id
       LEFT JOIN fiscal_documents wd ON wd.id = tw.wht_certificate_document_id
       WHERE tw.source_event_id = $1 AND tw.provider_user_id = $2::uuid
       LIMIT 1`,
      [order.payout_ledger_id, order.instructor_user_id],
    ).catch(() => ({ rows: [] }));

    const posting = whtRes.rows?.[0];
    if (posting?.earning_doc_id) {
      documents.push(mapFiscalDocRow({
        id: posting.earning_doc_id,
        document_type: posting.earning_doc_type,
        document_no: posting.earning_doc_no,
        status: posting.earning_doc_status,
        party_role: posting.earning_party_role,
        source_event_id: posting.earning_source_event_id,
        issued_at: posting.earning_doc_issued_at,
        created_at: posting.earning_doc_created_at,
      }, {
        purpose: 'instructor_earning_statement',
        label: 'ใบแสดงรายได้ผู้สอน (ชี้แจงรายได้)',
      }));
    }
    if (posting?.wht_doc_id) {
      documents.push(mapFiscalDocRow({
        id: posting.wht_doc_id,
        document_type: posting.wht_doc_type,
        document_no: posting.wht_doc_no,
        status: posting.wht_doc_status,
        party_role: posting.wht_party_role,
        source_event_id: posting.wht_source_event_id,
        issued_at: posting.wht_doc_issued_at,
        created_at: posting.wht_doc_created_at,
      }, {
        purpose: 'wht_certificate',
        label: 'หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)',
      }));
    }

    const payoutDocs = await client.query(
      `SELECT * FROM fiscal_documents WHERE source_event_id = $1 ORDER BY created_at ASC`,
      [order.payout_ledger_id],
    ).catch(() => ({ rows: [] }));
    for (const row of payoutDocs.rows || []) {
      if (documents.some((d) => d.id === row.id)) continue;
      documents.push(mapFiscalDocRow(row, {
        purpose: 'seller_statement',
        label: 'Seller Statement (release)',
      }));
    }
  }

  let taxProfileHint = null;
  if (isInstructor) {
    const taxProfile = await loadTaxProfile(client, order.instructor_user_id);
    const eligibility = providerWhtEligibility(taxProfile);
    if (!eligibility.eligible) {
      taxProfileHint = {
        code: eligibility.reason,
        message: 'กรอกและยืนยัน Tax Profile เพื่อออกเอกสารชี้แจงรายได้และ 50 ทวิ ครบถ้วน',
      };
    }
  }

  return {
    ok: true,
    orderId: order.id,
    courseTitle: order.course_title,
    payoutStatus: order.payout_status,
    wht: {
      withheld: Number(meta.wht_withheld || 0),
      ratePercent: Number(meta.wht_rate_percent || 0),
      netReleased: Number(meta.wht_net_released || meta.payout_released_amount || 0),
      eligibility: meta.wht_eligibility || null,
    },
    taxProfileHint,
    documents,
  };
}

export function pickPrimaryTaxDocument(taxPayload, { viewerRole = 'buyer' } = {}) {
  const docs = taxPayload?.documents || [];
  if (!docs.length) return null;
  if (viewerRole === 'instructor') {
    return docs.find((d) => d.purpose === 'wht_certificate' && d.downloadable)
      || docs.find((d) => d.purpose === 'instructor_earning_statement' && d.downloadable)
      || docs.find((d) => d.purpose === 'instructor_earning_statement')
      || docs.find((d) => d.purpose === 'seller_statement' && d.downloadable)
      || docs[0];
  }
  return docs.find((d) => d.purpose === 'buyer_receipt' && d.downloadable)
    || docs.find((d) => d.purpose === 'buyer_receipt')
    || docs[0];
}

export async function loadIssuedFiscalDocumentForOrder(client, orderId, viewerUserId, { viewerRole = 'buyer' } = {}) {
  const payload = await loadCourseOrderTaxDocuments(client, orderId, viewerUserId);
  if (!payload.ok) return payload;
  const primary = pickPrimaryTaxDocument(payload, { viewerRole });
  if (!primary?.id || !primary.downloadable) {
    return { ok: false, code: 'no_issued_fiscal_document', taxDocuments: payload };
  }
  const document = await getDocumentWithLines(client, primary.id);
  if (!document || !isFiscalDocumentPdfReady(document)) {
    return { ok: false, code: 'fiscal_not_ready', taxDocuments: payload };
  }
  if (String(document.party_user_id) !== String(viewerUserId)) {
    return { ok: false, code: 'forbidden' };
  }
  return { ok: true, document, primary, taxDocuments: payload };
}
