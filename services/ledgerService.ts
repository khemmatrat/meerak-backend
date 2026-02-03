/**
 * Phase 3: Immutable Payment Ledger Service
 *
 * Append-only ledger for payment events. No update/delete.
 * Used for audit trail and daily reconciliation.
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
} from "firebase/firestore";
import type { LedgerEntry, LedgerEventType } from "../types";

const COLLECTION = "payment_ledger";

/**
 * Append a ledger entry (immutable - no update/delete).
 */
export async function appendLedgerEntry(
  entry: Omit<LedgerEntry, "id" | "created_at">,
  context?: { logger?: { info: (msg: string, data?: object) => void } },
): Promise<string> {
  const id = `ledger_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();

  const data: LedgerEntry = {
    ...entry,
    id,
    created_at: now,
  };

  const clean = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) out[k] = v;
    }
    return out;
  };

  await setDoc(doc(db, COLLECTION, id), clean(data as Record<string, unknown>));
  if (context?.logger)
    context.logger.info("Ledger entry appended", {
      id,
      event_type: entry.event_type,
    });
  return id;
}

/**
 * Record payment created (e.g. QR generated).
 */
export async function recordPaymentCreated(params: {
  payment_id: string;
  gateway: LedgerEntry["gateway"];
  job_id: string;
  amount: number;
  currency: string;
  bill_no: string;
  transaction_no: string;
  user_id?: string;
  metadata?: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
}): Promise<string> {
  return appendLedgerEntry({
    event_type: "payment_created",
    payment_id: params.payment_id,
    gateway: params.gateway,
    job_id: params.job_id,
    amount: params.amount,
    currency: params.currency,
    status: "pending",
    bill_no: params.bill_no,
    transaction_no: params.transaction_no,
    user_id: params.user_id,
    metadata: params.metadata,
    request_id: params.request_id,
    trace_id: params.trace_id,
    created_by: params.user_id,
  });
}

/**
 * Record payment completed.
 */
export async function recordPaymentCompleted(params: {
  payment_id: string;
  gateway: LedgerEntry["gateway"];
  job_id: string;
  amount: number;
  currency: string;
  bill_no: string;
  transaction_no: string;
  payment_no?: string;
  user_id?: string;
  provider_id?: string;
  metadata?: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
}): Promise<string> {
  return appendLedgerEntry({
    event_type: "payment_completed",
    payment_id: params.payment_id,
    gateway: params.gateway,
    job_id: params.job_id,
    amount: params.amount,
    currency: params.currency,
    status: "completed",
    bill_no: params.bill_no,
    transaction_no: params.transaction_no,
    payment_no: params.payment_no,
    user_id: params.user_id,
    provider_id: params.provider_id,
    metadata: params.metadata,
    request_id: params.request_id,
    trace_id: params.trace_id,
    created_by: params.user_id,
  });
}

/**
 * Record payment failed / expired / refunded.
 */
export async function recordPaymentEvent(
  event_type: LedgerEventType,
  params: {
    payment_id: string;
    gateway: LedgerEntry["gateway"];
    job_id: string;
    amount: number;
    currency: string;
    bill_no: string;
    transaction_no: string;
    status: LedgerEntry["status"];
    user_id?: string;
    provider_id?: string;
    metadata?: Record<string, unknown>;
    request_id?: string;
    trace_id?: string;
  },
): Promise<string> {
  return appendLedgerEntry({
    event_type,
    payment_id: params.payment_id,
    gateway: params.gateway,
    job_id: params.job_id,
    amount: params.amount,
    currency: params.currency,
    status: params.status,
    bill_no: params.bill_no,
    transaction_no: params.transaction_no,
    user_id: params.user_id,
    provider_id: params.provider_id,
    metadata: params.metadata,
    request_id: params.request_id,
    trace_id: params.trace_id,
    created_by: params.user_id,
  });
}

/**
 * List ledger entries by date (for reconciliation).
 * Uses single range on created_at and filters end in memory (Firestore limit).
 */
export async function getLedgerEntriesByDate(
  date: string,
): Promise<LedgerEntry[]> {
  const start = `${date}T00:00:00.000Z`;
  const end = `${date}T23:59:59.999Z`;
  const q = query(
    collection(db, COLLECTION),
    where("created_at", ">=", start),
    orderBy("created_at", "asc"),
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as LedgerEntry);
  return list.filter((e) => e.created_at <= end);
}

/**
 * Get ledger entries for a job.
 * Note: Requires Firestore composite index on (job_id, created_at) if not exists.
 */
export async function getLedgerEntriesByJob(
  job_id: string,
): Promise<LedgerEntry[]> {
  const q = query(collection(db, COLLECTION), where("job_id", "==", job_id));
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => d.data() as LedgerEntry);
  list.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  return list;
}

/**
 * Daily reconciliation summary for a date.
 */
export async function getReconciliationSummary(date: string): Promise<{
  date: string;
  total_created: number;
  total_completed: number;
  total_failed: number;
  total_refunded: number;
  total_amount_created: number;
  total_amount_completed: number;
  entry_count: number;
}> {
  const entries = await getLedgerEntriesByDate(date);
  const summary = {
    date,
    total_created: 0,
    total_completed: 0,
    total_failed: 0,
    total_refunded: 0,
    total_amount_created: 0,
    total_amount_completed: 0,
    entry_count: entries.length,
  };

  for (const e of entries) {
    if (e.event_type === "payment_created") {
      summary.total_created += 1;
      summary.total_amount_created += e.amount;
    } else if (e.event_type === "payment_completed") {
      summary.total_completed += 1;
      summary.total_amount_completed += e.amount;
    } else if (
      e.event_type === "payment_failed" ||
      e.event_type === "payment_expired"
    ) {
      summary.total_failed += 1;
    } else if (e.event_type === "payment_refunded") {
      summary.total_refunded += 1;
    }
  }

  return summary;
}

export default {
  appendLedgerEntry,
  recordPaymentCreated,
  recordPaymentCompleted,
  recordPaymentEvent,
  getLedgerEntriesByDate,
  getLedgerEntriesByJob,
  getReconciliationSummary,
};
