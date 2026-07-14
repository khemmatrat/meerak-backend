'use client';

import { useEffect, useState } from 'react';
import { bffGet, bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { formatMicro } from '@/lib/format';
import { Button, Card } from '@aqond/ui';
import { useRouter } from 'next/navigation';

export default function CheckoutPage() {
  const { auth } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<any>(null);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!auth) return;
    bffGet<any>(`/v1/checkout?owner_id=${auth.userId}`, auth).then(setView);
  }, [auth]);

  const place = async () => {
    if (!auth) return;
    setPlacing(true);
    try {
      await bffPost('/v1/checkout/place', {
        buyer_id: auth.userId,
        merchant_id: 'demo-merchant',
        method: 'cod',
        amount_micro: view?.cart?.total_micro || 0,
        currency: 'THB',
        idempotency_key: `co-${Date.now()}`,
      }, auth);
      router.push('/orders');
    } catch (e) {
      alert(String(e));
    } finally {
      setPlacing(false);
    }
  };

  if (!auth) return <p className="empty"><a href="/login">Login</a> to checkout</p>;
  if (!view) return <p className="empty">Loading checkout...</p>;

  const methods = view.payment_methods?.methods || [];

  return (
    <div>
      <h1 className="page-title">Checkout</h1>
      <Card>
        <p>Subtotal: {formatMicro(view.cart?.total_micro || 0)}</p>
        {view.tax && <p>Tax: {formatMicro(view.tax.tax_micro || 0)}</p>}
        <h3>Payment methods</h3>
        <ul>{methods.map((m: any) => <li key={m.method}>{m.method} ({m.provider})</li>)}</ul>
        <Button onClick={place} disabled={placing}>{placing ? 'Placing...' : 'Place order (COD)'}</Button>
      </Card>
    </div>
  );
}
