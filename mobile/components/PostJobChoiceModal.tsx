import React from "react";
import { useNavigate } from "react-router-dom";
import { X, Zap, Briefcase, BookOpen } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";

interface PostJobChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** สไตล์ปุ่มตาม theme (เช่น btn-gold-black, btn-create-job-platinum) */
  buttonClass?: string;
  /** เปิดคู่มือการโพสต์งานอีกครั้ง */
  onShowGuide?: () => void;
}

/**
 * เมื่อกดปุ่ม (+) ให้แสดง Option เลือก:
 * - Match → ไปหน้า create-job (เดิม)
 * - Advance → ไปหน้า create-job-advance (ใหม่)
 */
export const PostJobChoiceModal: React.FC<PostJobChoiceModalProps> = ({
  isOpen,
  onClose,
  buttonClass = "btn-gold-black",
  onShowGuide,
}) => {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleChoice = (path: string) => {
    onClose();
    navigate(path);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[10040] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* z สูงกว่า SafetyWidget (z-[9999]) — ไม่งั้นเห็นแต่ backdrop เบลอ ไม่เห็นการ์ดเลือก Match/Advance */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10041] w-full max-w-sm mx-4">
        <div className="luxury-card rounded-2xl p-6 border border-white/20 shadow-2xl">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-bold text-slate-100">เลือกประเภทการโพสต์งาน</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-700/50 hover:text-white transition-colors"
              aria-label="ปิด"
            >
              <X size={20} />
            </button>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleChoice("/create-job")}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border border-slate-600 hover:border-gold/30 transition-colors text-left ${buttonClass}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-700/80 flex items-center justify-center shrink-0">
                <Zap size={24} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-100">Match</p>
                <p className="text-sm text-slate-400">โพสต์งานแบบเดิม ระบบช่วย Match Talent ให้</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleChoice("/create-job-advance")}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-600 hover:border-amber-400/40 bg-amber-500/10 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
                <Briefcase size={24} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-100">Advance</p>
                <p className="text-sm text-slate-400">โพสต์แบบละเอียด มีขั้นตอน รายละเอียด–ขอบเขต–งบประมาณ</p>
              </div>
            </button>
          </div>
          {onShowGuide && (
            <div className="mt-4 pt-4 border-t border-slate-600/50">
              <button
                type="button"
                onClick={() => { onClose(); onShowGuide(); }}
                className="w-full flex items-center justify-center gap-2 py-2 text-sm text-slate-400 hover:text-amber-400 transition-colors"
              >
                <BookOpen size={16} />
                {t('post_guide.title')}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
