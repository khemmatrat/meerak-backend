/**
 * MarketCapGrowthChart — Line chart การเติบโตของ Market Cap เปรียบเทียบกับการลงทุน
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

export interface MarketCapDataPoint {
  date: string;
  market_cap: number;
  invested?: number;
}

interface MarketCapGrowthChartProps {
  data: MarketCapDataPoint[];
  height?: number;
}

export const MarketCapGrowthChart: React.FC<MarketCapGrowthChartProps> = ({
  data,
  height = 280,
}) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#64748b" />
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
          dataKey="market_cap"
          name="Market Cap"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
        {data.some((d) => d.invested != null && d.invested > 0) && (
          <Line
            type="monotone"
            dataKey="invested"
            name="เงินลงทุนสะสม"
            stroke="#64748b"
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
};
