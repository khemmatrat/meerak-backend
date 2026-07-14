import React, { useEffect, useState } from "react";
import { X, Star, ShieldCheck, Briefcase } from "lucide-react";
import { api } from "../services/api";

export interface EmployerSummaryData {
  full_name: string | null;
  avatar_url: string | null;
  rating: number;
  total_reviews: number;
  verified: boolean;
  total_jobs_posted: number;
}

interface EmployerProfileSummaryProps {
  employerId: string;
  onClose: () => void;
}

export const EmployerProfileSummary: React.FC<EmployerProfileSummaryProps> = ({
  employerId,
  onClose,
}) => {
  const [data, setData] = useState<EmployerSummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<EmployerSummaryData>(`/users/${employerId}/employer-summary`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [employerId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-xl border border-gray-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-amber-50/50">
          <h3 className="font-bold text-gray-900">โปรไฟล์นายจ้าง</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-amber-500/20 flex items-center justify-center overflow-hidden shrink-0 border border-amber-200">
                  {data.avatar_url ? (
                    <img
                      src={data.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Briefcase size={28} className="text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {data.full_name || "นายจ้าง"}
                  </p>
                  {data.verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      <ShieldCheck size={12} />
                      ยืนยันตัวตนแล้ว
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <div className="flex items-center gap-1 text-amber-600 mb-0.5">
                    <Star size={16} />
                    <span className="text-sm font-medium">คะแนนความประพฤติ</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {data.rating > 0 ? data.rating.toFixed(1) : "-"}
                  </p>
                  <p className="text-xs text-gray-500">
                    {data.total_reviews} รีวิว
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <div className="flex items-center gap-1 text-emerald-600 mb-0.5">
                    <Briefcase size={16} />
                    <span className="text-sm font-medium">งานที่โพสต์</span>
                  </div>
                  <p className="text-xl font-bold text-gray-900">
                    {data.total_jobs_posted}
                  </p>
                  <p className="text-xs text-gray-500">งานทั้งหมด</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-6">
              โหลดข้อมูลไม่สำเร็จ
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
