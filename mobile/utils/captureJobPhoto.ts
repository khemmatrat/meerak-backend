/**
 * ถ่ายภาพจากกล้องบนเว็บ (getUserMedia) — ใช้กล้องหลังเมื่อรองรับ
 * ต้องใช้ HTTPS หรือ localhost; บน native แอปควรใช้ Capacitor Camera plugin แยกเมื่อผูกโปรเจกต์
 */
export async function capturePhotoFromCamera(): Promise<File | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("video_timeout")), 15000);
      video.onloadeddata = () => {
        clearTimeout(t);
        resolve();
      };
    });
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w < 2 || h < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    stream.getTracks().forEach((tr) => tr.stop());
    stream = null;
    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve(new File([blob], `camera_${Date.now()}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92
      );
    });
  } catch {
    if (stream) stream.getTracks().forEach((tr) => tr.stop());
    return null;
  }
}
