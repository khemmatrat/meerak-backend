'use client';

import Link from 'next/link';
import { ORDER_TABS, type OrderTab } from '@/lib/ordersHub';
import { LuxuryOrderIcon } from '@/components/mobile/TtLuxuryIcons';

type Props = {
  counts?: Partial<Record<OrderTab, number>>;
  activeTab?: OrderTab;
  showHistoryLink?: boolean;
  hideTitle?: boolean;
};

export function MpPurchasesSection({
  counts = {},
  activeTab,
  showHistoryLink = true,
  hideTitle = false,
}: Props) {
  return (
    <section className="tt-mp-purchases">
      {!hideTitle && (
        <div className="tt-mp-purchases-head">
          <strong>การซื้อของฉัน</strong>
          {showHistoryLink && (
            <Link href="/m/orders">ดูประวัติการซื้อ ›</Link>
          )}
        </div>
      )}
      <div className="tt-mp-purchases-tabs">
        {ORDER_TABS.map((tab) => {
          const active = activeTab === tab.id;
          const count = counts[tab.id] || 0;
          const href =
            tab.id === 'torate' ? '/m/orders/ratings' : `/m/orders?tab=${tab.id}`;
          return (
            <Link
              key={tab.id}
              href={href}
              className={`tt-mp-purchases-tab${active ? ' active' : ''}`}
            >
              <span className="tt-mp-purchases-tab-icon">
                <LuxuryOrderIcon tab={tab.id} size={26} />
              </span>
              <span className="tt-mp-purchases-tab-label">{tab.label}</span>
              {count > 0 && <em className="tt-mp-purchases-badge">{count > 99 ? '99+' : count}</em>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
