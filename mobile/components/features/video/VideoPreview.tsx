/**
 * VideoPreview — ตัวเล่นวิดีโอขนาดเล็กให้ Talent ดูก่อนกดยืนยัน
 */
import React, { useRef, useEffect } from 'react';

interface VideoPreviewProps {
  file: File | null;
  videoUrl?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  file,
  videoUrl,
  onConfirm,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = videoUrl || (file ? URL.createObjectURL(file) : null);

  useEffect(() => {
    return () => {
      if (file && src && src.startsWith('blob:')) URL.revokeObjectURL(src);
    };
  }, [file, src]);

  if (!src) return null;

  return (
    <div className="rounded-xl overflow-hidden bg-black max-w-sm mx-auto">
      <video
        ref={videoRef}
        src={src}
        className="w-full aspect-[9/16] object-contain"
        controls
        playsInline
        muted={false}
      />
      <div className="flex gap-2 p-3 bg-gray-900">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg border border-gray-600 text-gray-300 hover:bg-gray-800"
        >
          ยกเลิก
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
        >
          ยืนยันอัปโหลด
        </button>
      </div>
    </div>
  );
};
