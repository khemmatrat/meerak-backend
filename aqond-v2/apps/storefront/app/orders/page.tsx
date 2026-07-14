'use client';

import { useEffect, useState } from 'react';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';

export default function OrdersPage() {
  const { auth } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!auth) return;
    bffGet(`/v1/orders?buyer_id=${auth.userId}`, auth).then(setData);
  }, [auth]);

  if (!auth) return <p className="empty"><a href="/login">Login</a> to view orders</p>;

  return (
    <div>
      <h1 className="page-title">Orders</h1>
      {(data?.orders || []).length === 0 ? (
        <p className="empty">No orders yet — complete a checkout to see history</p>
      ) : (
        <ul>{(data.orders as any[]).map((o: any) => <li key={o.id}>{o.id} — {o.status}</li>)}</ul>
      )}
    </div>
  );
}
