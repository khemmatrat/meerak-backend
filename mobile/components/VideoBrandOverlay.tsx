/**
 * VideoBrandOverlay — ลายน้ำและฉากคลิปจบแบบ TikTok
 * ป้องกันการปลอมแปลงและดูดคลิป ทุกคลิปติดแบรนด์แพลตฟอร์ม
 */
import React, { useState } from "react";
import "./VideoBrandOverlay.css";

const PLATFORM_NAME = "aqond";
const LOGO_URL = "/logo.png";
const END_CARD_DURATION_MS = 2500;

interface VideoBrandOverlayProps {
  /** Video element ref สำหรับ listen ended */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** แสดง end card เมื่อคลิปจบ (default: true) */
  showEndCard?: boolean;
  /** Video loop หรือไม่ — ถ้า true จะแสดง end card สั้นๆ แล้ว loop ต่อ */
  loop?: boolean;
  /** เมื่อ end card จบ (ใช้เมื่อ loop=false) เช่น ไปคลิปถัดไป */
  onEndCardComplete?: () => void;
  /** คลาสสำหรับ container */
  className?: string;
  children: React.ReactNode;
}

export const VideoBrandOverlay: React.FC<VideoBrandOverlayProps> = ({
  videoRef,
  showEndCard = true,
  loop = true,
  onEndCardComplete,
  className = "",
  children,
}) => {
  const [showEndCardOverlay, setShowEndCardOverlay] = useState(false);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const onEnded = () => {
      if (!showEndCard) return;
      setShowEndCardOverlay(true);
      timeoutId = setTimeout(() => {
        setShowEndCardOverlay(false);
        if (loop && videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        } else if (onEndCardComplete) {
          onEndCardComplete();
        }
      }, END_CARD_DURATION_MS);
    };
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("ended", onEnded);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [videoRef, showEndCard, loop, onEndCardComplete]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      {children}

      {/* ลายน้ำ — ติดทุกคลิป มุมขวาบน พื้นหลังดำ */}
      <div
        className="video-brand-overlay-watermark absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black pointer-events-none select-none"
        aria-hidden
      >
        <img
          src={LOGO_URL}
          alt=""
          className="w-6 h-6 object-contain opacity-90"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="video-brand-overlay-text font-bold text-sm tracking-wide drop-shadow-md">
          {PLATFORM_NAME}
        </span>
      </div>

      {/* ฉากคลิปจบ — แบรนด์เมื่อคลิปจบ พื้นหลังดำ */}
      {showEndCardOverlay && (
        <div
          className="video-brand-overlay-endcard absolute inset-0 z-30 flex flex-col items-center justify-center bg-black"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-4 p-6">
            <div className="p-4 rounded-2xl bg-black border border-white/20">
              <img
                src={LOGO_URL}
                alt={PLATFORM_NAME}
                className="w-16 h-16 object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
            <span className="video-brand-overlay-text text-2xl  font-bold tracking-widest drop-shadow-lg">
              {PLATFORM_NAME}
            </span>
            <p className="video-brand-overlay-text text-sm">
              แพลตฟอร์มบริการมืออาชีพ
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
