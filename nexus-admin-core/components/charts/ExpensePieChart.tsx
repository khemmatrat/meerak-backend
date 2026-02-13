/**
 * ExpensePieChart — Pie chart สัดส่วนค่าใช้จ่ายตามหมวดหมู่
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

export interface ExpenseSlice {
  name: string;
  value: number;
  color?: string;
}

const DEFAULT_COLORS = [
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#10b981",
  "#6366f1",
];

interface ExpensePieChartProps {
  data: ExpenseSlice[];
  height?: number;
}

export const ExpensePieChart: React.FC<ExpensePieChartProps> = ({
  data,
  height = 280,
}) => {
  const withColors = data.map((d, i) => ({
    ...d,
    color: d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={withColors}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
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
