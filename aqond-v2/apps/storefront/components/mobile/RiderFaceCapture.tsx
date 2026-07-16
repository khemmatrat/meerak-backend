'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadRiderKycDocument } from '@/lib/riderKycUpload';

type Props = {
  auth: { userId: string; token?: string };
  value?: string;
  onChange: (url: string) => void;
  onError?: (msg: string) => void;
};

type FaceDetectorLike = {
  detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>>;
};

function hasFaceDetector(): boolean {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

export function RiderFaceCapture({ auth, value, onChange, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const [ready, setReady] = useState(false);
  const [faceOk, setFaceOk] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState(value || '');
  const [hint, setHint] = useState('กำลังเปิดกล้อง…');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let alive = true;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
        setHint('จัดใบหน้าให้อยู่ในกรอบวงรี — ห้ามใช้รูปจากแกลเลอรี');

        if (hasFaceDetector()) {
          try {
            detectorRef.current = new (window as unknown as { FaceDetector: new () => FaceDetectorLike })
              .FaceDetector() as FaceDetectorLike;
          } catch {
            detectorRef.current = null;
          }
        }

        tickTimer = setInterval(() => {
          void (async () => {
            const video = videoRef.current;
            const det = detectorRef.current;
            if (!video || video.readyState < 2) return;
            if (det) {
              try {
                const faces = await det.detect(video);
                const ok = faces.length === 1;
                setFaceOk(ok);
                setHint(ok ? 'พร้อมถ่าย — กดปุ่มด้านล่าง' : 'จัดใบหน้าให้อยู่กลางกรอบ');
              } catch {
                setFaceOk(true);
              }
            } else {
              setFaceOk(true);
              setHint('จัดใบหน้าให้อยู่กลางกรอบ แล้วกดถ่าย');
            }
          })();
        }, 600);
      } catch {
        setHint('ไม่สามารถเปิดกล้องได้ — อนุญาตกล้องในเบราว์เซอร์');
        onError?.('ต้องอนุญาตกล้องเพื่อยืนยันตัวตน');
      }
    }

    if (!preview) void start();

    return () => {
      alive = false;
      if (tickTimer) clearInterval(tickTimer);
      stopCamera();
    };
  }, [preview, stopCamera, onError]);

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !faceOk) return;
    setCapturing(true);
    try {
      const canvas = document.createElement('canvas');
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 640;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas_error');
      ctx.drawImage(video, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('capture_failed'))), 'image/jpeg', 0.92);
      });

      const file = new File([blob], `rider-selfie-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = await uploadRiderKycDocument(auth, file, 'rider_selfie_liveness');
      setPreview(url);
      onChange(url);
      stopCamera();
      setHint('บันทึกรูปยืนยันตัวตนแล้ว — ใช้แสดงบนโปรไฟล์เมื่ออนุมัติ');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'ถ่ายรูปไม่สำเร็จ';
      onError?.(msg);
    } finally {
      setCapturing(false);
    }
  };

  const retake = () => {
    setPreview('');
    onChange('');
    setFaceOk(false);
    setHint('กำลังเปิดกล้อง…');
  };

  if (preview) {
    return (
      <div className="tt-rider-face-capture done">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="รูปยืนยันตัวตน" className="tt-rider-face-preview" />
        <p className="tt-hint">{hint}</p>
        <button type="button" className="tt-btn-secondary" onClick={retake}>
          ถ่ายใหม่
        </button>
      </div>
    );
  }

  return (
    <div className="tt-rider-face-capture">
      <div className="tt-rider-face-viewport">
        <video ref={videoRef} playsInline muted className="tt-rider-face-video" />
        <div className={`tt-rider-face-oval${faceOk ? ' ok' : ''}`} aria-hidden />
      </div>
      <p className="tt-rider-face-hint">{hint}</p>
      <p className="tt-hint">ระบบจับใบหน้าอัจฉริยะ — ไม่รับการอัปโหลดรูปจากแกลเลอรี</p>
      <button
        type="button"
        className="tt-btn-primary tt-rider-face-capture-btn"
        disabled={!ready || !faceOk || capturing}
        onClick={() => void capture()}
      >
        {capturing ? 'กำลังบันทึก…' : 'ถ่ายรูปยืนยันตัวตน'}
      </button>
    </div>
  );
}
