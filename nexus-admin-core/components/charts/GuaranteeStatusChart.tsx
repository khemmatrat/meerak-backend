/**
 * GuaranteeStatusChart — Donut chart สถานะเงินประกัน Active/Released/Claimed/Pending
 */
import React from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface GuaranteeStatusSlice {
  name: string;
  value: number;
  status: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#3b82f6",
  released: "#10b981",
  claimed: "#f59e0b",
  pending_release: "#8b5cf6",
  other: "#94a3b8",
};

interface GuaranteeStatusChartProps {
  data: GuaranteeStatusSlice[];
  height?: number;
}

export const GuaranteeStatusChart: React.FC<GuaranteeStatusChartProps> = ({
  data,
  height = 260,
}) => {
  const withColors = data.map((d) => ({
    ...d,
    color: STATUS_COLORS[d.status] || STATUS_COLORS.other,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={withColors}
          cx="50%"
          cy="50%"
          innerRadius={70}
          outerRadius={95}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {withColors.map((entry, i) => (
            <Cell key={i} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => [`฿${value.toLocaleString()}`, ""]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
};
