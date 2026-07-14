import React from "react";
import { X, Shield } from "lucide-react";

export const PERMISSION_OPTIONS = [
  { id: "manage_jobs", label: "Manage Jobs" },
  { id: "view_reports", label: "View Reports" },
  { id: "financial_access", label: "Financial Access" },
  { id: "user_management", label: "User Management" },
  { id: "support_tickets", label: "Support Tickets" },
  { id: "support_knowledge:approve", label: "Approve Support Knowledge Base" },
  { id: "system_logs", label: "System Logs" },
  { id: "api_gateway", label: "API Gateway" },
] as const;

export type PermissionId = (typeof PERMISSION_OPTIONS)[number]["id"];

/** Map legacy/label strings to permission ids */
const LABEL_TO_ID: Record<string, string> = {
  "Manage Jobs": "manage_jobs",
  "View Reports": "view_reports",
  Reports: "view_reports",
  "Financial Access": "financial_access",
  "Financial Audit": "financial_access",
  "User Management": "user_management",
  "Support Tickets": "support_tickets",
  "Approve Support Knowledge Base": "support_knowledge:approve",
  "System Logs": "system_logs",
  "API Gateway": "api_gateway",
  "Cluster Health": "system_logs",
  "App Config": "api_gateway",
};

function normalizeToIds(permissions: string[]): Set<string> {
  const ids = new Set<string>();
  const allIds = PERMISSION_OPTIONS.map((o) => o.id);
  for (const p of permissions || []) {
    const id = LABEL_TO_ID[p] ?? (allIds.includes(p) ? p : null);
    if (id) ids.add(id);
    if (p === "ALL ACCESS" || p === "all_access") {
      allIds.forEach((i) => ids.add(i));
    }
  }
  return ids;
}

interface PermissionModalProps {
  staffName: string;
  permissions: string[];
  onSave: (permissions: string[]) => void;
  onClose: () => void;
  saving?: boolean;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  staffName,
  permissions,
  onSave,
  onClose,
  saving = false,
}) => {
  const [selected, setSelected] = React.useState<Set<string>>(() =>
    normalizeToIds(permissions || []),
  );

  React.useEffect(() => {
    setSelected(normalizeToIds(permissions || []));
  }, [staffName, permissions]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = () => {
    onSave(Array.from(selected));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Shield size={18} className="text-indigo-600" />
            Manage Permissions — {staffName}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-3">
          {PERMISSION_OPTIONS.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.id)}
                onChange={() => toggle(opt.id)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-slate-700">
                {opt.label}
              </span>
            </label>
          ))}
        </div>
        <div className="p-4 border-t border-slate-100 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>
      </div>
    </div>
  );
};
