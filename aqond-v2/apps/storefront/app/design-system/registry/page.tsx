'use client';

import { useState } from 'react';
import Link from 'next/link';
import '@aqond/components/registry.css';
import {
  AqondBadge,
  AqondButton,
  AqondCard,
  AqondCardFooter,
  AqondCardHeader,
  AqondChip,
  AqondDialog,
  AqondHeader,
  AqondInput,
  AqondLoading,
  AqondNavbar,
  AqondSearch,
  AqondSheet,
  AqondSkeletonCard,
  AqondTimeline,
  AqondToast,
} from '@aqond/components';
import { useAqondTheme } from '@aqond/ui';

const DEMO_TIMELINE = [
  { id: '1', time: '10:01', label: 'ลูกค้าสั่งงาน', done: true },
  { id: '2', time: '10:05', label: 'Talent รับงาน', done: true },
  { id: '3', time: '—', label: 'งานเสร็จสิ้น', active: true },
];

export default function ComponentRegistryPage() {
  const { theme, toggleTheme } = useAqondTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [nav, setNav] = useState('services');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--axs-bg)', paddingBottom: 88 }}>
      <AqondHeader
        title="AQOND Component Registry"
        subtitle="Sprint 29 — aliases over @aqond/ui"
        backHref="/design-system"
        backLabel="‹ AXS Playground"
        actions={
          <AqondButton variant="ghost" onClick={toggleTheme}>
            {theme === 'aqond-light' ? '🌙' : '☀️'}
          </AqondButton>
        }
      />

      <main style={{ padding: 20, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)' }}>Actions</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            <AqondButton variant="primary">AqondButton</AqondButton>
            <AqondButton variant="secondary">Secondary</AqondButton>
            <AqondButton variant="ghost">Ghost</AqondButton>
          </div>
        </section>

        <AqondSearch placeholder="AqondSearch — ค้นหา Talent" />

        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)' }}>Status</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            <AqondChip tone="pending">AqondChip</AqondChip>
            <AqondChip tone="completed">Completed</AqondChip>
            <AqondBadge tone="info">AqondBadge</AqondBadge>
          </div>
        </section>

        <AqondCard>
          <AqondCardHeader>AqondCard</AqondCardHeader>
          <AqondInput placeholder="AqondInput" />
          <AqondCardFooter>
            <AqondButton variant="primary" style={{ width: '100%' }} onClick={() => setSheetOpen(true)}>
              เปิด AqondSheet
            </AqondButton>
          </AqondCardFooter>
        </AqondCard>

        <AqondCard>
          <AqondTimeline items={DEMO_TIMELINE} />
        </AqondCard>

        <AqondLoading label="AqondLoading page variant" />

        <AqondSkeletonCard />

        <div style={{ display: 'flex', gap: 8 }}>
          <AqondButton variant="secondary" onClick={() => setDialogOpen(true)}>
            AqondDialog
          </AqondButton>
          <AqondButton variant="success" onClick={() => setToast('บันทึกสำเร็จ')}>
            AqondToast
          </AqondButton>
        </div>

        <p style={{ fontSize: 13, color: 'var(--axs-text-muted)', textAlign: 'center' }}>
          Pilot adoption: <Link href="/m/services">/m/services</Link> uses @aqond/components
        </p>
      </main>

      <AqondNavbar
        items={[
          { id: 'services', label: 'Services', icon: '⚡', active: nav === 'services', onClick: () => setNav('services') },
          { id: 'food', label: 'Food', icon: '🍜', active: nav === 'food', onClick: () => setNav('food') },
          { id: 'pay', label: 'Pay', icon: '💳', active: nav === 'pay', onClick: () => setNav('pay') },
          { id: 'me', label: 'ฉัน', icon: '👤', active: nav === 'me', onClick: () => setNav('me') },
        ]}
      />

      <AqondSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="AqondSheet"
        footer={
          <AqondButton variant="primary" style={{ width: '100%' }} onClick={() => setSheetOpen(false)}>
            ตกลง
          </AqondButton>
        }
      >
        <p style={{ margin: 0 }}>Bottom sheet จาก registry — alias ของ BottomSheet</p>
      </AqondSheet>

      <AqondDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="AqondDialog"
        footer={
          <AqondButton variant="primary" onClick={() => setDialogOpen(false)}>
            ตกลง
          </AqondButton>
        }
      >
        <p style={{ margin: 0 }}>Dialog สำหรับยืนยันการทำรายการ</p>
      </AqondDialog>

      <AqondToast message={toast} tone="success" visible={!!toast} onClose={() => setToast('')} />
    </div>
  );
}
