/**
 * EmergencyReportModal.tsx
 * ─────────────────────────────────────────────────────────────────
 * Worker Emergency Reporting UI
 *
 * Features:
 *  • Dropdown เลือกประเภทเหตุฉุกเฉิน (อุบัติเหตุ, ป่วย, รถเสีย ฯลฯ)
 *  • อัปโหลดรูปหลักฐาน (camera / gallery) via Cloudinary
 *  • ช่องสรุปรายละเอียด
 *  • Success state "แจ้งเหตุเรียบร้อย"
 */

import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  X,
  Camera,
  Upload,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ImageIcon,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';

// ── Types ────────────────────────────────────────────────────────────────

export type IncidentType =
  | 'accident'
  | 'illness'
  | 'vehicle_issue'
  | 'family_emergency'
  | 'natural_disaster'
  | 'other';

const INCIDENT_OPTIONS: { value: IncidentType; label: string; emoji: string }[] = [
  { value: 'accident',         label: 'อุบัติเหตุ',              emoji: '🚑' },
  { value: 'illness',          label: 'เจ็บป่วยกะทันหัน',        emoji: '🤒' },
  { value: 'vehicle_issue',    label: 'รถเสีย / ปัญหาการเดินทาง', emoji: '🚗' },
  { value: 'family_emergency', label: 'เหตุฉุกเฉินครอบครัว',      emoji: '👨‍👩‍👧' },
  { value: 'natural_disaster', label: 'ภัยธรรมชาติ',              emoji: '🌊' },
  { value: 'other',            label: 'เหตุสุดวิสัยอื่นๆ',        emoji: '⚠️' },
];

interface EmergencyReportModalProps {
  jobId:    string;
  jobTitle: string;
  onClose:  () => void;
  /** callback เมื่อรายงานสำเร็จ — ให้ parent รีโหลด/เปลี่ยนหน้า */
  onSuccess: (incidentId: string, couponCode: string) => void;
}

// ── Upload helper (Cloudinary via backend proxy) ────────────────────────

async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/upload/image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.url as string;
}

// ── Component ────────────────────────────────────────────────────────────

export const EmergencyReportModal: React.FC<EmergencyReportModalProps> = ({
  jobId,
  jobTitle,
  onClose,
  onSuccess,
}) => {
  const [incidentType, setIncidentType] = useState<IncidentType | ''>('');
  const [description, setDescription] = useState('');
  const [previews, setPreviews]       = useState<{ file: File; url: string }[]>([]);
  const [uploading, setUploading]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [success, setSuccess]         = useState<{ incidentId: string; couponCode: string } | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Image handling ──────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews((prev) => [...prev, ...newPreviews].slice(0, 4));
    e.target.value = '';
  };

  const removeImage = (idx: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Submit ──────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!incidentType) {
      setError('กรุณาเลือกประเภทเหตุฉุกเฉิน');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      // Upload images (if any)
      let imageUrls: string[] = [];
      if (previews.length > 0) {
        setUploading(true);
        imageUrls = await Promise.all(previews.map((p) => uploadImage(p.file)));
        setUploading(false);
      }

      const res = await api.post('/incidents/report', {
        job_id:          jobId,
        type:            incidentType,
        description:     description.trim(),
        evidence_images: imageUrls,
      });

      setSuccess({
        incidentId: res.data.incident_id,
        couponCode: res.data.coupon_code,
      });
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  // ── Selected option label ───────────────────────────────────────

  const selectedOption = INCIDENT_OPTIONS.find((o) => o.value === incidentType);

  // ── Success screen ──────────────────────────────────────────────

  if (success) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={36} className="text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">แจ้งเหตุเรียบร้อย</h2>
          <p className="text-gray-500 text-sm mb-4">
            ทีมงานกำลังดำเนินการหาคนแทนให้คุณ
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs font-bold text-amber-700 mb-1">
              🎟️ คูปองขอโทษสำหรับลูกค้า (ส่งอัตโนมัติแล้ว)
            </p>
            <p className="text-lg font-mono font-bold text-amber-800 tracking-wider">
              {success.couponCode}
            </p>
            <p className="text-xs text-amber-600 mt-1">ส่วนลด 20% — ลูกค้าจะได้รับในระบบแจ้งเตือน</p>
          </div>

          <p className="text-xs text-gray-400 mb-6">
            หมายเลขอ้างอิง: {success.incidentId.slice(0, 8).toUpperCase()}
          </p>

          <button
            onClick={() => onSuccess(success.incidentId, success.couponCode)}
            className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            รับทราบ — กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-red-600 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={22} className="text-white" fill="currentColor" />
            <div>
              <h2 className="text-white font-bold text-lg">รายงานเหตุฉุกเฉิน</h2>
              <p className="text-red-200 text-xs truncate max-w-[200px]">{jobTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-red-200 hover:text-white p-1 rounded-lg hover:bg-red-700 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Warning banner */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
            <strong>⚠️ ใช้เฉพาะกรณีฉุกเฉินเท่านั้น</strong>
            <br />
            การรายงานจะหยุดงานของคุณทันที และแจ้งเตือนลูกค้าพร้อมส่งคูปองชดเชยอัตโนมัติ
          </div>

          {/* Incident type dropdown */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              ประเภทเหตุฉุกเฉิน <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDropdownOpen((p) => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition-colors ${
                  incidentType
                    ? 'border-red-400 bg-red-50 text-red-800 font-medium'
                    : 'border-gray-300 text-gray-500'
                }`}
              >
                <span>
                  {selectedOption
                    ? `${selectedOption.emoji} ${selectedOption.label}`
                    : 'เลือกประเภทเหตุ...'}
                </span>
                <ChevronDown size={16} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropdownOpen && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                  {INCIDENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setIncidentType(opt.value);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left hover:bg-red-50 transition-colors ${
                        incidentType === opt.value ? 'bg-red-50 font-semibold text-red-700' : 'text-gray-700'
                      }`}
                    >
                      <span className="text-xl">{opt.emoji}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              สรุปรายละเอียดสั้นๆ
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="อธิบายสถานการณ์โดยย่อ เช่น 'รถชนที่แยกลาดพร้าว กำลังรอรถพยาบาล'"
              maxLength={300}
              rows={3}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-red-400 focus:border-red-400 outline-none"
            />
            <p className="text-xs text-gray-400 text-right mt-1">{description.length}/300</p>
          </div>

          {/* Evidence images */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              รูปหลักฐาน (สูงสุด 4 รูป)
            </label>

            {/* Preview grid */}
            {previews.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {previews.map((p, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
                    <img src={p.url} alt={`evidence-${idx}`} className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload buttons */}
            {previews.length < 4 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.capture = 'environment';
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Camera size={16} /> ถ่ายรูป
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.accept = 'image/*';
                      fileInputRef.current.removeAttribute('capture');
                      fileInputRef.current.click();
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <ImageIcon size={16} /> คลังภาพ
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !incidentType}
            className="w-full py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2 text-base"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                {uploading ? 'กำลังอัปโหลดรูป...' : 'กำลังส่งรายงาน...'}
              </>
            ) : (
              <>
                <AlertTriangle size={18} fill="currentColor" />
                ส่งรายงานเหตุฉุกเฉิน
              </>
            )}
          </button>

          <p className="text-xs text-center text-gray-400">
            การรายงานจะถูกบันทึกและส่งถึงทีมงานทันที
          </p>
        </div>
      </div>
    </div>
  );
};

export default EmergencyReportModal;
