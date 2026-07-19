import { chartBarHeight, formatThbCompact } from '@/lib/talent/commerce/talentCommerceCompose';
import type { TalentCommerceComposed } from '@/lib/talent/commerce/talentCommerceTypes';

type Props = {
  charts: TalentCommerceComposed['charts'];
  period: TalentCommerceComposed['period'];
};

export function CommerceChartPanel({ charts, period }: Props) {
  const maxActivity = Math.max(...charts.activityByDay.map((b) => b.value), 1);
  const maxIncome = Math.max(...charts.incomeBreakdown.map((b) => b.value), 1);

  return (
    <section className="tt-talent-commerce-charts" aria-label="Charts">
      <div className="tt-talent-commerce-chart-block">
        <h3>กิจกรรม {period === 'week' ? '7 วัน' : '30 วัน'}</h3>
        <p className="tt-hint">Booking + Match + Board ต่อวัน (จาก created_at)</p>
        {charts.activityByDay.length === 0 ? (
          <p className="tt-talent-commerce-chart-empty">ไม่มีข้อมูลในช่วงนี้</p>
        ) : (
          <div className="tt-talent-commerce-bar-chart" role="img" aria-label="กราฟกิจกรรมรายวัน">
            {charts.activityByDay.map((bar) => (
              <div key={bar.id} className="tt-talent-commerce-bar-col">
                <div
                  className="tt-talent-commerce-bar-fill"
                  style={{ height: `${chartBarHeight(bar.value, maxActivity)}%` }}
                  title={`${bar.label}: ${bar.value}`}
                />
                <span className="tt-talent-commerce-bar-label">{bar.label}</span>
                <span className="tt-talent-commerce-bar-value">{bar.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="tt-talent-commerce-chart-block">
        <h3>รายได้ประมาณ (แยกแหล่ง)</h3>
        <p className="tt-hint">Match price · Board budget · Booking deposit · Wallet</p>
        {charts.incomeBreakdown.length === 0 ? (
          <p className="tt-talent-commerce-chart-empty">ยังไม่มีรายได้จากแหล่งที่ compose ได้</p>
        ) : (
          <ul className="tt-talent-commerce-income-bars">
            {charts.incomeBreakdown.map((bar) => (
              <li key={bar.id}>
                <div className="tt-talent-commerce-income-row">
                  <span>{bar.label}</span>
                  <strong>{formatThbCompact(bar.value)}</strong>
                </div>
                <div className="tt-talent-commerce-income-track">
                  <div
                    className="tt-talent-commerce-income-fill"
                    style={{ width: `${chartBarHeight(bar.value, maxIncome)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
