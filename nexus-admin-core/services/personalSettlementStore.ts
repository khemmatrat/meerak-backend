/**
 * เก็บข้อมูลบัญชีรับชั่วคราว + รายการรับ/จ่าย (localStorage)
 * เมื่อ backend พร้อม: แทนที่ด้วย API ใน adminApi.ts
 */
import type {
  ManualSettlementRecord,
  PersonalSettlementAccount,
} from "../types";

const STORAGE_KEY = "nexus_personal_settlement_v1";
const DEFAULT_ACCOUNT_ID = "default";

type StoreShape = {
  account: PersonalSettlementAccount | null;
  records: ManualSettlementRecord[];
};

function load(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { account: null, records: [] };
    const p = JSON.parse(raw) as StoreShape;
    if (!p || typeof p !== "object") return { account: null, records: [] };
    return {
      account: p.account && typeof p.account === "object" ? p.account : null,
      records: Array.isArray(p.records) ? p.records : [],
    };
  } catch {
    return { account: null, records: [] };
  }
}

function save(s: StoreShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota */
  }
}

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function getPersonalSettlementAccount(): PersonalSettlementAccount | null {
  return load().account;
}

export function upsertPersonalSettlementAccount(
  input: Omit<PersonalSettlementAccount, "id" | "updatedAt"> & { id?: string }
): PersonalSettlementAccount {
  const now = new Date().toISOString();
  const prev = load();
  const account: PersonalSettlementAccount = {
    id: input.id || prev.account?.id || DEFAULT_ACCOUNT_ID,
    label: input.label.trim() || "บัญชีรับชั่วคราว",
    bankName: input.bankName.trim(),
    accountHolderName: input.accountHolderName.trim(),
    accountNumber: input.accountNumber.replace(/\s/g, ""),
    promptPayId: input.promptPayId?.replace(/\s/g, "") || undefined,
    preferredMobileBankApps: input.preferredMobileBankApps?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    updatedAt: now,
  };
  save({ ...prev, account });
  return account;
}

export function listManualSettlementRecords(): ManualSettlementRecord[] {
  return [...load().records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function addManualSettlementRecord(
  r: Omit<ManualSettlementRecord, "id" | "createdAt"> & { createdBy?: string }
): ManualSettlementRecord {
  const prev = load();
  const row: ManualSettlementRecord = {
    ...r,
    id: genId(),
    createdAt: new Date().toISOString(),
  };
  save({ ...prev, records: [row, ...prev.records] });
  return row;
}

export function updateManualSettlementRecord(
  id: string,
  patch: Partial<Pick<ManualSettlementRecord, "status" | "notes" | "bankReference">>
): ManualSettlementRecord | null {
  const prev = load();
  const idx = prev.records.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const next = { ...prev.records[idx], ...patch };
  const records = [...prev.records];
  records[idx] = next;
  save({ ...prev, records });
  return next;
}

export function exportRecordsCsv(): string {
  const rows = listManualSettlementRecords();
  const header = [
    "id",
    "direction",
    "channel",
    "amount",
    "currency",
    "referenceLabel",
    "bankReference",
    "transferAt",
    "status",
    "notes",
    "slipUrl",
    "createdAt",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const esc = (s: string | undefined) =>
      `"${String(s ?? "").replace(/"/g, '""')}"`;
    lines.push(
      [
        r.id,
        r.direction,
        r.channel,
        r.amount,
        r.currency,
        esc(r.referenceLabel),
        esc(r.bankReference),
        esc(r.transferAt),
        r.status,
        esc(r.notes),
        esc(r.slipUrl),
        r.createdAt,
      ].join(",")
    );
  }
  return lines.join("\n");
}
