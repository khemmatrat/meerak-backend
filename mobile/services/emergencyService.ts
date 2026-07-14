/**
 * Emergency SOS Service — "World's Best SOS"
 * Digital Identity payload to authorities (POLICE I LERT U, 1669)
 * Fallback: direct tel:191 / tel:1669 when API fails
 */
import { api } from './api';

export interface EmergencyPayload {
  lat: number;
  lng: number;
  google_maps_link?: string;
  medical?: {
    blood_type?: string;
    allergies?: string;
  };
  emergency_contacts?: string[];
  user_id?: string;
  full_name?: string;
  phone?: string;
  timestamp: string;
  /** Marine/Island: wave height, battery level */
  marine?: {
    wave_height_m?: number;
    battery_percent?: number;
  };
  trigger_type?: 'sos' | 'aero_medevac' | 'marine_sos';
}

export async function sendSOS(payload: Partial<EmergencyPayload>): Promise<{ success: boolean; fallback?: boolean }> {
  const full: EmergencyPayload = {
    lat: payload.lat ?? 0,
    lng: payload.lng ?? 0,
    ...payload,
    timestamp: new Date().toISOString(),
  };
  try {
    const res = await api.post('/emergency/sos', full, { timeout: 8000 });
    return { success: res.data?.success ?? true };
  } catch (e) {
    // High-availability: API fails → fallback to direct call
    return { success: false, fallback: true };
  }
}

export async function requestAeroMedevac(payload: Partial<EmergencyPayload>): Promise<{ success: boolean }> {
  const full: EmergencyPayload = {
    ...payload,
    lat: payload.lat ?? 0,
    lng: payload.lng ?? 0,
    timestamp: new Date().toISOString(),
    trigger_type: 'aero_medevac',
  };
  try {
    const res = await api.post('/emergency/sos', full, { timeout: 8000 });
    return { success: res.data?.success ?? true };
  } catch (e) {
    return { success: false };
  }
}
