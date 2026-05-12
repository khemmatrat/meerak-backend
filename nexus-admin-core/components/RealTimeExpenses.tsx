/**
 * Real-Time Expenses — ติดตามค่าใช้จ่ายแบบเรียลไทม์
 * โดเมน & โฮสติ้ง, API Gateway, ค่าจ้างพัฒนาระบบ, การตลาด, incentives
 * Fixed/Variable • งบประมาณและแจ้งเตือนเมื่อเกิน • Export • กราฟสัดส่วน
 * เชื่อม Backend: GET/POST/PATCH/DELETE /api/admin/financial/expenses
 */
import React, { useState } from "react";
import {
  PieChart as PieChartIcon,
  AlertTriangle,
  RefreshCw,
  Download,
  Loader2,
  DollarSign,
  Plus,
  Pencil,
  Trash2,
  Globe,
} from "lucide-react";
import { useRealTimeExpenses } from "../hooks/useFinancialData";
import {
  createExpense,
  updateExpense,
  deleteExpense,
  type CreateExpenseInput,
} from "../services/financialService";

export type CostType = "fixed" | "variable";

export interface ExpenseItem {
  id: string;
  category: string;
  label: string;
  amount: number;
  budget?: number;
  cost_type: CostType;
  currency: string;
  updated_at: string;
}

const CATEGORY_OPTIONS = [
  { value: "domain_hosting", label: "โดเมน & โฮสติ้ง" },
  { value: "api_gateway", label: "API Gateway" },
  { value: "development", label: "ค่าจ้างพัฒนาระบบ" },
  { value: "marketing", label: "การตลาด" },
  { value: "incentives", label: "ค่าสนับสนุนโค้ด (incentives)" },
  { value: "other", label: "อื่นๆ" },
];

const REGION_OPTIONS = [
  { value: "TH", label: "🇹🇭 Thailand" },
  { value: "ID", label: "🇮🇩 Indonesia" },
  { value: "VN", label: "🇻🇳 Vietnam" },
  { value: "MY", label: "🇲🇾 Malaysia" },
  { value: "LA", label: "🇱🇦 Laos" },
];

export const RealTimeExpenses: React.FC = () => {
  const [regionFilter, setRegionFilter] = useState<string>("");
  const { expenses, loading, error, refetch } = useRealTimeExpenses(60_000, regionFilter || undefined);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<CreateExpenseInput>>({
    category: "other",
    label: "",
    amount: 0,
    budget: undefined,
    cost_type: "variable",
    currency: "THB",
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = expenses.reduce((s, e) => s + (e.budget || 0), 0);
  const fixedTotal = expenses.filter((e) => e.cost_type === "fixed").reduce((s, e) => s + e.amount, 0);
  const variableTotal = expenses.filter((e) => e.cost_type === "variable").reduce((s, e) => s + e.amount, 0);
  const overBudget = expenses.filter((e) => e.budget != null && e.amount > e.budget);

  const handleAdd = async () => {
    if (!formData.label?.trim() || formData.amount == null) {
      setSubmitError("กรุณากรอกชื่อรายการและจำนวนเงิน");
      return;
    }
    setSubmitError(null);
    try {
      await createExpense({
        category: formData.category || "other",
        label: formData.label.trim(),
        amount: Number(formData.amount) || 0,
        budget: formData.budget != null && formData.budget !== "" ? Number(formData.budget) : undefined,
        cost_type: formData.cost_type || "variable",
        currency: formData.currency || "THB",
        region: formData.region || "TH",
      });
      setFormData({ category: "other", label: "", amount: 0, budget: undefined, cost_type: "variable", currency: "THB", region: "TH" });
      setShowAddForm(false);
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถเพิ่มรายการได้");
    }
  };

  const handleUpdate = async (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp) return;
    setSubmitError(null);
    try {
      await updateExpense(id, {
        category: formData.category,
        label: formData.label,
        amount: formData.amount,
        budget: formData.budget,
        cost_type: formData.cost_type,
        currency: formData.currency,
        region: formData.region,
      });
      setEditingId(null);
      setFormData({ category: "other", label: "", amount: 0, budget: undefined, cost_type: "variable", currency: "THB", region: "TH" });
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถแก้ไขได้");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("ต้องการลบรายการนี้?")) return;
    setSubmitError(null);
    try {
      await deleteExpense(id);
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถลบได้");
    }
  };

  const startEdit = (e: ExpenseItem) => {
    setEditingId(e.id);
    setFormData({
      category: e.category,
      label: e.label,
      amount: e.amount,
      budget: e.budget,
      cost_type: e.cost_type,
      currency: e.currency,
      region: (e as any).region || "TH",
    });
  };

  const handleExport = () => {
    const header = "Category,Label,Amount,Budget,Cost Type,Updated\n";
    const rows = expenses
      .map(
        (e) =>
          `${e.category},${e.label},${e.amount},${e.budget ?? ""},${e.cost_type},${e.updated_at}`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `expenses_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxAmount = expenses.length > 0 ? Math.max(...expenses.map((e) => e.amount), 1) : 1;
  const totalForProportion = totalExpenses > 0 ? totalExpenses : 1;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-700 to-orange-700 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <PieChartIcon size={24} /> ค่าใช้จ่ายแบบเรียลไทม์
        </h2>
        <p className="text-amber-100 text-sm">
          โดเมน & โฮสติ้ง • API Gateway • ค่าจ้างพัฒนาระบบ • การตลาด • Incentives • Fixed/Variable •
          งบประมาณและแจ้งเตือน • Export • เพิ่ม/แก้ไข/ลบรายการ
        </p>
        <p className="text-xs text-amber-200 mt-2">
          อัพเดตทุก 1 นาที
        </p>
      </div>

      {overBudget.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="font-medium text-rose-800">แจ้งเตือน: เกินงบประมาณ</p>
            <ul className="text-sm text-rose-700 mt-1">
              {overBudget.map((e) => (
                <li key={e.id}>
                  {e.label}: ฿{e.amount.toLocaleString()} (งบ ฿{(e.budget || 0).toLocaleString()})
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-slate-600" size={20} />
            <span className="text-sm font-medium text-slate-500">ค่าใช้จ่ายรวม</span>
          </div>
          <p className="text-2xl font-bold text-slate-800">฿{totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-500">งบประมาณรวม</span>
          </div>
          <p className="text-2xl font-bold text-slate-700">฿{totalBudget.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-500">Fixed Costs</span>
          </div>
          <p className="text-2xl font-bold text-blue-700">฿{fixedTotal.toLocaleString()}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-500">Variable Costs</span>
          </div>
          <p className="text-2xl font-bold text-amber-700">฿{variableTotal.toLocaleString()}</p>
        </div>
      </div>

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {submitError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2">
          <Globe size={16} className="text-slate-500" />
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">ทุก Region</option>
            {REGION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        {error && <span className="text-sm text-rose-600">{error}</span>}
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
        >
          <Plus size={16} /> เพิ่มรายการค่าใช้จ่าย
        </button>
        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
        >
          <Download size={16} /> Export รายงาน
        </button>
      </div>

      {editingId && (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <h4 className="font-bold text-slate-800">แก้ไขรายการค่าใช้จ่าย</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">หมวด</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">ชื่อรายการ</label>
              <input
                type="text"
                value={formData.label || ""}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">จำนวน (THB)</label>
              <input
                type="number"
                value={formData.amount ?? ""}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">งบประมาณ (THB)</label>
              <input
                type="number"
                value={formData.budget ?? ""}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                placeholder="—"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">ประเภท</label>
              <select
                value={formData.cost_type}
                onChange={(e) => setFormData({ ...formData, cost_type: e.target.value as "fixed" | "variable" })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Region</label>
              <select
                value={formData.region || "TH"}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {REGION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => editingId && handleUpdate(editingId)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
              บันทึก
            </button>
            <button onClick={() => { setEditingId(null); setSubmitError(null); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
          <h4 className="font-bold text-slate-800">เพิ่มรายการค่าใช้จ่าย</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">หมวด</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">ชื่อรายการ</label>
              <input
                type="text"
                value={formData.label || ""}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="เช่น โฮสติ้งรายเดือน"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">จำนวน (THB)</label>
              <input
                type="number"
                value={formData.amount ?? ""}
                onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">งบประมาณ (THB) - ไม่บังคับ</label>
              <input
                type="number"
                value={formData.budget ?? ""}
                onChange={(e) => setFormData({ ...formData, budget: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
                placeholder="—"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">ประเภท</label>
              <select
                value={formData.cost_type}
                onChange={(e) => setFormData({ ...formData, cost_type: e.target.value as "fixed" | "variable" })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium">
              บันทึก
            </button>
            <button onClick={() => { setShowAddForm(false); setSubmitError(null); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800">สัดส่วนค่าใช้จ่ายตามหมวด</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {expenses.map((e) => (
                <div key={e.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">{e.label}</span>
                    <span className="text-slate-600">
                      ฿{e.amount.toLocaleString()}
                      {e.budget != null && (
                        <span className="text-slate-400"> / ฿{e.budget.toLocaleString()}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        e.budget != null && e.amount > e.budget ? "bg-rose-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.min(100, (e.amount / totalForProportion) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800">รายการตามประเภท (Fixed / Variable)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">หมวด</th>
                  <th className="px-4 py-3 text-right font-semibold">จำนวน (THB)</th>
                  <th className="px-4 py-3 text-right font-semibold">งบประมาณ</th>
                  <th className="px-4 py-3 text-left font-semibold">ประเภท</th>
                  <th className="px-4 py-3 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{e.label}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-600">{(e as any).region || "TH"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">฿{e.amount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {e.budget != null ? `฿${e.budget.toLocaleString()}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          e.cost_type === "fixed" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {e.cost_type === "fixed" ? "Fixed" : "Variable"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(e)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600"
                        title="แก้ไข"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-600 ml-1"
                        title="ลบ"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
