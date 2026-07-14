/** บีบอัดรูปก่อน POST /api/stories — ลด 413 จาก nginx (default 1MB) / proxy */

const STORY_MAX_EDGE = 1080;
const STORY_JPEG_QUALITY = 0.82;

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("โหลดรูปไม่สำเร็จ"));
    };
    img.src = url;
  });
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("บีบอัดรูปไม่สำเร็จ"));
      },
      "image/jpeg",
      quality,
    );
  });
}

/** ย่อรูป story เป็น JPEG สูงสุด 1080px — วิดีโอส่งตามเดิม */
export async function prepareStoryUploadFile(
  file: File | Blob,
  mediaType?: "text" | "image" | "video",
): Promise<{ blob: File | Blob; filename: string }> {
  const isVideo =
    mediaType === "video" ||
    (file instanceof File && file.type.startsWith("video/"));

  if (isVideo) {
    const name =
      file instanceof File && file.name ? file.name : "story-video.mp4";
    return { blob: file, filename: name };
  }

  if (typeof document === "undefined") {
    const name = file instanceof File && file.name ? file.name : "story.jpg";
    return { blob: file, filename: name };
  }

  try {
    const img = await loadImageFromBlob(file);
    let w = img.naturalWidth || img.width;
    let h = img.naturalHeight || img.height;
    if (!w || !h) {
      throw new Error("invalid dimensions");
    }
    const scale = Math.min(1, STORY_MAX_EDGE / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unsupported");
    ctx.drawImage(img, 0, 0, w, h);

    const blob = await canvasToJpegBlob(canvas, STORY_JPEG_QUALITY);
    const base =
      file instanceof File && file.name
        ? file.name.replace(/\.[a-z0-9]+$/i, "")
        : mediaType === "text"
          ? "story-text"
          : "story";
    return { blob, filename: `${base}.jpg` };
  } catch {
    const fallbackName =
      file instanceof File && file.name ? file.name : "story.jpg";
    return { blob: file, filename: fallbackName };
  }
}
