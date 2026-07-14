import React, { useState } from "react";
import { GraduationCap, Loader2, Send, X } from "lucide-react";
import { recommendCourseToTrainee } from "../../services/courseMarketplaceService";
import type { ConnectionItem } from "../../services/connectionService";

type Props = {
  courseId: string;
  courseTitle: string;
  trainees: ConnectionItem[];
  open: boolean;
  onClose: () => void;
  notify: (msg: string, type?: "success" | "error" | "info" | "warning") => void;
};

export default function CoachRecommendCourseModal({
  courseId,
  courseTitle,
  trainees,
  open,
  onClose,
  notify,
}: Props) {
  const [traineeId, setTraineeId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!traineeId || submitting) return;
    setSubmitting(true);
    try {
      await recommendCourseToTrainee(courseId, traineeId, note.trim());
      notify("แนะนำคอร์สให้ศิษย์แล้ว", "success");
      setTraineeId("");
      setNote("");
      onClose();
    } catch (e: any) {
      notify(e?.response?.data?.error || "แนะนำคอร์สไม่สำเร็จ", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md rounded-3xl bg-slate-950 border border-slate-700 p-5 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2">
              <GraduationCap size={20} className="text-indigo-300" />
              แนะนำคอร์สให้ศิษย์
            </h3>
            <p className="text-sm text-slate-400 mt-1 line-clamp-2">{courseTitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {trainees.length === 0 ? (
          <p className="text-sm text-slate-700 rounded-2xl border border-amber-200 bg-amber-50 p-3">
            ยังไม่มีศิษย์ที่เชื่อมต่อ active — เพิ่มได้ที่ ตั้งค่า → โค้ช & ศิษย์
          </p>
        ) : (
          <>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">เลือกศิษย์</span>
              <select
                value={traineeId}
                onChange={(e) => setTraineeId(e.target.value)}
                className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white px-3 py-2 text-sm"
              >
                <option value="">— เลือกศิษย์ —</option>
                {trainees.map((t) => (
                  <option key={t.id} value={t.trainee_id}>
                    {t.trainee_name || t.trainee_id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-400">ข้อความถึงศิษย์ (ไม่บังคับ)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="เช่น คอร์สนี้ช่วยเรื่อง..."
                className="w-full rounded-xl bg-slate-900 border border-slate-600 text-white px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={!traineeId || submitting}
              onClick={handleSubmit}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-50"
            >
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              ส่งคำแนะนำ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
