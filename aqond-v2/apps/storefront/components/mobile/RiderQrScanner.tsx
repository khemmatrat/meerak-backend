'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (raw: string) => void;
  busy?: boolean;
};

/** Scan merchant pickup QR — BarcodeDetector with manual paste fallback. */
export function RiderQrScanner({ open, onClose, onScan, busy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [manual, setManual] = useState('');

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setErr('');
      setManual('');
      return;
    }

    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErr('ใช้ช่องวางโค้ดด้านล่างแทน');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!alive) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setReady(true);

        const Detector = (window as any).BarcodeDetector;
        if (Detector) {
          const detector = new Detector({ formats: ['qr_code'] });
          timer = setInterval(async () => {
            const v = videoRef.current;
            if (!v || busy) return;
            try {
              const codes = await detector.detect(v);
              const raw = codes?.[0]?.rawValue;
              if (raw) onScan(raw);
            } catch {
              /* ignore frame errors */
            }
          }, 800);
        } else {
          setErr('เบราว์เซอร์ไม่รองรับสแกนอัตโนมัติ — วางโค้ดด้านล่าง');
        }
      } catch {
        if (alive) setErr('เปิดกล้องไม่ได้ — วางโค้ด QR ด้านล่าง');
      }
    }

    void start();
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      stopCamera();
    };
  }, [open, stopCamera, onScan, busy]);

  const submitManual = () => {
    const raw = manual.trim();
    if (!raw || busy) return;
    onScan(raw);
  };

  if (!open) return null;

  return (
    <div className="tt-sheet-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="tt-sheet tt-rider-qr-sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tt-sheet-close" aria-label="ปิด" onClick={onClose}>×</button>
        <h2 className="tt-rider-qr-title">สแกน QR รับออเดอร์</h2>
        <p className="tt-hint">สแกน QR ที่ร้านแสดง — ยืนยัน order + ร้าน + ลายเซ็น</p>
        <div className="tt-rider-qr-video-wrap">
          <video ref={videoRef} className="tt-rider-qr-video" playsInline muted />
          {!ready && !err && <p className="tt-hint">กำลังเปิดกล้อง…</p>}
        </div>
        {err && <p className="tt-hint">{err}</p>}
        <textarea
          className="tt-rider-qr-manual"
          placeholder='วางโค้ด JSON จาก QR เช่น {"type":"aqond_food_pickup",...}'
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          rows={3}
        />
        <button type="button" className="tt-btn-primary" disabled={busy || !manual.trim()} onClick={submitManual}>
          ยืนยันโค้ด
        </button>
      </div>
    </div>
  );
}
