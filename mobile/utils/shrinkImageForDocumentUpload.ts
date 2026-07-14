/**
 * ลดความละเอียด/บีบ JPEG สำหรับอัปโหลด KYC เพื่อลดโอกาสถูกพร็อกซี NGINX ที่ client_max_body_size ต่ำตัดการเชื่อมต่อ และเร่งบน LTE
 */
const MAX_EDGE = 2048;
const TARGET_MAX_BYTES = 2_000_000;

function isProbablyHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  return /\.hei[cf]$/i.test(file.name || "");
}

export async function shrinkImageForDocumentUpload(file: File): Promise<File> {
  if (
    typeof createImageBitmap === "undefined" ||
    typeof HTMLCanvasElement === "undefined"
  ) {
    return file;
  }

  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/")) return file;
  if (isProbablyHeic(file)) return file;
  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    return file;
  }
  if (file.size < 450_000) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    let w = bitmap.width;
    let h = bitmap.height;
    if (!w || !h) return file;

    if (w > MAX_EDGE || h > MAX_EDGE) {
      if (w >= h) {
        h = Math.max(1, Math.round((h * MAX_EDGE) / w));
        w = MAX_EDGE;
      } else {
        w = Math.max(1, Math.round((w * MAX_EDGE) / h));
        h = MAX_EDGE;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);

    let quality = 0.88;
    let blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    });

    while (blob && blob.size > TARGET_MAX_BYTES && quality > 0.5) {
      quality -= 0.07;
      blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
      });
    }

    if (!blob || blob.size === 0) return file;
    if (blob.size >= file.size) return file;

    const base =
      (file.name && file.name.replace(/\.[^.]+$/, "")) || "kyc_document";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    try {
      bitmap.close();
    } catch {
      /* ignore */
    }
  }
}
