
import React, { useState, useEffect } from 'react';
import { Database, HardDrive, Activity, ArrowRight, Layers, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getShardingStats, ShardingStatsResponse } from '../services/adminApi';

export const DatabaseShardingView: React.FC = () => {
  const [data, setData] = useState<ShardingStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getShardingStats();
      setData(res);
    } catch (e: unknown) {
      setError((e as Error)?.message || 'Failed to load sharding stats');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 60000); // refresh every 60s
    return () => clearInterval(t);
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Layers size={20} className="text-indigo-600" />
          Database Sharding Monitor
        </h2>
        <div className="flex items-center justify-center py-16 text-slate-500">
          <RefreshCw size={24} className="animate-spin mr-2" />
          Loading partition stats...
        </div>
      </div>
    );
  }

  const partitions = data?.partitions ?? [];
  const chartData = partitions.map((p) => ({
    name: p.name.replace('transactions_', ''),
    iops: p.iops ?? 0,
    rowCount: p.rowCount ?? 0,
    sizeGB: p.sizeGB ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Layers size={20} className="text-indigo-600" />
            Database Sharding Monitor
          </h2>
          <p className="text-slate-500 text-sm">
            Managing {data?.throughput?.targetTpm ?? 3000}+ Transactions/Min via Horizontal Partitioning
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {error && (
            <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-lg text-xs flex items-center gap-1">
              <AlertTriangle size={14} /> {error}
            </span>
          )}
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-100 flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-mono">
            Strategy: {data?.strategy ?? 'RANGE_BASED'}
          </span>
          <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-mono">
            Total Shards: {data?.totalShards ?? 0}
          </span>
        </div>
      </div>

      {/* Throughput & Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs mb-1">Throughput (Est. TPM)</p>
          <p className="text-2xl font-bold text-slate-800">{data?.throughput?.tpmEstimate ?? 0}</p>
          <p className="text-xs text-slate-400">Target: {data?.throughput?.targetTpm ?? 3000}+ TPM</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs mb-1">Health</p>
          <div className="flex items-center gap-2">
            {data?.throughput?.healthy ? (
              <CheckCircle size={20} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={20} className="text-amber-500" />
            )}
            <span className={data?.throughput?.healthy ? 'text-emerald-600 font-medium' : 'text-amber-600 font-medium'}>
              {data?.throughput?.healthy ? 'Healthy' : 'Below target'}
            </span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-500 text-xs mb-1">Partition Key</p>
          <p className="font-mono text-slate-800">{data?.partitionKey ?? 'created_at'}</p>
          <p className="text-xs text-slate-400">Table: {data?.tableName ?? 'transactions'}</p>
        </div>
      </div>

      {/* Shard Health Map */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {partitions.map((shard) => (
          <div
            key={shard.id}
            className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden"
          >
            {shard.load > 85 && (
              <div className="absolute top-0 right-0 p-1.5 bg-rose-500 text-white text-[10px] font-bold rounded-bl-lg z-10">
                HOT SHARD
              </div>
            )}
            <div className="flex items-center gap-3 mb-3">
              <div
                className={`p-2 rounded-lg ${shard.load > 85 ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-500'}`}
              >
                <Database size={20} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800 text-sm">{shard.name.replace('transactions_', '')}</h4>
                <p className="text-xs text-slate-500 truncate max-w-[120px]" title={shard.range}>
                  {shard.range || '—'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">Disk Usage</span>
                  <span className={`font-bold ${shard.load > 85 ? 'text-rose-600' : 'text-slate-700'}`}>
                    {shard.load}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${shard.load > 85 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                    style={{ width: `${Math.min(shard.load, 100)}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-slate-400">Size</p>
                  <p className="font-mono font-medium text-slate-700">{shard.sizeGB.toFixed(2)} GB</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-slate-400">Rows</p>
                  <p className="font-mono font-medium text-slate-700">
                    {(shard.rowCount ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {partitions.length === 0 && !loading && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center text-amber-800">
          <AlertTriangle size={24} className="mx-auto mb-2 text-amber-600" />
          <p>No partitions found for transactions table.</p>
          <p className="text-sm mt-1">Run Migration 002 to create partitioned transactions.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Load Distribution Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Write Distribution (IOPS per partition)</h3>
          <div className="h-64">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '8px', border: 'none' }}
                    formatter={(value: number) => [value.toLocaleString(), 'IOPS']}
                  />
                  <Bar dataKey="iops" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No partition data to display
              </div>
            )}
          </div>
        </div>

        {/* Partition Forecast */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <HardDrive size={18} />
              Partition Forecast
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Months that need partitions (run create_next_month_partitions() if missing)
            </p>
            {data?.partitionForecast?.missing?.length ? (
              <div className="space-y-2">
                <p className="text-amber-600 font-medium text-sm">Missing partitions:</p>
                <ul className="list-disc list-inside text-sm text-slate-700">
                  {data.partitionForecast.missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 mt-2">
                  Expected: {data.partitionForecast.expected.join(', ')}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle size={18} />
                <span className="text-sm font-medium">All expected partitions exist</span>
              </div>
            )}
          </div>

          {/* Ledger Integrity (Migration 069/073) */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity size={18} />
            Ledger Integrity
          </h3>
          {data?.ledgerIntegrity ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {data.ledgerIntegrity.valid === true ? (
                  <CheckCircle size={18} className="text-emerald-500" />
                ) : data.ledgerIntegrity.valid === false ? (
                  <AlertTriangle size={18} className="text-rose-500" />
                ) : null}
                <span
                  className={
                    data.ledgerIntegrity.valid === true
                      ? 'text-emerald-600'
                      : data.ledgerIntegrity.valid === false
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  }
                >
                  {data.ledgerIntegrity.valid === true
                    ? 'Checksum chain valid'
                    : data.ledgerIntegrity.valid === false
                      ? 'Tamper detected'
                      : data.ledgerIntegrity.note}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Rows: {data.ledgerIntegrity.totalRows.toLocaleString()} • {data.ledgerIntegrity.note}
              </p>
            </div>
          ) : (
            <p className="text-slate-500 text-sm">—</p>
          )}
        </div>

        <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg">
            <h3 className="font-bold text-lg mb-2">Shard Manager</h3>
            <p className="text-indigo-300 text-sm mb-4">
              Partitions are created automatically via create_next_month_partitions(). Schedule via pg_cron on the 1st of
              each month.
            </p>
            <p className="text-indigo-200 text-xs">
              Limit: {data?.partitionLimitGB ?? 5} GB per partition. Hot shards (&gt;85%) may need archival.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
