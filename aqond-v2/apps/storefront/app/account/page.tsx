'use client';

import { useEffect, useState } from 'react';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { Card } from '@aqond/ui';
import Link from 'next/link';
import { formatMicro } from '@/lib/format';

export default function AccountPage() {
  const { auth } = useAuth();
  const [account, setAccount] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);

  useEffect(() => {
    if (!auth) return;
    bffGet(`/v1/account`, auth).then(setAccount);
    bffGet(`/v1/wallet`, auth).then(setWallet);
  }, [auth]);

  if (!auth) return <p className="empty"><Link href="/login">Login</Link> to view account</p>;

  return (
    <div>
      <h1 className="page-title">Account</h1>
      <Card>
        <p>User: {auth.userId}</p>
        <p>Wallet: {formatMicro(wallet?.balance_micro || 0)}</p>
        <p>Coins: {wallet?.coins || 0}</p>
      </Card>
      <nav style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Link href="/settings">Settings & Privacy</Link>
        <Link href="/orders">Orders</Link>
        <Link href="/creator/studio">Creator Studio</Link>
        <Link href={`/share?kind=profile&ref=${auth.userId}`}>Share profile (QR)</Link>
      </nav>
    </div>
  );
}
