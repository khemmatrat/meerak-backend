import React from "react";
import { Users, GraduationCap } from "lucide-react";
import { ConnectionItem } from "./ConnectionItem";
import type { ConnectionItem as ConnectionItemType } from "../../services/connectionService";

interface ConnectionListProps {
  asCoach: ConnectionItemType[];
  asTrainee: ConnectionItemType[];
  onConfirm: (id: string, asTrainee: boolean) => void;
  confirmingId: string | null;
}

export const ConnectionList: React.FC<ConnectionListProps> = ({
  asCoach,
  asTrainee,
  onConfirm,
  confirmingId,
}) => {
  const EmptyState = ({ msg }: { msg: string }) => (
    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-100">
      <Users size={40} className="mx-auto mb-3 text-slate-300" />
      <p className="text-slate-500 font-medium">{msg}</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          <Users size={18} className="text-emerald-600" />
          ศิษย์ของฉัน (My Trainees)
        </h4>
        {asCoach.length === 0 ? (
          <EmptyState msg="ยังไม่มีความเชื่อมต่อ — เริ่มเพิ่มศิษย์คนแรกของคุณเลย!" />
        ) : (
          <ul className="space-y-3">
            {asCoach.map((c) => (
              <li key={c.id}>
                <ConnectionItem
                  item={c}
                  mode="coach"
                  onConfirm={onConfirm}
                  confirmingId={confirmingId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-3">
          <GraduationCap size={18} className="text-blue-600" />
          โค้ชของฉัน (My Coach)
        </h4>
        {asTrainee.length === 0 ? (
          <EmptyState msg="ยังไม่มีโค้ช — แชร์รหัสของคุณให้โค้ชเพื่อเพิ่มคุณเป็นศิษย์" />
        ) : (
          <ul className="space-y-3">
            {asTrainee.map((c) => (
              <li key={c.id}>
                <ConnectionItem
                  item={c}
                  mode="trainee"
                  onConfirm={onConfirm}
                  confirmingId={confirmingId}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
