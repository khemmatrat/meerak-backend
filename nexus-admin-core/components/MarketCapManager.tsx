/**
 * MarketCapManager — การจัดการมูลค่าบริษัทและการลงทุน
 * Market Cap • ตารางนักลงทุนและ % การถือหุ้น • มูลค่าหุ้น • เงินลงทุน • การเติบโต
 * เชื่อม Backend: GET/POST/PATCH/DELETE /api/admin/financial/market-cap, investors
 */
import React, { useState } from "react";
import {
  TrendingUp,
  Users,
  DollarSign,
  PieChart as PieChartIcon,
  RefreshCw,
  Download,
  Loader2,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMarketCap } from "../hooks/useFinancialData";
import {
  createInvestor,
  updateInvestor,
  deleteInvestor,
  updateMarketCap,
  type CreateInvestorInput,
  type InvestorEntry,
} from "../services/financialService";

export interface MarketCapSnapshot {
  date: string;
  market_cap: number;
  total_shares: number;
}

export const MarketCapManager: React.FC = () => {
  const { data, loading, error, refetch } = useMarketCap();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showMarketCapForm, setShowMarketCapForm] = useState(false);
  const [marketCapInput, setMarketCapInput] = useState<string>("");
  const [formData, setFormData] = useState<Partial<CreateInvestorInput>>({
    name: "",
    shares: 0,
    invested_amount: 0,
    invested_at: new Date().toISOString().slice(0, 10),
    note: "",
    decision_power_percent: 0,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  const investors = data?.investors ?? [];
  const growth = data?.growth ?? [];
  const currentMarketCap = data?.current_market_cap ?? 0;
  const totalShares = (data?.total_shares ?? investors.reduce((s, i) => s + i.shares, 0)) || 10000;
  const shareValue = data?.share_value ?? (totalShares > 0 ? currentMarketCap / totalShares : 0);

  const investorsWithOwnership = investors.map((inv) => ({
    ...inv,
    ownership_percent: totalShares > 0 ? (inv.shares / totalShares) * 100 : 0,
    share_value: shareValue * inv.shares,
  }));

  const totalInvested = investors.reduce((s, i) => s + i.invested_amount, 0);
  const totalReturn = currentMarketCap;
  const returnPercent =
    totalInvested > 0
      ? ((totalReturn - totalInvested) / totalInvested) * 100
      : 0;

  const handleAddInvestor = async () => {
    if (!formData.name?.trim()) {
      setSubmitError("กรุณากรอกชื่อบริษัทหรือบุคคล");
      return;
    }
    setSubmitError(null);
    try {
      await createInvestor({
        name: formData.name.trim(),
        shares: Number(formData.shares) || 0,
        invested_amount: Number(formData.invested_amount) || 0,
        invested_at: formData.invested_at || new Date().toISOString().slice(0, 10),
        note: formData.note?.trim() || undefined,
        decision_power_percent: formData.decision_power_percent ?? 0,
      });
      setFormData({ name: "", shares: 0, invested_amount: 0, invested_at: new Date().toISOString().slice(0, 10), note: "", decision_power_percent: 0 });
      setShowAddForm(false);
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถเพิ่มได้");
    }
  };

  const handleUpdateInvestor = async (id: string) => {
    setSubmitError(null);
    try {
      await updateInvestor(id, {
        name: formData.name,
        shares: formData.shares,
        invested_amount: formData.invested_amount,
        invested_at: formData.invested_at,
        note: formData.note,
        decision_power_percent: formData.decision_power_percent,
      });
      setEditingId(null);
      setFormData({ name: "", shares: 0, invested_amount: 0, invested_at: "", note: "", decision_power_percent: 0 });
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถแก้ไขได้");
    }
  };

  const handleDeleteInvestor = async (id: string) => {
    if (!confirm("ต้องการลบหุ้นส่วนนี้?")) return;
    setSubmitError(null);
    try {
      await deleteInvestor(id);
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถลบได้");
    }
  };

  const handleUpdateMarketCap = async () => {
    const mc = parseFloat(marketCapInput);
    if (isNaN(mc) || mc < 0) {
      setSubmitError("กรุณากรอกมูลค่าที่ถูกต้อง");
      return;
    }
    setSubmitError(null);
    try {
      await updateMarketCap(mc);
      setShowMarketCapForm(false);
      setMarketCapInput("");
      refetch();
    } catch (e: unknown) {
      setSubmitError((e as Error)?.message || "ไม่สามารถอัพเดตได้");
    }
  };

  const startEdit = (inv: InvestorEntry) => {
    setEditingId(inv.id);
    setFormData({
      name: inv.name,
      shares: inv.shares,
      invested_amount: inv.invested_amount,
      invested_at: inv.invested_at,
      note: inv.note || "",
      decision_power_percent: inv.decision_power_percent ?? 0,
    });
  };

  const handleExport = () => {
    const header = "Name,Shares,Ownership %,Invested,Share Value,Invested At,Decision Power %\n";
    const rows = investorsWithOwnership
      .map(
        (i) =>
          `${i.name},${i.shares},${i.ownership_percent.toFixed(2)}%,${
            i.invested_amount
          },${i.share_value.toFixed(2)},${i.invested_at},${(i.decision_power_percent ?? 0).toFixed(1)}%`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `market_cap_investors_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-violet-700 to-purple-700 rounded-xl p-6 text-white">
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <PieChartIcon size={24} /> การจัดการหุ้นส่วน & Market Cap
        </h2>
        <p className="text-violet-100 text-sm">
          Market Cap ปัจจุบัน • ตารางนักลงทุนและ % การถือหุ้น • มูลค่าหุ้น •
          การเติบโตของบริษัท — ตัวเลขมาจาก API เท่านั้น (ไม่มีค่า demo ใน UI)
        </p>
      </div>

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700 text-sm">
          {submitError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h3 className="font-bold text-slate-800">มูลค่าบริษัทและการลงทุน</h3>
        <div className="flex flex-wrap gap-2">
          {error && <span className="text-sm text-rose-600">{error}</span>}
          <button
            onClick={() => setShowMarketCapForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-violet-100 text-violet-700 rounded-lg text-sm font-medium hover:bg-violet-200"
          >
            อัพเดต Market Cap
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
          >
            <Plus size={16} /> เพิ่มหุ้นส่วน
          </button>
          <button
            onClick={refetch}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <RefreshCw size={16} />
            )}
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
          >
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {showMarketCapForm && (
        <div className="bg-white rounded-xl border border-violet-200 p-4">
          <h4 className="font-bold text-slate-800 mb-2">อัพเดต Market Cap ปัจจุบัน</h4>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={marketCapInput}
              onChange={(e) => setMarketCapInput(e.target.value)}
              placeholder="มูลค่า (THB)"
              className="border border-slate-200 rounded-lg px-3 py-2 w-40"
            />
            <button onClick={handleUpdateMarketCap} className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium">
              บันทึก
            </button>
            <button onClick={() => { setShowMarketCapForm(false); setSubmitError(null); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4 space-y-3">
          <h4 className="font-bold text-slate-800">เพิ่มหุ้นส่วน/นักลงทุน</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">ชื่อบริษัทหรือบุคคล</label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="เช่น บริษัท ABC หรือ นายสมชาย"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">จำนวนหุ้น</label>
              <input
                type="number"
                value={formData.shares ?? ""}
                onChange={(e) => setFormData({ ...formData, shares: parseInt(e.target.value, 10) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">เงินลงทุน (THB)</label>
              <input
                type="number"
                value={formData.invested_amount ?? ""}
                onChange={(e) => setFormData({ ...formData, invested_amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">วันที่ลงทุน</label>
              <input
                type="date"
                value={formData.invested_at || ""}
                onChange={(e) => setFormData({ ...formData, invested_at: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">สัดส่วนอำนาจร่วมตัดสินใจ (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={formData.decision_power_percent ?? ""}
                onChange={(e) => setFormData({ ...formData, decision_power_percent: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
              <input
                type="text"
                value={formData.note || ""}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="—"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAddInvestor} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium">
              บันทึก
            </button>
            <button onClick={() => { setShowAddForm(false); setSubmitError(null); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {editingId && (
        <div className="bg-white rounded-xl border border-indigo-200 p-4 space-y-3">
          <h4 className="font-bold text-slate-800">แก้ไขหุ้นส่วน</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">ชื่อบริษัทหรือบุคคล</label>
              <input
                type="text"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">จำนวนหุ้น</label>
              <input
                type="number"
                value={formData.shares ?? ""}
                onChange={(e) => setFormData({ ...formData, shares: parseInt(e.target.value, 10) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">เงินลงทุน (THB)</label>
              <input
                type="number"
                value={formData.invested_amount ?? ""}
                onChange={(e) => setFormData({ ...formData, invested_amount: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">วันที่ลงทุน</label>
              <input
                type="date"
                value={formData.invested_at || ""}
                onChange={(e) => setFormData({ ...formData, invested_at: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">สัดส่วนอำนาจร่วมตัดสินใจ (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={formData.decision_power_percent ?? ""}
                onChange={(e) => setFormData({ ...formData, decision_power_percent: parseFloat(e.target.value) || 0 })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-slate-500 mb-1">หมายเหตุ</label>
              <input
                type="text"
                value={formData.note || ""}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => editingId && handleUpdateInvestor(editingId)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
              บันทึก
            </button>
            <button onClick={() => { setEditingId(null); setSubmitError(null); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium">
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="text-violet-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              Market Cap ปัจจุบัน
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿
            {currentMarketCap.toLocaleString(undefined, {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-emerald-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              มูลค่าหุ้น (ต่อหุ้น)
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿
            {shareValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users className="text-blue-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              เงินลงทุนรวม
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            ฿{totalInvested.toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <PieChartIcon className="text-amber-600" size={20} />
            <span className="text-sm font-medium text-slate-500">
              ผลตอบแทน (รวม)
            </span>
          </div>
          <p
            className={`text-2xl font-bold ${
              returnPercent >= 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {returnPercent >= 0 ? "+" : ""}
            {returnPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            ตารางนักลงทุนและ % การถือหุ้น
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 text-left font-semibold">ชื่อบริษัท/บุคคล</th>
                <th className="px-6 py-3 text-right font-semibold">จำนวนหุ้น</th>
                <th className="px-6 py-3 text-right font-semibold">% ถือหุ้น</th>
                <th className="px-6 py-3 text-right font-semibold">เงินลงทุน</th>
                <th className="px-6 py-3 text-right font-semibold">มูลค่าหุ้นปัจจุบัน</th>
                <th className="px-6 py-3 text-left font-semibold">วันที่ลงทุน</th>
                <th className="px-6 py-3 text-right font-semibold">สัดส่วนอำนาจร่วมตัดสินใจ</th>
                <th className="px-6 py-3 text-right font-semibold">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {investorsWithOwnership.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-3 font-medium text-slate-800">
                    {inv.name}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.shares.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {inv.ownership_percent.toFixed(2)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    ฿{inv.invested_amount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right font-medium">
                    ฿
                    {inv.share_value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {inv.invested_at}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-600">
                    {(inv.decision_power_percent ?? 0).toFixed(1)}%
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => startEdit(inv)}
                      className="p-1.5 text-slate-500 hover:text-indigo-600"
                      title="แก้ไข"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteInvestor(inv.id)}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="font-bold text-slate-800">
            การเติบโตของ Market Cap (ตามช่วง)
          </h3>
        </div>
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-2 flex-wrap">
            {growth.map((g, i) => (
              <div
                key={g.date}
                className="px-4 py-3 rounded-lg border border-slate-200 bg-slate-50 min-w-[120px] text-center"
              >
                <p className="text-xs text-slate-500">{g.date}</p>
                <p className="font-bold text-slate-800">
                  ฿{(g.market_cap / 1000).toFixed(0)}K
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
