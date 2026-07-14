'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, EmptyState, Input, StatusChip } from '@aqond/ui';
import { formatCatalogPrice } from '@/lib/format';
import { DISPUTE_STATUS_LABELS } from '@/lib/disputePolicy';
import { AxsAdminLoading } from '@/components/axs/admin/AxsAdminLoading';
import { ADMIN_KEY_STORAGE, adminPost } from '@/components/axs/admin/adminApi';

const NEXUS_ADMIN_URL =
  process.env.NEXT_PUBLIC_NEXUS_ADMIN_URL || 'http://localhost:3002';

function BreakGlassBanner() {
  return (
    <div className="axs-breakglass-banner" role="alert">
      <strong>ฉุกเฉินเท่านั้น (Break-glass)</strong>
      <p>
        ใช้เมื่อ nexus-admin ใช้ไม่ได้ — งานหลัก (Food OS, dispatch, analytics) ทำที่{' '}
        <a href={NEXUS_ADMIN_URL} target="_blank" rel="noopener noreferrer">
          Nexus Admin
        </a>
      </p>
    </div>
  );
}

export default function AdminBreakGlassPage() {
  const [key, setKey] = useState('');
  const [authed, setAuthed] = useState(false);
  const [dash, setDash] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (saved) {
      setKey(saved);
      setAuthed(true);
    }
  }, []);

  const adminKey = () => sessionStorage.getItem(ADMIN_KEY_STORAGE) || key;

  const logout = useCallback(() => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setAuthed(false);
    setKey('');
    setDash(null);
    setErr('');
  }, []);

  const handleAdminError = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'admin error';
      if (msg === 'unauthorized') {
        logout();
        setErr('key ไม่ถูกต้อง — ลองใหม่ (dev: aqond-admin-dev)');
        return;
      }
      setErr(msg);
    },
    [logout],
  );

  const reload = useCallback(() => {
    const k = adminKey();
    if (!k) return;
    setLoading(true);
    setErr('');
    adminPost('/api/admin', k)
      .then(setDash)
      .catch(handleAdminError)
      .finally(() => setLoading(false));
  }, [key, handleAdminError]);

  useEffect(() => {
    if (authed) reload();
  }, [authed, reload]);

  const login = () => {
    if (!key.trim()) {
      setErr('กรุณาใส่ break-glass key');
      return;
    }
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key.trim());
    setAuthed(true);
    setErr('');
  };

  const act = async (body: object) => {
    const k = adminKey();
    setErr('');
    setMsg('');
    try {
      await adminPost('/api/admin', k, body);
      setMsg('สำเร็จ');
      reload();
    } catch (e: unknown) {
      handleAdminError(e);
    }
  };

  if (!authed) {
    return (
      <div className="axs-admin-page">
        <header className="tt-header">
          <div className="tt-header-row">
            <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
            <span style={{ flex: 1, fontWeight: 700 }}>Break-glass Ops</span>
          </div>
        </header>
        <BreakGlassBanner />
        <div className="axs-admin-login">
          <Card>
            <p className="tt-hint" style={{ margin: 0 }}>
              ไม่ใช่หน้าสำหรับร้านค้า/ลูกค้า — เฉพาะทีม Ops ฉุกเฉิน
            </p>
            <p className="tt-hint" style={{ margin: '8px 0 0' }}>
              คอนโซลหลัก:{' '}
              <a href={NEXUS_ADMIN_URL} target="_blank" rel="noopener noreferrer">
                {NEXUS_ADMIN_URL}
              </a>
            </p>
            <Input
              type="password"
              placeholder="Break-glass key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="Break-glass key"
            />
            {process.env.NEXT_PUBLIC_AQOND_LOCAL_DEV === '1' && (
              <p className="tt-hint" style={{ margin: '8px 0 0' }}>
                Dev key: <code>aqond-admin-dev</code>
              </p>
            )}
            <Button type="button" variant="primary" onClick={login} style={{ width: '100%' }}>
              เข้าใช้งานฉุกเฉิน
            </Button>
            {err && <p className="axs-admin-msg-err" style={{ margin: 0 }}>{err}</p>}
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="axs-admin-page">
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/account" className="tt-back" aria-label="กลับ">‹</Link>
          <span style={{ flex: 1, fontWeight: 700 }}>Break-glass Ops</span>
          <button type="button" className="tt-merchant-refresh" onClick={reload}>
            รีเฟรช
          </button>
        </div>
      </header>

      <BreakGlassBanner />

      <div className="axs-breakglass-actions">
        <button type="button" className="tt-btn-ghost" onClick={logout}>
          ออกจาก break-glass
        </button>
        <a href={NEXUS_ADMIN_URL} target="_blank" rel="noopener noreferrer" className="tt-link-accent">
          เปิด Nexus Admin →
        </a>
      </div>

      {msg && <p className="axs-admin-msg-ok">{msg}</p>}
      {err && <p className="axs-admin-msg-err">{err}</p>}
      {loading && <AxsAdminLoading label="กำลังโหลด…" />}

      {!loading && (
        <>
          <section className="axs-admin-section">
            <h2>ร้านรออนุมัติ ({dash?.pending_shops?.length ?? 0})</h2>
            {(dash?.pending_shops || []).length === 0 ? (
              <EmptyState icon="🏪" title="ไม่มีร้านรออนุมัติ" />
            ) : (
              <ul className="axs-admin-list">
                {(dash?.pending_shops || []).map((s: any) => (
                  <li key={s.id} className="axs-admin-row">
                    <div>
                      <strong>{s.name}</strong>
                      <span className="tt-hint"> · {s.owner_id}</span>
                    </div>
                    <div className="axs-admin-actions">
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void act({ action: 'approve_shop', shop_id: s.id, owner_id: s.owner_id })}
                      >
                        อนุมัติ
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void act({ action: 'reject_shop', shop_id: s.id, reason: 'ไม่ผ่าน' })}
                      >
                        ปฏิเสธ
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="axs-admin-section">
            <h2>ข้อพิพาทเปิด ({dash?.open_disputes?.length ?? 0})</h2>
            {(dash?.open_disputes || []).length === 0 ? (
              <EmptyState icon="⚖️" title="ไม่มีข้อพิพาทเปิด" />
            ) : (
              <ul className="axs-admin-list">
                {(dash?.open_disputes || []).map((c: any) => (
                  <li key={c.id} className="axs-admin-row">
                    <div>
                      <strong>{c.title}</strong>
                      <StatusChip tone="warning" style={{ marginLeft: 8 }}>
                        {DISPUTE_STATUS_LABELS[c.status as keyof typeof DISPUTE_STATUS_LABELS]}
                      </StatusChip>
                      <p className="tt-hint" style={{ margin: '4px 0 0' }}>
                        พัก {formatCatalogPrice(c.held_amount_micro)}
                      </p>
                    </div>
                    <div className="axs-admin-actions">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void act({ action: 'resolve_dispute', case_id: c.id, resolve_action: 'refund', note: 'Break-glass คืนเงิน' })}
                      >
                        คืนเงิน
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={() => void act({ action: 'resolve_dispute', case_id: c.id, resolve_action: 'release_hold', note: 'Break-glass ปลดพัก' })}
                      >
                        ปลดพัก
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
