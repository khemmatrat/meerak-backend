'use client';

import { useEffect, useState } from 'react';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { Card } from '@aqond/ui';
import Link from 'next/link';

export default function StudioPage() {
  const { auth } = useAuth();
  const [studio, setStudio] = useState<any>(null);

  useEffect(() => {
    if (!auth) return;
    bffGet('/v1/creator/studio', auth).then(setStudio);
  }, [auth]);

  if (!auth) return <p className="empty"><Link href="/login">Login</Link> as creator</p>;

  return (
    <div>
      <h1 className="page-title">Creator Studio</h1>
      <Card>
        <p>Views: {studio?.analytics?.views ?? 0}</p>
        <p>Revenue: {(studio?.analytics?.revenue_micro ?? 0) / 1e6} THB</p>
        <p>Posts: {(studio?.posts || []).length}</p>
      </Card>
      <Card style={{ marginTop: '1rem' }}>
        <h2>ลงสินค้า</h2>
        <p>Hermes AI วิเคราะห์รูป → สร้างรายการอัตโนมัติ</p>
        <Link href="/m/sell" className="tt-btn-primary" style={{ display: 'inline-block', marginTop: 8, maxWidth: 240 }}>
          ลงสินค้าด้วย AI →
        </Link>
      </Card>
      <Card style={{ marginTop: '1rem' }}>
        <h2>วิดีโอ Feed</h2>
        <p>อัปโหลดวิดีโอ vertical → ปักสินค้า → ขายใน Feed</p>
        <Link href="/m/studio" className="tt-btn-primary" style={{ display: 'inline-block', marginTop: 8, maxWidth: 240 }}>
          Creator Studio (มือถือ) →
        </Link>
      </Card>
      <Card style={{ marginTop: '1rem' }}>
        <h2>Upload (P157)</h2>
        <p>Wire video-svc upload in prod — moderation via trust-svc P105</p>
      </Card>
    </div>
  );
}
