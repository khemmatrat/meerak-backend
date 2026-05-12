import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Calendar, Filter, PieChart, BarChart2, TrendingUp, Loader2, X } from 'lucide-react';
import {
  getReportFinancial,
  getReportUserGrowth,
  getReportSystemHealth,
  getReportList,
  getAuditLogs,
  type ReportListItem,
} from '../services/adminApi';

function toCSV(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

function downloadBlob(content: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ReportCenterView: React.FC = () => {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [filterType, setFilterType] = useState<string>('');

  const FALLBACK_REPORTS: ReportListItem[] = [
    { id: 'RPT-001', name: 'รายงานสรุปรายได้ประจำวัน', type: 'FINANCIAL', format: 'CSV', frequency: 'DAILY', lastGenerated: 'On demand' },
    { id: 'RPT-002', name: 'ยอดผู้ใช้งานใหม่ (User Growth)', type: 'USER_GROWTH', format: 'CSV', frequency: 'WEEKLY', lastGenerated: 'On demand' },
    { id: 'RPT-003', name: 'System Health Audit', type: 'SYSTEM_HEALTH', format: 'CSV', frequency: 'MANUAL', lastGenerated: 'On demand' },
    { id: 'RPT-004', name: 'System Audit Log', type: 'AUDIT_LOG', format: 'CSV', frequency: 'MONTHLY', lastGenerated: 'On demand' },
  ];

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getReportList();
      setReports(res.reports || []);
    } catch (e) {
      setReports(FALLBACK_REPORTS);
      setError(e instanceof Error ? e.message : 'Failed to load reports — using fallback');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const getDefaultDates = () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  };

  const handleGenerateFinancial = async (overrideDates?: { from: string; to: string }) => {
    const { from, to } = overrideDates || (dateRange.from && dateRange.to ? dateRange : getDefaultDates());
    setGenerating('financial');
    setError(null);
    try {
      const data = await getReportFinancial({ from_date: from, to_date: to });
      const rows: string[][] = [
        ['Financial Report', '', ''],
        ['Period', from, to],
        ['Total Revenue (THB)', String(data.total_revenue), ''],
        ['Total Liabilities (THB)', String(data.total_liabilities), ''],
        [],
        ['Date', 'Revenue (THB)', 'Liabilities (THB)'],
        ...data.daily.map((d) => [d.date, String(d.revenue), String(d.liabilities)]),
      ];
      downloadBlob(toCSV(rows), `financial-report-${from}-${to}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate financial report');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateUserGrowth = async (overrideDates?: { from: string; to: string }) => {
    const { from, to } = overrideDates || (dateRange.from && dateRange.to ? dateRange : getDefaultDates());
    setGenerating('user-growth');
    setError(null);
    try {
      const data = await getReportUserGrowth({ from_date: from, to_date: to });
      const rows: string[][] = [
        ['User Growth Report', '', ''],
        ['Period', from, to],
        ['Total Users', String(data.total_users), ''],
        ['Total Providers', String(data.total_providers), ''],
        [],
        ['Date', 'New Signups'],
        ...data.daily_signups.map((d) => [d.date, String(d.signups)]),
      ];
      downloadBlob(toCSV(rows), `user-growth-${from}-${to}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate user growth report');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateSystemHealth = async () => {
    setGenerating('system');
    setError(null);
    try {
      const data = await getReportSystemHealth();
      const rows: string[][] = [
        ['System Health Report', ''],
        ['Timestamp', data.timestamp],
        ['PostgreSQL', data.services.postgresql],
        ['Redis', data.services.redis],
        ['Cloudinary', data.services.cloudinary],
        ['Uptime (seconds)', String(data.uptime_seconds)],
        ['Memory Heap Used (MB)', String(data.memory_mb.heapUsed)],
        ['Memory Heap Total (MB)', String(data.memory_mb.heapTotal)],
        ['Memory RSS (MB)', String(data.memory_mb.rss)],
        ['Node Env', data.node_env],
      ];
      downloadBlob(toCSV(rows), `system-health-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate system health report');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateAuditLog = async (overrideDates?: { from: string; to: string }) => {
    const { from, to } = overrideDates || (dateRange.from && dateRange.to ? dateRange : getDefaultDates());
    setGenerating('audit');
    setError(null);
    try {
      const res = await getAuditLogs({ from_date: from, to_date: to, limit: 500 });
      const logs = res.logs || [];
      const rows: string[][] = [
        ['Audit Log Report', '', '', '', ''],
        ['Period', from, to, '', ''],
        [],
        ['ID', 'Actor', 'Action', 'Entity', 'Created At'],
        ...logs.map((l) => [
          String(l.id),
          String(l.actor_id || ''),
          String(l.action || ''),
          `${l.entity_type || ''}:${l.entity_id || ''}`,
          l.created_at ? new Date(l.created_at).toLocaleString() : '',
        ]),
      ];
      downloadBlob(toCSV(rows), `audit-log-${from}-${to}.csv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate audit log report');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateReport = (type: string) => {
    if (type === 'FINANCIAL') handleGenerateFinancial();
    else if (type === 'USER_GROWTH') handleGenerateUserGrowth();
    else if (type === 'SYSTEM_HEALTH') handleGenerateSystemHealth();
    else if (type === 'AUDIT_LOG') handleGenerateAuditLog();
  };

  const handleGenerateAll = () => {
    if (!dateRange.from || !dateRange.to) {
      setDateRange(getDefaultDates());
    }
    setShowDateModal(true);
  };

  const handleGenerateAllConfirm = async () => {
    const { from, to } = dateRange.from && dateRange.to ? dateRange : getDefaultDates();
    setDateRange({ from, to });
    setShowDateModal(false);
    const dates = { from, to };
    try {
      setGenerating('financial');
      await handleGenerateFinancial(dates);
      setGenerating('user-growth');
      await handleGenerateUserGrowth(dates);
      setGenerating('system');
      await handleGenerateSystemHealth();
      setGenerating('audit');
      await handleGenerateAuditLog(dates);
    } finally {
      setGenerating(null);
      fetchReports();
    }
  };

  const filteredReports = filterType
    ? reports.filter((r) => r.type === filterType)
    : reports;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText size={20} className="text-indigo-600" />
            Report Center & BI
          </h2>
          <p className="text-slate-500 text-sm">Generate automated reports for accounting and management.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            <Calendar size={16} /> Set Date Range
          </button>
          <button
            onClick={handleGenerateAll}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200"
          >
            <Download size={16} /> Generate All
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-sm">{error}</div>
      )}

      {/* Quick Generate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <button
          onClick={() => handleGenerateFinancial()}
          disabled={generating !== null}
          className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group text-left disabled:opacity-70"
        >
          <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating === 'financial' ? <Loader2 size={24} className="animate-spin" /> : <TrendingUp size={24} />}
          </div>
          <h3 className="font-bold text-slate-800 mb-1">Financial Report</h3>
          <p className="text-xs text-slate-500 mb-4">Revenue, Liabilities, P&L Summary</p>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
          </div>
        </button>

        <button
          onClick={() => handleGenerateUserGrowth()}
          disabled={generating !== null}
          className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group text-left disabled:opacity-70"
        >
          <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating === 'user-growth' ? <Loader2 size={24} className="animate-spin" /> : <BarChart2 size={24} />}
          </div>
          <h3 className="font-bold text-slate-800 mb-1">User Growth & Retention</h3>
          <p className="text-xs text-slate-500 mb-4">DAU/MAU, New Signups, Providers</p>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
          </div>
        </button>

        <button
          onClick={() => handleGenerateSystemHealth()}
          disabled={generating !== null}
          className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group text-left disabled:opacity-70"
        >
          <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating === 'system' ? <Loader2 size={24} className="animate-spin" /> : <PieChart size={24} />}
          </div>
          <h3 className="font-bold text-slate-800 mb-1">System Health Audit</h3>
          <p className="text-xs text-slate-500 mb-4">Uptime, Services, Memory</p>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
          </div>
        </button>

        <button
          onClick={() => handleGenerateAuditLog()}
          disabled={generating !== null}
          className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer group text-left disabled:opacity-70"
        >
          <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            {generating === 'audit' ? <Loader2 size={24} className="animate-spin" /> : <FileText size={24} />}
          </div>
          <h3 className="font-bold text-slate-800 mb-1">Audit Log</h3>
          <p className="text-xs text-slate-500 mb-4">Actor, Action, Entity, Timestamp</p>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">CSV</span>
          </div>
        </button>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h3 className="font-bold text-slate-800">Available Reports</h3>
          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600"
            >
              <option value="">All Types</option>
              <option value="FINANCIAL">Financial</option>
              <option value="USER_GROWTH">User Growth</option>
              <option value="SYSTEM_HEALTH">System Health</option>
              <option value="AUDIT_LOG">Audit Log</option>
            </select>
            <span className="text-slate-400" title="Filter by type">
              <Filter size={14} />
            </span>
          </div>
        </div>
        {loading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-slate-500">
            <Loader2 size={24} className="animate-spin" /> Loading...
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-6 py-3 font-semibold">Report Name</th>
                <th className="px-6 py-3 font-semibold">Type</th>
                <th className="px-6 py-3 font-semibold">Format</th>
                <th className="px-6 py-3 font-semibold">Frequency</th>
                <th className="px-6 py-3 font-semibold">Last Generated</th>
                <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredReports.map((rpt) => (
                <tr key={rpt.id} className="hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-medium text-slate-800">{rpt.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 font-bold">{rpt.type}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-blue-100 text-blue-700">{rpt.format}</span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">{rpt.frequency}</td>
                  <td className="px-6 py-4 text-slate-500">{rpt.lastGenerated}</td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleGenerateReport(rpt.type)}
                      disabled={generating !== null}
                      className="text-indigo-600 hover:text-indigo-800 font-bold text-xs flex items-center gap-1 justify-end w-full disabled:opacity-50"
                    >
                      {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Date Range Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800">Set Date Range</h3>
              <button onClick={() => setShowDateModal(false)}>
                <X size={20} className="text-slate-400 hover:text-slate-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">From Date</label>
                <input
                  type="date"
                  value={dateRange.from || getDefaultDates().from}
                  onChange={(e) => setDateRange((d) => ({ ...d, from: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">To Date</label>
                <input
                  type="date"
                  value={dateRange.to || getDefaultDates().to}
                  onChange={(e) => setDateRange((d) => ({ ...d, to: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">Used for Financial, User Growth, and Audit Log reports.</p>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    const d = getDefaultDates();
                    setDateRange(d);
                  }}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50"
                >
                  Last 30 Days
                </button>
                <button
                  onClick={handleGenerateAllConfirm}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700"
                >
                  Generate All Reports
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
