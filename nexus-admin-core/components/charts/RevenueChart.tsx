/**
 * RevenueChart — กราฟรายได้ตามเวลา (รายวัน/สัปดาห์/เดือน)
 * แยกสีค่าคอมมิชชั่น vs รายได้อื่นๆ
 */
import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface RevenueDataPoint {
  period: string;
  revenue: number;
  commission?: number;
  other?: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  height?: number;
}

const COLORS = { revenue: "#10b981", commission: "#6366f1", other: "#f59e0b" };

export const RevenueChart: React.FC<RevenueChartProps> = ({
  data,
  height = 280,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="period" tick={{ fontSize: 12 }} stroke="#64748b" />
        <YAxis
          tick={{ fontSize: 12 }}
          stroke="#64748b"
          tickFormatter={(v) => `฿${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          formatter={(value: number) => [`฿${value.toLocaleString()}`, ""]}
          contentStyle={{ borderRadius: 8 }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="revenue"
          name="รายได้รวม"
          stroke={COLORS.revenue}
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {data.some((d) => d.commission != null && d.commission > 0) && (
          <Line
            type="monotone"
            dataKey="commission"
            name="ค่าคอมมิชชั่น"
            stroke={COLORS.commission}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        )}
        {data.some((d) => d.other != null && d.other > 0) && (
          <Line
            type="monotone"
            dataKey="other"
            name="รายได้อื่น"
            stroke={COLORS.other}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};
