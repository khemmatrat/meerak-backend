'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RiderFaceLivenessStep } from '@/lib/riderFaceSession';

type FaceDetectorLike = {
  detect: (image: ImageBitmapSource) => Promise<Array<{ boundingBox?: DOMRectReadOnly }>>;
};

type StepId = RiderFaceLivenessStep['id'];

const STEPS: { id: StepId; label: string; hint: string }[] = [
  { id: 'center', label: 'มองตรง', hint: 'จัดใบหน้าให้อยู่กลางกรอบ' },
  { id: 'turn_left', label: 'หันซ้าย', hint: 'หันศีรษะไปทางซ้ายเล็กน้อย' },
  { id: 'turn_right', label: 'หันขวา', hint: 'หันศีรษะไปทางขวาเล็กน้อย' },
  { id: 'blink', label: 'กระพริบตา', hint: 'กระพริบตา 2–3 ครั้งช้าๆ' },
];

type Props = {
  onComplete: (payload: { selfieBase64: string; liveness: { steps: RiderFaceLivenessStep[] } }) => void;
  onError?: (msg: string) => void;
};

function hasFaceDetector(): boolean {
  return typeof window !== 'undefined' && 'FaceDetector' in window;
}

function faceCenterRatio(box: DOMRectReadOnly, vw: number) {
  const cx = box.x + box.width / 2;
  return cx / Math.max(vw, 1);
}

export function RiderFaceLivenessVerify({ onComplete, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<FaceDetectorLike | null>(null);
  const completedRef = useRef<RiderFaceLivenessStep[]>([]);
  const [ready, setReady] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [hint, setHint] = useState('กำลังเปิดกล้อง…');
  const [progress, setProgress] = useState(0);
  const [blinkHold, setBlinkHold] = useState(0);

  const currentStep = STEPS[stepIdx];

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const captureSelfie = useCallback(async () => {
    const video = videoRef.current;
    if (!video) throw new Error('camera_not_ready');
    const canvas = document.createElement('canvas');
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 640;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_error');
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    return dataUrl;
  }, []);

  const completeStep = useCallback(
    (id: StepId) => {
      if (completedRef.current.some((s) => s.id === id)) return;
      completedRef.current = [
        ...completedRef.current,
        { id, completed_at: new Date().toISOString() },
      ];
      const next = stepIdx + 1;
      setProgress(Math.round((next / STEPS.length) * 100));
      if (next >= STEPS.length) {
        void (async () => {
          try {
            stopCamera();
            const selfieBase64 = await captureSelfie();
            onComplete({ selfieBase64, liveness: { steps: completedRef.current } });
          } catch (e) {
            onError?.(e instanceof Error ? e.message : 'ถ่ายภาพไม่สำเร็จ');
          }
        })();
      } else {
        setStepIdx(next);
        setHint(STEPS[next].hint);
        setBlinkHold(0);
      }
    },
    [captureSelfie, onComplete, onError, stepIdx, stopCamera],
  );

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
        setHint(STEPS[0].hint);

        if (hasFaceDetector()) {
          try {
            detectorRef.current = new (window as unknown as { FaceDetector: new () => FaceDetectorLike })
              .FaceDetector() as FaceDetectorLike;
          } catch {
            detectorRef.current = null;
          }
        }
      } catch {
        setHint('ไม่สามารถเปิดกล้องได้');
        onError?.('ต้องอนุญาตกล้องเพื่อยืนยันใบหน้า');
      }
    }

    void start();

    tickTimer = setInterval(() => {
      void (async () => {
        const video = videoRef.current;
        const det = detectorRef.current;
        const step = STEPS[stepIdx];
        if (!video || video.readyState < 2 || !step) return;

        if (!det) {
          if (step.id === 'blink') {
            setBlinkHold((n) => {
              const next = n + 1;
              if (next >= 4) completeStep('blink');
              return next;
            });
          }
          return;
        }

        try {
          const faces = await det.detect(video);
          if (faces.length !== 1) {
            setHint('จัดใบหน้าให้อยู่คนเดียวในกรอบ');
            return;
          }
          const box = faces[0].boundingBox;
          if (!box) return;
          const ratio = faceCenterRatio(box, video.videoWidth || 640);

          if (step.id === 'center' && ratio > 0.38 && ratio < 0.62) {
            completeStep('center');
          } else if (step.id === 'turn_left' && ratio < 0.42) {
            completeStep('turn_left');
          } else if (step.id === 'turn_right' && ratio > 0.58) {
            completeStep('turn_right');
          } else if (step.id === 'blink') {
            const area = box.width * box.height;
            const vw = video.videoWidth || 640;
            const vh = video.videoHeight || 640;
            const minArea = vw * vh * 0.04;
            setBlinkHold((n) => {
              const next = area < minArea * 0.65 ? n + 1 : Math.max(0, n - 1);
              if (next >= 3) completeStep('blink');
              return next;
            });
          }
        } catch {
          /* ignore frame errors */
        }
      })();
    }, 500);

    return () => {
      alive = false;
      if (tickTimer) clearInterval(tickTimer);
      stopCamera();
    };
  }, [completeStep, onError, stepIdx, stopCamera]);

  return (
    <div className="tt-rider-face-liveness">
      <div className="tt-rider-face-liveness-head">
        <p className="tt-rider-face-liveness-title">ยืนยันใบหน้า (Liveness)</p>
        <p className="tt-rider-face-liveness-step">
          ขั้นที่ {Math.min(stepIdx + 1, STEPS.length)}/{STEPS.length}: {currentStep?.label}
        </p>
        <div className="tt-rider-face-liveness-bar" aria-hidden>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="tt-rider-face-capture-wrap">
        <video ref={videoRef} className="tt-rider-face-capture-video" playsInline muted />
        <div className="tt-rider-face-capture-oval" />
      </div>
      <p className="tt-rider-face-liveness-hint">{ready ? hint : 'กำลังเปิดกล้อง…'}</p>
      {!hasFaceDetector() && ready && (
        <button
          type="button"
          className="tt-rider-face-liveness-manual"
          onClick={() => completeStep(currentStep.id)}
        >
          ทำตามคำแนะนำแล้ว — ขั้นถัดไป
        </button>
      )}
    </div>
  );
}
