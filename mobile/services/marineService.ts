/**
 * AQOND Marine Service — Check-in, SOS, Piers, Car-Boat Sync
 */
import { getBackendBase } from './api';

const base = () => getBackendBase();

export async function getPiers(status = 'open') {
  const res = await fetch(`${base()}/api/marine/piers?status=${status}`);
  const data = await res.json();
  return data.piers || [];
}

export async function checkPierBoatCompatibility(pierId: string, boatGrade: string) {
  const res = await fetch(`${base()}/api/marine/piers/${encodeURIComponent(pierId)}/available-boats?boat_grade=${encodeURIComponent(boatGrade)}`);
  const data = await res.json();
  return data;
}

export async function getEligibleCaptains(pierId?: string) {
  const q = pierId ? `?pier_id=${encodeURIComponent(pierId)}` : '';
  const res = await fetch(`${base()}/api/marine/captains/eligible${q}`);
  const data = await res.json();
  return data.captains || [];
}

export async function checkIn(jobId: string, lat: number, lng: number, token?: string) {
  const res = await fetch(`${base()}/api/marine/check-in`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ job_id: jobId, lat, lng }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Check-in failed');
  return data;
}

export async function sendSOS(jobId: string, lat: number, lng: number, token?: string) {
  const res = await fetch(`${base()}/api/marine/sos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ job_id: jobId, lat, lng }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'SOS failed');
  return data;
}

export async function checkCarBoatSync(carEtaMinutes: number, boatDeparture: string) {
  const res = await fetch(
    `${base()}/api/marine/car-boat-sync?car_eta_minutes=${carEtaMinutes}&boat_departure=${encodeURIComponent(boatDeparture)}`
  );
  const data = await res.json();
  return data;
}

export async function getDepositInfo(subService: string, totalPrice: number) {
  const res = await fetch(
    `${base()}/api/marine/deposit-info?sub_service=${encodeURIComponent(subService)}&total_price=${totalPrice}`
  );
  const data = await res.json();
  return data;
}

export async function bookWithDeposit(jobPayload: Record<string, unknown>) {
  const token = localStorage.getItem('meerak_token') || undefined;
  const res = await fetch(`${base()}/api/marine/book-with-deposit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(jobPayload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'จองไม่สำเร็จ');
  return data;
}

export async function cancelMarineJob(jobId: string) {
  const token = localStorage.getItem('meerak_token') || undefined;
  const res = await fetch(`${base()}/api/marine/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ยกเลิกไม่สำเร็จ');
  return data;
}
