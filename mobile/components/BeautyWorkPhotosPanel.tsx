import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, Upload, X, Send, ImageIcon } from "lucide-react";
import { api } from "../services/api";

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export interface BeautyWorkPhotosPanelProps {
  bookingId: string;
  phase: "before" | "after";
  minPhotos?: number;
  /** แสดงอย่างเดียว (ฝั่งลูกค้าดูผลงาน) */
  readOnly?: boolean;
  onSubmitted?: () => void;
  onError?: (msg: string) => void;
}

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post<{ success?: boolean; url: string }>(
    "/upload/portfolio",
    formData,
    { headers: { "Content-Type": "multipart/form-data" }, timeout: 30000 },
  );
  if (!data?.url) throw new Error("อัปโหลดสำเร็จแต่ไม่ได้รับ URL");
  return data.url;
}

export const BeautyWorkPhotosPanel: React.FC<BeautyWorkPhotosPanelProps> = ({
  bookingId,
  phase,
  minPhotos = 4,
  readOnly = false,
  onSubmitted,
  onError,
}) => {
  const [urls, setUrls] = useState<string[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadExisting = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get<{
        photos?: { phase: string; photo_urls: string[] }[];
      }>(`/bookings/${bookingId}/beauty-detail`);
      const row = (data?.photos || []).find((p) => p.phase === phase);
      const existing = Array.isArray(row?.photo_urls) ? row.photo_urls : [];
      setUrls(existing.filter(Boolean));
    } catch {
      setUrls([]);
    } finally {
      setLoadingDetail(false);
    }
  }, [bookingId, phase]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || readOnly) return;
    setUploading(true);
    try {
      const added: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) continue;
        const url = await uploadImage(file);
        added.push(url);
      }
      if (added.length) setUrls((prev) => [...prev, ...added]);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error ||
        (e as Error)?.message ||
        "อัปโหลดไม่สำเร็จ";
      onError?.(msg);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeUrl = (idx: number) => {
    if (readOnly) return;
    setUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitPhase = async () => {
    if (urls.length < minPhotos) {
      onError?.(
        `ต้องมีรูปอย่างน้อย ${minPhotos} รูป (ตอนนี้ ${urls.length} รูป)`,
      );
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/bookings/${bookingId}/work-photos`, {
        phase,
        photo_urls: urls,
      });
      onSubmitted?.();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "บันทึกรูปไม่สำเร็จ";
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const submitCompletion = async () => {
    if (urls.length < minPhotos) {
      onError?.(`ต้องมีรูปหลังเสร็จอย่างน้อย ${minPhotos} รูป`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/bookings/${bookingId}/work-photos`, {
        phase: "after",
        photo_urls: urls,
      });
      await api.post(`/bookings/${bookingId}/submit-beauty-completion`);
      onSubmitted?.();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "ส่งงานไม่สำเร็จ";
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const phaseTitle =
    phase === "before" ? "รูปก่อนเริ่มงาน" : "รูปหลังเสร็จสิ้น";
  const phaseHint =
    phase === "before"
      ? "ถ่ายหลายมุมก่อนลงมือ — บันทึกแล้วระบบจะเริ่มงานให้อัตโนมัติ"
      : "ถ่ายผลงานหลังเสร็จ แล้วกดส่งงานให้ลูกค้ายอมรับ";

  if (loadingDetail) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
        <Loader2 size={16} className="animate-spin" />
        โหลดรูป…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Camera size={18} className="text-sky-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-800 text-sm">{phaseTitle}</p>
          <p className="text-xs text-slate-600 mt-0.5">{phaseHint}</p>
          <p className="text-xs text-sky-800 font-medium mt-1">
            {urls.length}/{minPhotos} รูป (ขั้นต่ำ {minPhotos})
          </p>
        </div>
      </div>

      {urls.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {urls.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-white"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removeUrl(idx)}
                  className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/55 text-white"
                  aria-label="ลบรูป"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-sky-300 bg-white text-sky-800 text-sm font-semibold hover:border-sky-500 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            {uploading ? "กำลังอัปโหลด…" : "เลือกรูปเพิ่ม (หลายไฟล์ได้)"}
          </button>

          {phase === "before" ? (
            <button
              type="button"
              disabled={submitting || urls.length < minPhotos}
              onClick={() => void submitPhase()}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <ImageIcon size={18} />
              )}
              บันทึกรูปก่อนงาน & เริ่มให้บริการ
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || urls.length < minPhotos}
              onClick={() => void submitCompletion()}
              className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
              ส่งงาน + รูปหลังเสร็จ
            </button>
          )}
        </>
      )}

      {readOnly && urls.length === 0 && (
        <p className="text-xs text-slate-500">ยังไม่มีรูปในขั้นตอนนี้</p>
      )}
    </div>
  );
};
