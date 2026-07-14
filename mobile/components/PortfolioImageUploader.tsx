/**
 * PortfolioImageUploader — อัปโหลดรูปผลงาน (Portfolio/Expert)
 * ใช้ระบบเดียวกับ Video — POST /api/upload/portfolio
 *
 * UI ครอบแบบการ์ดเหมือนการ์ดเลือกสายงานหลัก (ใช้เฉพาะในแท็บ Portfolio)
 */
import React, { useState, useRef } from "react";
import { Upload, Loader2 } from "lucide-react";
import { api } from "../services/api";

interface PortfolioImageUploaderProps {
  onSuccess?: (url: string) => void;
  onError?: (msg: string) => void;
}

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const PortfolioImageUploader: React.FC<PortfolioImageUploaderProps> = ({
  onSuccess,
  onError,
}) => {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError?.("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, WebP, GIF)");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const { data } = await api.post<{ success: boolean; url: string }>(
        "/upload/portfolio",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 30000,
        },
      );
      if (data?.url) {
        onSuccess?.(data.url);
      } else {
        onError?.("อัปโหลดสำเร็จแต่ไม่ได้รับ URL");
      }
    } catch (err: any) {
      onError?.(
        err?.response?.data?.error || err?.message || "อัปโหลดไม่สำเร็จ",
      );
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm ring-1 ring-slate-100"
      aria-busy={uploading}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleUpload}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-200 bg-gradient-to-br from-emerald-50/90 to-white px-4 py-6 text-emerald-900 shadow-inner transition hover:border-emerald-400 hover:from-emerald-50 hover:shadow-md disabled:opacity-55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/55"
      >
        {uploading ? (
          <>
            <Loader2 size={28} className="animate-spin text-emerald-700" />
            <span className="text-[15px] font-semibold">กำลังอัปโหลด...</span>
          </>
        ) : (
          <>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 ring-1 ring-emerald-600/20">
              <Upload size={28} strokeWidth={2} aria-hidden />
            </span>
            <span className="text-[15px] font-bold leading-snug">
              เลือกรูปผลงานเพื่ออัปโหลด
            </span>
            <span className="max-w-[14rem] text-center text-[13px] leading-relaxed text-slate-600">
              เลือกรูปทีละหนึ่งไฟล์จากโทรศัพท์หรือคอมพิวเตอร์
            </span>
          </>
        )}
      </button>
      <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed mt-3 text-center px-1">
        รูปแบบ JPG, PNG, WebP, GIF — เมื่ออัปโหลดแล้ว URL ถูกเพิ่มใน Portfolio
        อัตโนมัติ
      </p>
    </div>
  );
};
