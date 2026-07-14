/**
 * Client-side checks for job proof photos (before/after).
 * Reduces trivial uploads (tiny placeholders, wrong MIME); does not replace server-side moderation.
 */

const MIN_BYTES = 12 * 1024; // ~12KB — real phone photos are usually much larger
const MIN_EDGE = 320; // pixels — reject 1×1 or tiny icons

export type ImageProofKind = "before" | "after";

export interface ImageProofValidationResult {
  ok: boolean;
  message?: string;
}

function loadImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("ไม่สามารถอ่านไฟล์รูปได้"));
    };
    img.src = url;
  });
}

export async function validateJobProofImage(
  file: File,
  kind: ImageProofKind
): Promise<ImageProofValidationResult> {
  const label = kind === "before" ? "ก่อนเริ่มงาน" : "หลังส่งมอบ";
  if (!file.type || !file.type.startsWith("image/")) {
    return { ok: false, message: `(${label}) ต้องเป็นไฟล์รูปภาพ (JPEG/PNG/WebP)` };
  }
  if (file.size < MIN_BYTES) {
    return {
      ok: false,
      message: `(${label}) ไฟล์เล็กเกินไป — กรุณาถ่ายรูปจริงจากกล้อง (ไม่ใช้รูปจำลองหรือไอคอน)`,
    };
  }
  try {
    const { w, h } = await loadImageDimensions(file);
    if (w < MIN_EDGE || h < MIN_EDGE) {
      return {
        ok: false,
        message: `(${label}) ความละเอียดต่ำเกินไป (${w}×${h}) — กรุณาถ่ายรูปจริง`,
      };
    }
  } catch (e: any) {
    return { ok: false, message: e?.message || `(${label}) ตรวจสอบรูปไม่สำเร็จ` };
  }
  return { ok: true };
}
