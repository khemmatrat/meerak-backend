'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, StatusChip } from '@aqond/ui';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice, formatDate } from '@/lib/format';
import { FULFILLMENT_LABELS, fetchMerchantOrders, fetchOrderPickupQr, runAutoAcceptOrders, updateOrderFulfillment, uploadPackingProof } from '@/lib/merchant';
import { merchantPollIntervalMs } from '@/lib/merchantPush';
import { orderAcceptSlaState, MERCHANT_ACCEPT_SLA_MINUTES } from '@/lib/orderSla';
import { markOrdersSeen } from '@/lib/merchantAlerts';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { AxsMerchantLoading } from '@/components/axs/merchant/AxsMerchantLoading';
import { merchantFulfillmentTone } from '@/components/axs/merchant/merchantStatusChip';
import { TtKitchenTicket } from '@/components/mobile/TtKitchenTicket';
import { TtMerchantOrderDetail } from '@/components/mobile/TtMerchantOrderDetail';
import { MerchantPackingProofSheet } from '@/components/mobile/MerchantPackingProofSheet';
import { MerchantOrderQrCard } from '@/components/mobile/MerchantOrderQrCard';

export default function MerchantOrdersPage() {
  const { auth } = useAuth();
  const { merchantId, refreshShops, permissions } = useMerchant();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [warning, setWarning] = useState('');
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [kotOrder, setKotOrder] = useState<any | null>(null);
  const [packingOrder, setPackingOrder] = useState<any | null>(null);
  const [packingBusy, setPackingBusy] = useState(false);
  const [qrOrder, setQrOrder] = useState<any | null>(null);
  const [qrData, setQrData] = useState<{ qr_image_url: string; encoded: string } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const canAccept = permissions?.can_accept_orders !== false;

  const reload = useCallback(() => {
    setLoading(true);
    setWarning('');
    runAutoAcceptOrders(merchantId)
      .catch(() => ({}))
      .finally(() => {
        fetchMerchantOrders(merchantId)
          .then((d) => {
            const list = d.orders || [];
            setOrders(list);
            const pendingIds = list
              .filter((o) => ['pending_accept', 'pending_ship'].includes(o.fulfillment_status || ''))
              .map((o) => String(o.order_id || o.id));
            markOrdersSeen(merchantId, pendingIds);
            refreshShops();
            if (d.warning) setWarning('ออเดอร์จากเครื่อง (order-svc offline)');
          })
          .catch((e) => {
            setOrders([]);
            setWarning(e.message || 'โหลดไม่สำเร็จ');
          })
          .finally(() => setLoading(false));
      });
  }, [merchantId, refreshShops]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, merchantPollIntervalMs());
    return () => clearInterval(t);
  }, [reload]);

  const act = async (orderId: string, status: string, tracking?: string) => {
    setBusy(orderId);
    try {
      await updateOrderFulfillment(orderId, status, {
        actor: auth?.userId || 'merchant',
        tracking_no: tracking,
      });
      reload();
    } catch (e: any) {
      const msg = e.message || 'อัปเดตไม่สำเร็จ';
      setWarning(msg.includes('packing') || msg.includes('แพ็ค') ? msg : msg);
    } finally {
      setBusy(null);
    }
  };

  const uploadPacking = async (dataUrl: string) => {
    if (!packingOrder) return;
    const oid = packingOrder.order_id || packingOrder.id;
    setPackingBusy(true);
    setWarning('');
    try {
      await uploadPackingProof(oid, merchantId, dataUrl, auth?.userId || 'merchant');
      setPackingOrder(null);
      reload();
    } catch (e: any) {
      setWarning(e.message || 'อัปโหลดรูปแพ็คไม่สำเร็จ');
    } finally {
      setPackingBusy(false);
    }
  };

  const openPickupQr = async (o: any) => {
    const oid = o.order_id || o.id;
    setQrOrder(o);
    setQrData(null);
    setQrBusy(true);
    try {
      const data = await fetchOrderPickupQr(oid, merchantId);
      setQrData({ qr_image_url: data.qr_image_url, encoded: data.encoded });
    } catch (e: any) {
      setWarning(e.message || 'โหลด QR ไม่สำเร็จ');
      setQrOrder(null);
    } finally {
      setQrBusy(false);
    }
  };

  const active = orders.filter(
    (o) => !['delivered', 'rejected'].includes(o.fulfillment_status || ''),
  );

  return (
    <>
      <div className="tt-merchant-page-head">
        <h1 className="tt-merchant-page-title">🔔 รับออเดอร์</h1>
        <button type="button" className="tt-merchant-refresh" onClick={reload}>รีเฟรช</button>
      </div>
      <p className="tt-merchant-sla-hint">SLA รับออเดอร์ภายใน {MERCHANT_ACCEPT_SLA_MINUTES} นาที — เกินแล้วแจ้งเตือนด่วน</p>

      {warning && <p className="tt-merchant-warn">{warning}</p>}
      {loading && <AxsMerchantLoading label="กำลังโหลดคิวออเดอร์…" />}

      {!loading && active.length === 0 && (
        <EmptyState
          icon="✓"
          title="ไม่มีออเดอร์ค้าง"
          description="ออเดอร์ใหม่จะโผล่ที่นี่ทันที (รีเฟรชอัตโนมัติทุก 15 วิ)"
        />
      )}

      <div className="tt-merchant-queue">
        {active.map((o) => {
          const oid = o.order_id || o.id;
          const fs = o.fulfillment_status || 'pending_accept';
          const isFood = o.order_type === 'food';
          const isOnDemand = isFood || o.carrier_id === 'aqond-rider';
          const itemCount = Array.isArray(o.items) ? o.items.length : 0;
          const sla = orderAcceptSlaState(o);
          return (
            <div key={oid} className={`tt-merchant-order-card${sla.breached ? ' sla-breach' : ''}`}>
              {sla.breached && (
                <p className="tt-merchant-sla-alert">🚨 SLA เกิน {sla.sla_minutes} นาที — รอ {sla.minutes_waiting} นาทีแล้ว!</p>
              )}
              {!sla.breached && (fs === 'pending_accept' || fs === 'pending_ship') && sla.remaining_minutes <= 2 && (
                <p className="tt-merchant-sla-warn">⏱️ เหลือ ~{sla.remaining_minutes} นาที ก่อนเกิน SLA</p>
              )}
              <div className="tt-order-head">
                <strong>{isFood ? '🍱 ' : isOnDemand ? '🛵 ' : '📦 '}#{String(oid).slice(-8)}</strong>
                <StatusChip tone={merchantFulfillmentTone(fs)} live={fs === 'pending_accept' || fs === 'preparing'}>
                  {FULFILLMENT_LABELS[fs] || fs}
                </StatusChip>
              </div>
              <p className="tt-order-meta">
                {formatCatalogPrice(o.amount_micro || o.total_micro)}
                {o.created_at && ` · ${formatDate(o.created_at)}`}
              </p>
              {o.recipient && <p className="tt-hint">👤 {o.recipient} · {o.phone}</p>}
              {itemCount > 0 && (
                <p className="tt-hint">
                  🛒 {itemCount} รายการ — {(o.items as any[]).slice(0, 2).map((it) => `${it.title || it.product_id} x${it.qty || 1}`).join(', ')}
                  {itemCount > 2 ? '…' : ''}
                </p>
              )}
              <div className="tt-merchant-actions">
                <button
                  type="button"
                  className="tt-btn-ghost tt-merchant-btn tt-merchant-detail-btn"
                  onClick={() => setDetailOrder(o)}
                >
                  ดูรายการ
                </button>
                {isFood && (
                  <button
                    type="button"
                    className="tt-btn-ghost tt-merchant-btn"
                    onClick={() => setKotOrder(o)}
                  >
                    🍳 KOT
                  </button>
                )}
                {isFood && ['preparing', 'ready'].includes(fs) && (
                  <button
                    type="button"
                    className="tt-btn-ghost tt-merchant-btn"
                    disabled={qrBusy}
                    onClick={() => void openPickupQr(o)}
                  >
                    📱 QR รับออเดอร์
                  </button>
                )}
                {!canAccept ? (
                  <p className="tt-hint">บัญชีพนักงาน — ไม่มีสิทธิ์รับออเดอร์</p>
                ) : fs === 'pending_accept' || fs === 'pending_ship' ? (
                  <>
                    <button type="button" className="tt-btn-primary tt-merchant-btn" disabled={busy === oid} onClick={() => void act(oid, 'accepted')}>
                      รับออเดอร์
                    </button>
                    <button type="button" className="tt-btn-ghost tt-merchant-btn" disabled={busy === oid} onClick={() => void act(oid, 'rejected')}>
                      ปฏิเสธ
                    </button>
                  </>
                ) : fs === 'accepted' ? (
                  <button type="button" className="tt-btn-primary tt-merchant-btn" disabled={busy === oid} onClick={() => void act(oid, 'preparing')}>
                    เริ่มเตรียม
                  </button>
                ) : fs === 'preparing' ? (
                  <>
                    {isFood && o.has_packing_proof && o.packing_proof_url && (
                      <div className="tt-merchant-packing-thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={o.packing_proof_url} alt="รูปแพ็คอาหาร" />
                        <span className="tt-hint">✓ แพ็คแล้ว</span>
                      </div>
                    )}
                    {isFood && !o.has_packing_proof && (
                      <button
                        type="button"
                        className="tt-btn-ghost tt-merchant-btn"
                        disabled={packingBusy}
                        onClick={() => setPackingOrder(o)}
                      >
                        📷 ถ่ายรูปแพ็ค
                      </button>
                    )}
                    <button
                      type="button"
                      className="tt-btn-primary tt-merchant-btn"
                      disabled={busy === oid || (isFood && !o.has_packing_proof)}
                      onClick={() => void act(oid, 'ready')}
                    >
                      {isFood ? 'อาหารพร้อม — เรียกไรเดอร์' : isOnDemand ? 'พัสดุพร้อม — เรียกไรเดอร์' : 'พร้อมส่ง'}
                    </button>
                  </>
                ) : fs === 'ready' && !isOnDemand ? (
                  <button type="button" className="tt-btn-primary tt-merchant-btn" disabled={busy === oid} onClick={() => void act(oid, 'shipped')}>
                    ส่งมอบขนส่ง (สร้างใบปะหน้า)
                  </button>
                ) : fs === 'ready' && isOnDemand ? (
                  <p className="tt-hint">🛵 รอไรเดอร์มารับ — dispatch กำลังหาไรเดอร์</p>
                ) : fs === 'shipped' && isOnDemand ? (
                  <p className="tt-hint">🛵 ไรเดอร์กำลังนำส่ง — {o.tracking_no ? `#${o.tracking_no}` : 'ติดตามในแอปลูกค้า'}</p>
                ) : fs === 'shipped' && !isOnDemand ? (
                  <button type="button" className="tt-btn-primary tt-merchant-btn" disabled={busy === oid} onClick={() => void act(oid, 'delivered')}>
                    ส่งสำเร็จ (COD)
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <TtMerchantOrderDetail
        order={detailOrder}
        open={!!detailOrder}
        onClose={() => setDetailOrder(null)}
      />
      <TtKitchenTicket
        order={kotOrder}
        open={!!kotOrder}
        onClose={() => setKotOrder(null)}
      />
      <MerchantPackingProofSheet
        open={!!packingOrder}
        onClose={() => !packingBusy && setPackingOrder(null)}
        onCapture={(url) => void uploadPacking(url)}
        busy={packingBusy}
      />
      {qrOrder && (
        <div className="tt-sheet-backdrop" role="presentation" onClick={() => !qrBusy && setQrOrder(null)}>
          <div className="tt-sheet tt-merchant-qr-sheet" role="dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="tt-sheet-close" aria-label="ปิด" onClick={() => setQrOrder(null)}>×</button>
            {qrBusy && <p className="tt-hint">กำลังโหลด QR…</p>}
            {qrData && (
              <MerchantOrderQrCard
                orderId={qrOrder.order_id || qrOrder.id}
                qrImageUrl={qrData.qr_image_url}
                encoded={qrData.encoded}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
