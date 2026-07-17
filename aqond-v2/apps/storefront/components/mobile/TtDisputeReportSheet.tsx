'use client';

import { useMemo, useState } from 'react';
import {
  FOOD_DISPUTE_TYPES,
  MARKETPLACE_DISPUTE_TYPES,
  PHOTO_REQUIRED_CLAIMS,
  type DisputeCategory,
} from '@/lib/disputePolicy';
import { submitCustomerDispute } from '@/lib/disputesClient';

type OrderItem = {
  product_id?: string;
  item_id?: string;
  title?: string;
  qty?: number;
  unit_price_micro?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  orderId: string;
  merchantId: string;
  customerId: string;
  orderType: 'food' | 'marketplace';
  orderTotalMicro: number;
  items: OrderItem[];
  onSubmitted?: () => void;
};

export function TtDisputeReportSheet({
  open,
  onClose,
  orderId,
  merchantId,
  customerId,
  orderType,
  orderTotalMicro,
  items,
  onSubmitted,
}: Props) {
  const categories = useMemo(
    () => (orderType === 'food' ? FOOD_DISPUTE_TYPES : MARKETPLACE_DISPUTE_TYPES),
    [orderType],
  );
  const [category, setCategory] = useState<DisputeCategory>(categories[0].id);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  if (!open) return null;

  const toggleMissing = (id: string) => {
    setMissingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!title.trim()) {
      setErr('กรุณาระบุหัวข้อ');
      return;
    }
    if (PHOTO_REQUIRED_CLAIMS.has(category as any) && !file) {
      setErr('กรุณาแนบรูปหลักฐานสำหรับเคสนี้');
      return;
    }
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const mapped = items.map((it, idx) => {
        const pid = String(it.product_id || it.item_id || `item-${idx}`);
        const missing = category === 'missing_items' && missingIds.has(pid);
        return {
          product_id: pid,
          title: it.title || pid,
          qty: it.qty || 1,
          unit_price_micro: it.unit_price_micro || 0,
          received: !missing,
        };
      });
      await submitCustomerDispute({
        order_id: orderId,
        merchant_id: merchantId,
        customer_id: customerId,
        order_type: orderType,
        category,
        title: title.trim(),
        description: description.trim(),
        order_total_micro: orderTotalMicro,
        items: mapped,
        evidence_file: file,
      });
      setOk('ส่งเรื่องแล้ว — เงินพักกับแพลตฟอร์ม');
      onSubmitted?.();
      window.setTimeout(() => {
        onClose();
        setOk('');
        setTitle('');
        setDescription('');
        setFile(null);
      }, 1800);
    } catch (e: any) {
      setErr(e.message || 'ส่งไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-sheet-backdrop" role="presentation" onClick={onClose}>
      <div className="tt-dispute-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="tt-merchant-order-sheet-head">
          <h2>🛡️ แจ้งปัญหา / ข้อพิพาท</h2>
          <button type="button" className="tt-merchant-picker-close" onClick={onClose}>✕</button>
        </div>
        <p className="tt-hint">ออเดอร์ #{String(orderId).slice(-8)} · เงินจะถูกพักไว้กับแพลตฟอร์ม</p>

        <label className="tt-menu-field">
          <span>ประเภทปัญหา</span>
          <select
            className="tt-merchant-sound-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as DisputeCategory)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>

        <label className="tt-menu-field">
          <span>หัวข้อ</span>
          <input className="tt-input tt-menu-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="สรุปปัญหาสั้นๆ" />
        </label>

        <label className="tt-menu-field">
          <span>รายละเอียด</span>
          <textarea className="tt-review-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="อธิบายเหตุการณ์" />
        </label>

        {category === 'missing_items' && items.length > 0 && (
          <div className="tt-dispute-missing">
            <p className="tt-menu-options-title">รายการที่ไม่ได้รับ</p>
            {items.map((it, idx) => {
              const pid = String(it.product_id || it.item_id || `item-${idx}`);
              return (
                <label key={pid} className="tt-merchant-check-row">
                  <input type="checkbox" checked={missingIds.has(pid)} onChange={() => toggleMissing(pid)} />
                  {it.title || pid} x{it.qty || 1}
                </label>
              );
            })}
          </div>
        )}

        <label className="tt-menu-field">
          <span>
            แนบคลิป / วิดีโอ / รูป
            {PHOTO_REQUIRED_CLAIMS.has(category as any) ? ' (จำเป็น)' : ' (ไม่บังคับ, สูงสุด 8MB)'}
          </span>
          <input
            type="file"
            accept="video/*,image/*"
            className="tt-dispute-file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          {file && <p className="tt-hint">📎 {file.name}</p>}
        </label>

        {err && <p className="tt-error-inline">{err}</p>}
        {ok && <p className="tt-merchant-ok">{ok}</p>}

        <button type="button" className="tt-btn-primary" disabled={busy} onClick={() => void submit()}>
          {busy ? 'กำลังส่ง…' : 'ส่งเรื่องแจ้งปัญหา'}
        </button>
      </div>
    </div>
  );
}
