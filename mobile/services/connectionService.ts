/**
 * Coach-Trainee Connection API Service
 * Reference: Migration 060
 */
import { getBackendBase } from "./api";

const getAuthHeaders = (): Record<string, string> => {
  const token = typeof window !== "undefined" ? localStorage.getItem("meerak_token") : null;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const base = () => getBackendBase();

export interface ConnectionKeyResponse {
  connection_key: string;
  uid_key: string;
}

export interface ConnectionItem {
  id: string;
  trainee_id?: string;
  coach_id?: string;
  trainee_name?: string;
  coach_name?: string;
  trainee_key?: string;
  coach_key?: string;
  coach_confirmed: boolean;
  trainee_confirmed: boolean;
  status: "pending" | "active" | "graduated" | "disqualified" | "ended";
  connected_at: string | null;
  first_job_completed_at: string | null;
  training_end_at: string | null;
  needs_confirm: boolean;
  trainee_completed_jobs?: number;
}

export interface ConnectionListResponse {
  as_coach: ConnectionItem[];
  as_trainee: ConnectionItem[];
}

export async function getConnectionKey(): Promise<ConnectionKeyResponse> {
  const res = await fetch(`${base()}/api/connection/key`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "ไม่สามารถโหลดรหัสได้");
  }
  return res.json();
}

export async function addTrainee(traineeKey: string): Promise<{
  success: boolean;
  needs_trainee_confirm?: boolean;
  connection?: Record<string, unknown>;
}> {
  const key = String(traineeKey || "").trim().toUpperCase();
  if (!key) throw new Error("กรุณากรอกรหัสศิษย์");

  const res = await fetch(`${base()}/api/connection/coach-add`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ trainee_key: key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "ไม่สามารถเพิ่มศิษย์ได้");
  }
  return data;
}

export async function confirmConnection(
  connectionId: string,
  asTrainee: boolean
): Promise<{ success: boolean }> {
  if (!connectionId?.trim()) throw new Error("connection_id required");

  const res = await fetch(`${base()}/api/connection/confirm`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      connection_id: connectionId.trim(),
      as_trainee: asTrainee,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "ยืนยันไม่สำเร็จ");
  }
  return data;
}

export async function listConnections(): Promise<ConnectionListResponse> {
  const res = await fetch(`${base()}/api/connection/list`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "โหลดรายการไม่สำเร็จ");
  }
  return res.json();
}
