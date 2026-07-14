'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Badge,
  BottomNav,
  BottomSheet,
  Button,
  Card,
  CardHeader,
  CardFooter,
  Dialog,
  EmptyState,
  Input,
  Skeleton,
  SkeletonCard,
  StatusChip,
  Timeline,
  useAqondTheme,
} from '@aqond/ui';

const DEMO_TIMELINE = [
  { id: '1', time: '10:01', label: 'ลูกค้าสั่งอาหาร', done: true },
  { id: '2', time: '10:02', label: 'ร้านรับออเดอร์', done: true },
  { id: '3', time: '10:08', label: 'เริ่มทำอาหาร', done: true },
  { id: '4', time: '10:18', label: 'มอบหมายไรเดอร์', active: true },
  { id: '5', time: '—', label: 'ส่งสำเร็จ' },
];

export default function DesignSystemPage() {
  const { theme, toggleTheme } = useAqondTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nav, setNav] = useState('home');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--axs-bg)', paddingBottom: 80 }}>
      <header
        style={{
          padding: '16px 20px',
          background: 'var(--axs-surface)',
          borderBottom: '1px solid var(--axs-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: 'var(--axs-text)' }}>AQOND AXS</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--axs-text-muted)' }}>
            Sprint 22b component playground
          </p>
        </div>
        <Button variant="ghost" onClick={toggleTheme}>
          {theme === 'aqond-light' ? '🌙 Dark' : '☀️ Light'}
        </Button>
        <Link href="/design-system/registry" style={{ fontSize: 13, color: 'var(--axs-primary)', fontWeight: 700 }}>
          Sprint 29 Registry →
        </Link>
      </header>

      <main style={{ padding: 20, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)', marginBottom: 12 }}>Buttons</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="success">Success</Button>
            <Button variant="danger">Danger</Button>
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)', marginBottom: 12 }}>Status Chips</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <StatusChip tone="pending">รอร้าน</StatusChip>
            <StatusChip tone="delivering" live>กำลังส่ง</StatusChip>
            <StatusChip tone="completed">สำเร็จ</StatusChip>
            <StatusChip tone="online" live>ออนไลน์</StatusChip>
            <StatusChip tone="offline">ออฟไลน์</StatusChip>
          </div>
        </section>

        <Card>
          <CardHeader>Card + Form</CardHeader>
          <Input placeholder="ชื่อผู้รับ" style={{ marginBottom: 8 }} />
          <Badge tone="info">Badge info</Badge>
          <CardFooter>
            <Button variant="primary" style={{ width: '100%' }} onClick={() => setSheetOpen(true)}>
              เปิด Bottom Sheet
            </Button>
          </CardFooter>
        </Card>

        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)', marginBottom: 12 }}>Timeline</h2>
          <Card>
            <Timeline items={DEMO_TIMELINE} />
          </Card>
        </section>

        <section>
          <h2 style={{ fontSize: 14, color: 'var(--axs-text-muted)', marginBottom: 12 }}>Skeleton</h2>
          <SkeletonCard />
        </section>

        <EmptyState
          icon="📭"
          title="ยังไม่มีออเดอร์"
          description="เมื่อมีออเดอร์ใหม่ จะแสดงที่นี่"
          actionLabel="สำรวจร้านอาหาร"
          onAction={() => setDialogOpen(true)}
        />

        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          เปิด Dialog
        </Button>
      </main>

      <BottomNav
        items={[
          { id: 'home', label: 'หน้าหลัก', icon: '🏠', active: nav === 'home', onClick: () => setNav('home') },
          { id: 'orders', label: 'ออเดอร์', icon: '📋', active: nav === 'orders', onClick: () => setNav('orders') },
          { id: 'wallet', label: 'กระเป๋า', icon: '💰', active: nav === 'wallet', onClick: () => setNav('wallet') },
          { id: 'me', label: 'ฉัน', icon: '👤', active: nav === 'me', onClick: () => setNav('me') },
        ]}
      />

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="ยืนยันการสั่ง"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSheetOpen(false)} style={{ flex: 1 }}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)} style={{ flex: 1 }}>
              ยืนยัน
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--axs-text-secondary)' }}>
          Bottom Sheet มาตรฐาน AXS — radius 24px, drag handle, 200ms motion
        </p>
      </BottomSheet>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="AQOND Dialog"
        footer={
          <Button variant="primary" onClick={() => setDialogOpen(false)}>
            ตกลง
          </Button>
        }
      >
        <p style={{ margin: 0 }}>Dialog สำหรับยืนยันและแจ้งเตือนสำคัญ</p>
      </Dialog>
    </div>
  );
}
