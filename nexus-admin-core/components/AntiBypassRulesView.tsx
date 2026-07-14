import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Loader2,
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Activity,
  Pencil,
  X,
} from "lucide-react";
import type { AdminRole } from "../types";
import {
  getAntiBypassRules,
  createAntiBypassRule,
  patchAntiBypassRule,
  deleteAntiBypassRule,
  postAntiBypassEvaluateTest,
  getAntiBypassTelemetry,
  type AntiBypassRuleRow,
} from "../services/adminApi";
import { useToast } from "../context/ToastContext";

function canWriteRules(role: string | undefined): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN";
}

function canUseRegex(role: string | undefined): boolean {
  return (role || "").toUpperCase() === "SUPER_ADMIN";
}

function roleLabel(role: AdminRole | string | undefined): string {
  return (role || "").toUpperCase();
}

interface Props {
  currentUserRole: AdminRole | string;
}

/** PR-4 — CRUD anti_bypass_rules + evaluate-test + telemetry (backend PR-1 API). */
export const AntiBypassRulesView: React.FC<Props> = ({ currentUserRole }) => {
  const { error: notifyError, success: notifySuccess } = useToast();
  const writeOk = useMemo(
    () => canWriteRules(currentUserRole),
    [currentUserRole],
  );
  const regexOk = useMemo(
    () => canUseRegex(currentUserRole),
    [currentUserRole],
  );

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState<AntiBypassRuleRow[]>([]);
  const [testText, setTestText] = useState("");
  const [testScope, setTestScope] = useState<"text" | "image_ocr">("text");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [testBusy, setTestBusy] = useState(false);
  const [telemetry, setTelemetry] = useState<{
    enabled: boolean;
    counts?: Record<string, number>;
    hint?: string;
  } | null>(null);

  const [newKind, setNewKind] = useState<"keyword" | "regex">("keyword");
  const [newScope, setNewScope] = useState<"text" | "image_ocr">("text");
  const [newPattern, setNewPattern] = useState("");
  const [newSeverity, setNewSeverity] = useState<"block" | "warn">("block");
  const [createBusy, setCreateBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPattern, setEditPattern] = useState("");
  const [editSeverity, setEditSeverity] = useState<"block" | "warn">("block");
  const [editScope, setEditScope] = useState<"text" | "image_ocr">("text");
  const [editKind, setEditKind] = useState<"keyword" | "regex">("keyword");
  const [editBusy, setEditBusy] = useState(false);

  const loadAttemptsRef = useRef(0);
  const load = useCallback(async () => {
    loadAttemptsRef.current += 1;
    const n = loadAttemptsRef.current;
    // #region agent log
    fetch("http://127.0.0.1:7638/ingest/0fd4d8e7-61a2-4558-83aa-540c669e45fd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "caa88d",
      },
      body: JSON.stringify({
        sessionId: "caa88d",
        hypothesisId: "H1",
        location: "AntiBypassRulesView.tsx:load",
        message: "load invoked",
        data: { invocation: n },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setLoading(true);
    try {
      const { rules: rows } = await getAntiBypassRules();
      setRules(rows || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "โหลดกฎไม่สำเร็จ";
      notifyError(msg);
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    load();
  }, [load]);

  const runTest = async () => {
    setTestBusy(true);
    try {
      const r = await postAntiBypassEvaluateTest({
        text: testText,
        scope: testScope,
      });
      setTestResult(r as Record<string, unknown>);
      notifySuccess(
        "รันทดสอบแล้ว (ใช้ค่า ANTI_BYPASS_TEXT_FILTER บนเซิร์ฟเวอร์จริง)",
      );
    } catch (e: unknown) {
      setTestResult(null);
      notifyError(e instanceof Error ? e.message : "ทดสอบล้มเหลว");
    } finally {
      setTestBusy(false);
    }
  };

  const loadTelemetry = async () => {
    try {
      const t = await getAntiBypassTelemetry();
      setTelemetry(t);
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "โหลด telemetry ไม่สำเร็จ");
      setTelemetry(null);
    }
  };

  const handleCreate = async () => {
    if (!newPattern.trim()) {
      notifyError("กรุณาใส่ pattern");
      return;
    }
    if (newKind === "regex" && !regexOk) {
      notifyError("Regex ใช้ได้เฉพาะ SUPER_ADMIN");
      return;
    }
    setCreateBusy(true);
    try {
      await createAntiBypassRule({
        kind: newKind,
        scope: newScope,
        pattern: newPattern.trim(),
        severity: newSeverity,
        enabled: true,
      });
      setNewPattern("");
      notifySuccess("สร้างกฎแล้ว");
      await load();
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
    } finally {
      setCreateBusy(false);
    }
  };

  const toggleEnabled = async (row: AntiBypassRuleRow) => {
    if (!writeOk) return;
    try {
      await patchAntiBypassRule(row.id, { enabled: !row.enabled });
      notifySuccess(row.enabled ? "ปิดการใช้งานแล้ว" : "เปิดการใช้งานแล้ว");
      await load();
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "อัปเดตไม่สำเร็จ");
    }
  };

  const removeRule = async (id: string) => {
    if (!writeOk) return;
    if (!confirm(`ลบกฎ ${id.slice(0, 8)}… ?`)) return;
    try {
      await deleteAntiBypassRule(id);
      notifySuccess("ลบแล้ว");
      if (editingId === id) {
        setEditingId(null);
      }
      await load();
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  };

  const beginEdit = (row: AntiBypassRuleRow) => {
    if (row.kind === "regex" && !regexOk) {
      notifyError("แก้กฎ regex ได้เฉพาะ SUPER_ADMIN");
      return;
    }
    setEditingId(row.id);
    setEditPattern(String(row.pattern || ""));
    setEditSeverity(
      (row.severity === "warn" ? "warn" : "block") as "block" | "warn",
    );
    setEditScope(row.scope === "image_ocr" ? "image_ocr" : "text");
    setEditKind(row.kind === "regex" ? "regex" : "keyword");
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (!editingId || !writeOk) return;
    if (editKind === "regex" && !regexOk) {
      notifyError("Regex ใช้ได้เฉพาะ SUPER_ADMIN");
      return;
    }
    setEditBusy(true);
    try {
      await patchAntiBypassRule(editingId, {
        pattern: editPattern.trim(),
        severity: editSeverity,
        scope: editScope,
        kind: editKind,
      });
      notifySuccess("บันทึกแล้ว");
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Anti-Bypass Rules
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            กฎคำสำคัญ / regex สำหรับแชท (text) และ OCR รูป (image_ocr) —
            อ่านได้หลาย role; แก้ไขได้เฉพาะ ADMIN / SUPER_ADMIN; regex เฉพาะ
            SUPER_ADMIN
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Role ปัจจุบัน:{" "}
            <span className="font-mono">{roleLabel(currentUserRole)}</span>
            {!writeOk ? " (ดูอย่างเดียว)" : null}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw size={16} /> รีโหลด
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 text-slate-600 py-16 justify-center">
          <Loader2 className="animate-spin" size={24} aria-hidden />{" "}
          กำลังโหลดกฎ…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Pattern</th>
                <th className="px-4 py-3">Kind</th>
                <th className="px-4 py-3">Scope</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Enabled</th>
                <th className="px-4 py-3 w-48">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rules.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    ไม่มีกฎ (หรือ migration 203 ยังไม่รัน)
                  </td>
                </tr>
              ) : (
                rules.map((r) => {
                  const rowIsRegex = r.kind === "regex";
                  const canMutateRowContent =
                    writeOk && (!rowIsRegex || regexOk);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono text-xs break-all max-w-md">
                        {r.pattern}
                      </td>
                      <td className="px-4 py-3">{r.kind}</td>
                      <td className="px-4 py-3">{r.scope}</td>
                      <td className="px-4 py-3">{r.severity}</td>
                      <td className="px-4 py-3">{r.enabled ? "yes" : "no"}</td>
                      <td className="px-4 py-3 flex flex-wrap gap-2">
                        {writeOk ? (
                          <>
                            {canMutateRowContent ? (
                              <button
                                type="button"
                                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                                onClick={() => toggleEnabled(r)}
                              >
                                {r.enabled ? "Disable" : "Enable"}
                              </button>
                            ) : null}
                            {canMutateRowContent ? (
                              <button
                                type="button"
                                className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-800 hover:bg-indigo-100 inline-flex items-center gap-1"
                                onClick={() => beginEdit(r)}
                              >
                                <Pencil size={12} aria-hidden /> Edit
                              </button>
                            ) : rowIsRegex ? (
                              <span className="text-xs text-amber-700">
                                regex → SUPER_ADMIN
                              </span>
                            ) : null}
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 inline-flex items-center gap-1"
                              onClick={() => removeRule(r.id)}
                            >
                              <Trash2 size={12} aria-hidden /> Del
                            </button>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {editingId && writeOk ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
              <Pencil size={18} /> แก้ไขกฎ
            </h2>
            <button
              type="button"
              onClick={cancelEdit}
              className="text-slate-500 hover:text-slate-800 p-1"
              aria-label="ปิด"
            >
              <X size={20} />
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-slate-600">
              Kind
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={editKind}
                onChange={(e) =>
                  setEditKind(e.target.value === "regex" ? "regex" : "keyword")
                }
              >
                <option value="keyword">keyword</option>
                {regexOk ? <option value="regex">regex</option> : null}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Scope
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={editScope}
                onChange={(e) =>
                  setEditScope(
                    e.target.value === "image_ocr" ? "image_ocr" : "text",
                  )
                }
              >
                <option value="text">text</option>
                <option value="image_ocr">image_ocr</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Pattern
              <textarea
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono bg-white min-h-[72px]"
                value={editPattern}
                onChange={(e) => setEditPattern(e.target.value)}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Severity
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={editSeverity}
                onChange={(e) =>
                  setEditSeverity(e.target.value === "warn" ? "warn" : "block")
                }
              >
                <option value="block">block</option>
                <option value="warn">warn</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={editBusy}
              onClick={saveEdit}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {editBusy ? <Loader2 className="animate-spin" size={16} /> : null}
              บันทึก
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm hover:bg-white"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      ) : null}

      {writeOk ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Plus size={18} /> เพิ่มกฎ
          </h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="block text-xs font-medium text-slate-600">
              Kind
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={newKind}
                onChange={(e) =>
                  setNewKind(e.target.value === "regex" ? "regex" : "keyword")
                }
              >
                <option value="keyword">keyword</option>
                {regexOk ? (
                  <option value="regex">regex (SUPER_ADMIN)</option>
                ) : null}
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Scope
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={newScope}
                onChange={(e) =>
                  setNewScope(
                    e.target.value === "image_ocr" ? "image_ocr" : "text",
                  )
                }
              >
                <option value="text">text (แชท)</option>
                <option value="image_ocr">image_ocr (OCR รูปแชท)</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Severity
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={newSeverity}
                onChange={(e) =>
                  setNewSeverity(e.target.value === "warn" ? "warn" : "block")
                }
              >
                <option value="block">block</option>
                <option value="warn">warn</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
              Pattern
              <textarea
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono min-h-[80px]"
                placeholder="เช่น line หรือ regex (เฉพาะ SUPER_ADMIN)"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={createBusy}
            onClick={handleCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {createBusy ? <Loader2 className="animate-spin" size={16} /> : null}
            สร้างกฎ
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
          <Play size={18} /> Evaluate tester
        </h2>
        <p className="text-xs text-slate-500">
          ใช้กฎที่ enabled บน DB + โหมด filter จริงจาก env{" "}
          <code className="bg-slate-100 px-1 rounded">
            ANTI_BYPASS_TEXT_FILTER
          </code>{" "}
          — ไม่บันทึกข้อความดิบลง telemetry ยกเว้นตั้ง{" "}
          <code className="bg-slate-100 px-1 rounded">
            ANTI_BYPASS_TELEMETRY=on
          </code>
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="block text-xs font-medium text-slate-600">
            Scope
            <select
              className="mt-1 block border rounded-lg px-3 py-2 text-sm min-w-[9rem]"
              value={testScope}
              onChange={(e) =>
                setTestScope(
                  e.target.value === "image_ocr" ? "image_ocr" : "text",
                )
              }
            >
              <option value="text">text</option>
              <option value="image_ocr">image_ocr</option>
            </select>
          </label>
          <div className="flex-1 min-w-[240px]">
            <label className="block text-xs font-medium text-slate-600">
              ข้อความทดสอบ
            </label>
            <textarea
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono min-h-[96px]"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="พิมพ์ข้อความจำลอง (จะเห็นเฉพาะ masked snippets จาก API)"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={testBusy}
          onClick={runTest}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {testBusy ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Play size={16} />
          )}
          รันทดสอบ
        </button>
        {testResult ? (
          <pre className="text-xs bg-slate-900 text-emerald-100 p-4 rounded-lg overflow-x-auto max-h-80">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2">
            <Activity size={18} /> Telemetry snapshot
          </h2>
          <button
            type="button"
            onClick={loadTelemetry}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
          >
            โหลด
          </button>
        </div>
        {telemetry ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              enabled:{" "}
              <span className="font-mono">{String(telemetry.enabled)}</span>
            </p>
            {telemetry.hint ? (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {telemetry.hint}
              </p>
            ) : null}
            <pre className="text-xs bg-slate-50 border border-slate-100 p-4 rounded-lg overflow-x-auto max-h-64">
              {JSON.stringify(telemetry.counts || {}, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            กด &quot;โหลด&quot; เพื่อดูตัวนับ in-process (ไม่มี PII)
          </p>
        )}
      </div>
    </div>
  );
};
