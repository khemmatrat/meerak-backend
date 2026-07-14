import type { LucideIcon } from "lucide-react";
import {
  BrushCleaning,
  Camera,
  Car,
  MapPin,
  Navigation,
  SendHorizontal,
  Sparkles,
  Stethoscope,
  Wrench,
} from "lucide-react";

/**
 * ไอคอนขั้นตอนผู้รับงาน [เดินทาง, ถึงหน้างาน, หลักฐาน, ส่งมอบ] — ตามหมวดงาน (Lineman-style cues)
 */
export function getProviderStepIcons(category: string | undefined): LucideIcon[] {
  const c = (category || "").toLowerCase();
  const base = [Navigation, MapPin, Camera, SendHorizontal] as LucideIcon[];

  if (/(clean|maid|แม่บ้าน|cleaning|housekeeping|ทำความสะอาด)/.test(c)) {
    return [Car, MapPin, BrushCleaning, SendHorizontal];
  }
  if (/(driv|driver|รถรับ|ขับรถ|delivery|transport|messenger|logistics)/.test(c)) {
    return [Car, MapPin, Camera, SendHorizontal];
  }
  if (/(repair|technician|ช่าง|ช่างซ่อม|ac_clean|it support|tech_support|fix)/.test(c)) {
    return [Wrench, MapPin, Camera, SendHorizontal];
  }
  if (/(beauty|spa|makeup|แต่งหน้า|ความงาม)/.test(c)) {
    return [Navigation, MapPin, Sparkles, SendHorizontal];
  }
  if (/(health|medical|nurse|พยาบาล|clinic)/.test(c)) {
    return [Car, MapPin, Stethoscope, SendHorizontal];
  }
  if (/(photo|photography|ถ่าย)/.test(c)) {
    return [Navigation, MapPin, Camera, SendHorizontal];
  }

  return base;
}
