import type { Job } from "../types";
import { isDriverCategory } from "./providerJobExtras";

/**
 * บังคับถ่าย/แนบรูปก่อน–หลาย (หรือรูปในแชท — logic ฝั่ง JobDetails) หรือไม่
 *
 * - งานขนส่งคน / คนขับ (category `Driver`) — ไม่บังคับหลักฐานภาพ
 * - งานอื่น (แม่บ้าน, ช่าง, messenger, ฯลฯ) — ใช้ระบบหลักฐานตามเดิม
 */
export function jobRequiresProofPhotos(job: Job | null | undefined): boolean {
  if (!job) return true;
  if (isDriverCategory(job)) return false;
  return true;
}
