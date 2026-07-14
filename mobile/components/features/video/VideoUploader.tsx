/**
 * VideoUploader — ปุ่มเลือกไฟล์ + แถบความคืบหน้า
 */
import React, { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle } from 'lucide-react';
import { videoService } from '../../../services/videoService';

interface VideoUploaderProps {
  onSuccess?: (video: any) => void;
  onError?: (err: string) => void;
  onPendingReview?: (message: string) => void;
  maxSizeMB?: number;
}

const ACCEPT = 'video/mp4,video/webm,video/quicktime';

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onSuccess,
  onError,
  onPendingReview,
  maxSizeMB = 100,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressInterval = useRef<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > maxSizeMB * 1024 * 1024) {
      onError?.(`ไฟล์ใหญ่เกิน ${maxSizeMB}MB`);
      return;
    }

    setUploading(true);
    setProgress(0);
    setSuccess(false);

    progressInterval.current = window.setInterval(() => {
      setProgress((p) => Math.min(p + 5, 95));
    }, 300);

    try {
      const result = await videoService.upload(file);
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      setProgress(100);
      setSuccess(true);
      onSuccess?.(result.video);
      if (result.pendingReview && result.message) {
        onPendingReview?.(result.message);
      }
    } catch (err: any) {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      const msg = err?.response?.data?.error || err?.message || 'อัปโหลดไม่สำเร็จ';
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileChange}
        className="hidden"
        disabled={uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <>
            <Loader2 size={20} className="animate-spin" />
            กำลังอัปโหลด...
          </>
        ) : success ? (
          <>
            <CheckCircle size={20} />
            อัปโหลดสำเร็จ
          </>
        ) : (
          <>
            <Upload size={20} />
            เลือกวิดีโอ (MP4, WebM, MOV สูงสุด {maxSizeMB}MB)
          </>
        )}
      </button>
      {uploading && (
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
