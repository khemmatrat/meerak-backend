/**
 * Real-Time Expenses — ติดตามค่าใช้จ่ายแบบเรียลไทม์
 * โดเมน & โฮสติ้ง, API Gateway, ค่าจ้างพัฒนาระบบ, การตลาด, incentives
 * Fixed/Variable • งบประมาณและแจ้งเตือนเมื่อเกิน • Export • กราฟสัดส่วน
 */
import React, { useState, useEffect } from "react";
import {
  PieChart as PieChartIcon,
  AlertTriangle,
  RefreshCw,
  Download,
  Loader2,
  DollarSign,
} from "lucide-react";

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

const MOCK_EXPENSES: ExpenseItem[] = [
  { id: "1", category: "domain_hosting", label: "โดเมน & โฮสติ้ง", amount: 2500, budget: 3000, cost_type: "fixed", currency: "THB", updated_at: new Date().toISOString() },
  { id: "2", category: "api_gateway", label: "API Gateway", amount: 4200, budget: 5000, cost_type: "variable", currency: "THB", updated_at: new Date().toISOString() },
  { id: "3", category: "development", label: "ค่าจ้างพัฒนาระบบ", amount: 45000, budget: 50000, cost_type: "fixed", currency: "THB", updated_at: new Date().toISOString() },
  { id: "4", category: "marketing", label: "การตลาด", amount: 12000, budget: 15000, cost_type: "variable", currency: "THB", updated_at: new Date().toISOString() },
  { id: "5", category: "incentives", label: "ค่าสนับสนุนโค้ด (incentives)", amount: 8000, budget: 5000, cost_type: "variable", currency: "THB", updated_at: new Date().toISOString() },
];

export const RealTimeExpenses: React.FC = () => {
  const [expenses, setExpenses] = useState<ExpenseItem[]>(MOCK_EXPENSES);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date());

  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = expenses.reduce((s, e) => s + (e.budget || 0), 0);
  const fixedTotal = expenses.filter((e) => e.cost_type === "fixed").reduce((s, e) => s + e.amount, 0);
  const variableTotal = expenses.filter((e) => e.cost_type === "variable").reduce((s, e) => s + e.amount, 0);
  const overBudget = expenses.filter((e) => e.budget != null && e.amount > e.budget);

  const fetchData = async () => {
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      setExpenses(MOCK_EXPENSES);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 60000);
    return () => clearInterval(t);
  }, []);

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

  const maxAmount = Math.max(...expenses.map((e) => e.amount), 1);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-amber-700 to-orange-700 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <PieChartIcon size={24} /> ค่าใช้จ่ายแบบเรียลไทม์
        </h2>
        <p className="text-amber-100 text-sm">
          โดเมน & โฮสติ้ง • API Gateway • ค่าจ้างพัฒนาระบบ • การตลาด • Incentives • Fixed/Variable •
          งบประมาณและแจ้งเตือน • Export
        </p>
        {lastUpdated && (
          <p className="text-xs text-amber-200 mt-2">
            อัพเดตล่าสุด: {lastUpdated.toLocaleTimeString()} (อัพเดตทุก 1 นาที)
          </p>
        )}
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

      <div className="flex gap-2">
        <button
          onClick={fetchData}
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
                      style={{ width: `${Math.min(100, (e.amount / maxAmount) * 100)}%` }}
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-medium text-slate-800">{e.label}</td>
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
