'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { bffGet, bffPost } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { formatMicro } from '@/lib/format';
import { Button, Input, Card } from '@aqond/ui';
import Link from 'next/link';

export default function CartPage() {
  return (
    <Suspense fallback={<p className="empty">Loading cart...</p>}>
      <CartContent />
    </Suspense>
  );
}

function CartContent() {
  const { auth } = useAuth();
  const sp = useSearchParams();
  const owner = auth?.userId || 'guest';
  const [cart, setCart] = useState<any>(null);
  const [coupon, setCoupon] = useState('');

  const load = () => bffGet<any>(`/v1/cart?owner_id=${owner}`, auth).then(setCart).catch(() => setCart(null));
  useEffect(() => { load(); }, [auth]);

  useEffect(() => {
    const add = sp.get('add');
    if (add && auth) {
      bffPost('/v1/cart/items', {
        owner_id: owner, product_id: add, title: 'Product', qty: 1, unit_price_micro: 100000000,
      }, auth).then(load);
    }
  }, [sp, auth]);

  const applyCoupon = () => bffPost('/v1/cart/coupon', { owner_id: owner, code: coupon }, auth).then(load);

  if (!cart) return <p className="empty">Loading cart...</p>;
  const items = cart.items || [];

  return (
    <div>
      <h1 className="page-title">Cart ({cart.count || 0})</h1>
      {!auth && <p><Link href="/login">Login</Link> to save your cart</p>}
      {items.length === 0 ? (
        <p className="empty">Your cart is empty</p>
      ) : (
        items.map((it: any) => (
          <Card key={it.product_id} style={{ marginBottom: '0.5rem' }}>
            <strong>{it.title}</strong> × {it.qty} — {formatMicro(it.line_micro || 0)}
          </Card>
        ))
      )}
      <p><strong>Total:</strong> {formatMicro(cart.total_micro || 0, cart.currency)}</p>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
        <Input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code" />
        <Button variant="ghost" onClick={applyCoupon}>Apply</Button>
      </div>
      {items.length > 0 && <Link href="/checkout"><Button style={{ marginTop: '1rem' }}>Checkout</Button></Link>}
    </div>
  );
}
