import React, { useCallback, useEffect, useState } from "react";
import { UserPlus, RefreshCw, Loader2, GraduationCap } from "lucide-react";
import {
  getConnectionKey,
  addTrainee,
  confirmConnection,
  listConnections,
} from "../../services/connectionService";
import { getCoachTraineeCourseProgress, type CoachTraineeCourseProgress } from "../../services/courseMarketplaceService";
import { ConnectionKeyCard } from "./ConnectionKeyCard";
import { AddTraineeModal } from "./AddTraineeModal";
import { ConnectionList } from "./ConnectionList";

interface CoachConnectionSectionProps {
  notify: (msg: string, type: "success" | "error" | "info") => void;
}

export const CoachConnectionSection: React.FC<CoachConnectionSectionProps> = ({
  notify,
}) => {
  const [keyData, setKeyData] = useState<{ connection_key: string; uid_key: string } | null>(null);
  const [connections, setConnections] = useState<{
    as_coach: any[];
    as_trainee: any[];
  }>({ as_coach: [], as_trainee: [] });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [traineeProgress, setTraineeProgress] = useState<CoachTraineeCourseProgress[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [keyRes, listRes, progressRes] = await Promise.all([
        getConnectionKey(),
        listConnections(),
        getCoachTraineeCourseProgress().catch(() => []),
      ]);
      setKeyData(keyRes);
      setConnections(listRes);
      setTraineeProgress(progressRes);
    } catch (e) {
      notify("โหลดข้อมูลล้มเหลว", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCopyKey = () => {
    notify("คัดลอกรหัสแล้ว — ส่งให้โค้ชทาง Line หรือ Messenger ได้เลย", "success");
  };

  const handleAddTrainee = async (traineeKey: string) => {
    const res = await addTrainee(traineeKey);
    notify(
      res.needs_trainee_confirm
        ? "เพิ่มแล้ว — รอศิษย์กดยืนยัน"
        : "เชื่อมต่อสำเร็จ",
      "success"
    );
    load();
  };

  const handleConfirm = async (connectionId: string, asTrainee: boolean) => {
    setConfirmingId(connectionId);
    try {
      await confirmConnection(connectionId, asTrainee);
      notify("ยืนยันการเชื่อมต่อแล้ว", "success");
      load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ", "error");
    } finally {
      setConfirmingId(null);
    }
  };

  if (loading && !keyData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Loader2 size={36} className="animate-spin mb-3" />
        <span>กำลังโหลด...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ConnectionKeyCard
        connectionKey={keyData?.connection_key || keyData?.uid_key || ""}
        onCopy={handleCopyKey}
      />

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-600 flex items-center gap-2">
          <GraduationCap size={16} className="text-emerald-600" />
          คุณจะได้รับ 3% จากรายได้ของศิษย์ เป็นเวลา 3 เดือน (สูงสุด 15 งาน)
          เพื่อเป็นค่าตอบแทนการเป็นผู้ดูแล
        </p>
      </div>

      <div className="flex items-center justify-between">
        <h4 className="font-bold text-slate-800">รายการ Connection</h4>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm"
          >
            <UserPlus size={18} />
            เพิ่มศิษย์
          </button>
        </div>
      </div>

      <ConnectionList
        asCoach={connections.as_coach}
        asTrainee={connections.as_trainee}
        onConfirm={handleConfirm}
        confirmingId={confirmingId}
      />

      {traineeProgress.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h4 className="font-bold text-slate-800 inline-flex items-center gap-2">
            <GraduationCap size={18} className="text-emerald-600" /> ความคืบหน้าคอร์สของศิษย์
          </h4>
          {traineeProgress.map((trainee) => (
            <div key={trainee.traineeId} className="rounded-lg border border-slate-100 p-3">
              <p className="font-semibold text-slate-900">{trainee.traineeName}</p>
              {trainee.courses.length === 0 ? (
                <p className="text-sm text-slate-500 mt-1">ยังไม่ได้ลงทะเบียนคอร์ส marketplace</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {trainee.courses.map((c) => (
                    <li key={`${trainee.traineeId}-${c.courseId}`} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="text-slate-700 line-clamp-1">{c.courseTitle}</span>
                        <span className="font-bold text-emerald-700 shrink-0">{Math.round(c.progressPct)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, c.progressPct)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      ) : null}

      <AddTraineeModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddTrainee}
        myKey={keyData?.connection_key}
      />
    </div>
  );
};
