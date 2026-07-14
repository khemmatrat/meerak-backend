'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCatalogPrice } from '@/lib/format';
import { addMerchantMenuItem, bulkCategorySoldOut, deleteMerchantMenuItem, fetchMerchantMenu, fetchMerchantProducts, toggleItemSoldOut } from '@/lib/merchant';
import { MENU_CATEGORIES } from '@/lib/menuCategories';
import { newOptionId } from '@/lib/foodOptions';
import type { FoodMenuOption } from '@/lib/foodOptions';
import { useAuth } from '@/lib/auth';
import { useMerchant } from '@/components/mobile/MerchantShell';
import { AxsMerchantLoading } from '@/components/axs/merchant/AxsMerchantLoading';

type OptionDraft = { id: string; label: string; priceBaht: string };

export default function MerchantMenuPage() {
  const { auth } = useAuth();
  const actor = auth?.userId || 'merchant';
  const { merchantId, isFoodMerchant, merchantName, permissions } = useMerchant();
  const [menu, setMenu] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceBaht, setPriceBaht] = useState('');
  const [spicy, setSpicy] = useState(false);
  const [popular, setPopular] = useState(false);
  const [optionDrafts, setOptionDrafts] = useState<OptionDraft[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stockBusy, setStockBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'sold_out' | 'restock' | 'price_delta'>('sold_out');
  const [priceDelta, setPriceDelta] = useState('10');
  const [formOpen, setFormOpen] = useState(true);
  const canEditMenu = permissions?.can_edit_menu !== false;

  const reload = useCallback(() => {
    setLoading(true);
    if (isFoodMerchant) {
      fetchMerchantMenu(merchantId)
        .then((d) => setMenu(d.menu || []))
        .catch(() => setMenu([]))
        .finally(() => setLoading(false));
    } else {
      fetchMerchantProducts(merchantId)
        .then((d) => setProducts(d.products || []))
        .catch(() => setProducts([]))
        .finally(() => setLoading(false));
    }
  }, [merchantId, isFoodMerchant]);

  useEffect(() => {
    reload();
  }, [reload]);

  const addOptionRow = () => {
    setOptionDrafts((rows) => [...rows, { id: newOptionId(), label: '', priceBaht: '0' }]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const baht = parseFloat(priceBaht);
    if (!title.trim() || !Number.isFinite(baht) || baht <= 0) {
      setMsg('กรุณากรอกชื่อและราคา');
      return;
    }
    setSaving(true);
    setMsg('');
    try {
      const options: FoodMenuOption[] = optionDrafts
        .filter((o) => o.label.trim())
        .map((o) => ({
          id: o.id || newOptionId(),
          label: o.label.trim(),
          price_micro: Math.max(0, Math.round((parseFloat(o.priceBaht) || 0) * 100)),
        }));
      await addMerchantMenuItem({
        merchant_id: merchantId,
        title: title.trim(),
        description: description.trim() || undefined,
        price_micro: Math.round(baht * 100),
        spicy,
        popular,
        options,
      });
      setTitle('');
      setDescription('');
      setPriceBaht('');
      setSpicy(false);
      setPopular(false);
      setOptionDrafts([]);
      setMsg('ok');
      reload();
      window.setTimeout(() => setMsg(''), 2800);
    } catch (err: any) {
      setMsg(err.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (itemId: string) => {
    if (!confirm('ลบรายการนี้?')) return;
    try {
      await deleteMerchantMenuItem(merchantId, itemId);
      reload();
    } catch {
      setMsg('ลบไม่สำเร็จ');
    }
  };

  const toggleSoldOut = async (itemId: string, soldOut: boolean, itemTitle?: string) => {
    setStockBusy(itemId);
    try {
      await toggleItemSoldOut(merchantId, itemId, soldOut, { actor, item_title: itemTitle });
      reload();
    } catch {
      setMsg('อัปเดตสต็อกไม่สำเร็จ');
    } finally {
      setStockBusy(null);
    }
  };

  const bulkSoldOut = async (categoryId: string, soldOut: boolean) => {
    setBulkBusy(categoryId);
    try {
      await bulkCategorySoldOut(merchantId, categoryId, soldOut, actor);
      reload();
    } catch {
      setMsg('อัปเดตหมวดไม่สำเร็จ');
    } finally {
      setBulkBusy(null);
    }
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((ids) => (ids.includes(itemId) ? ids.filter((x) => x !== itemId) : [...ids, itemId]));
  };

  const runBulkItems = async () => {
    if (!selectedIds.length) {
      setMsg('เลือกรายการก่อน');
      return;
    }
    setBulkBusy('items');
    setMsg('');
    try {
      const body: Record<string, unknown> = {
        merchant_id: merchantId,
        item_ids: selectedIds,
        action: bulkAction,
      };
      if (bulkAction === 'price_delta') {
        body.price_delta_percent = Number(priceDelta) || 0;
      }
      const res = await fetch('/api/merchant/menu/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'bulk failed');
      setSelectedIds([]);
      setMsg(`อัปเดต ${data.affected ?? selectedIds.length} รายการแล้ว`);
      reload();
    } catch (e: any) {
      setMsg(e.message || 'อัปเดตหลายรายการไม่สำเร็จ');
    } finally {
      setBulkBusy(null);
    }
  };

  if (!isFoodMerchant) {
    return (
      <div className="tt-menu-admin">
        <div className="tt-menu-admin-hero">
          <div className="tt-menu-admin-hero-text">
            <span className="tt-menu-admin-emoji">🛍️</span>
            <div>
              <h1 className="tt-menu-admin-title">{merchantName}</h1>
              <p className="tt-menu-admin-sub">จัดการสินค้า · ทำเครื่องหมายของหมด</p>
            </div>
          </div>
          <div className="tt-menu-admin-stat">
            <strong>{products.length}</strong>
            <span>สินค้า</span>
          </div>
        </div>

        {msg && msg !== 'ok' && <div className="tt-menu-admin-toast error">{msg}</div>}

        <section className="tt-menu-admin-list-section">
          <div className="tt-menu-list-head">
            <h2>📦 สินค้าในร้าน</h2>
            {!loading && <span className="tt-menu-list-count">{products.length} รายการ</span>}
          </div>
          {loading && <AxsMerchantLoading label="กำลังโหลดสินค้า…" />}
          {!loading && products.length === 0 && (
            <div className="tt-menu-empty">
              <span aria-hidden>📦</span>
              <p>ยังไม่มีสินค้าในร้านนี้</p>
            </div>
          )}
          <div className="tt-menu-item-cards">
            {products.map((p) => (
              <article key={p.id} className={`tt-menu-item-card tt-menu-product-card${p.sold_out ? ' sold-out' : ''}`}>
                <div className="tt-menu-product-row">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="tt-menu-product-thumb" />
                  ) : (
                    <span className="tt-menu-product-thumb tt-menu-product-thumb-empty" aria-hidden>
                      📦
                    </span>
                  )}
                  <div className="tt-menu-product-body">
                    <div className="tt-menu-item-top">
                      <div className="tt-menu-item-main">
                        <h3>{p.title}</h3>
                        <p className="tt-menu-product-code">รหัส {p.product_code || p.id}</p>
                        {p.sold_out && <span className="tt-badge-sold-out">🚫 ของหมด</span>}
                        {p.has_video && <span className="tt-badge-video">🎬 มีวิดีโอ</span>}
                      </div>
                      <div className="tt-menu-item-price">{formatCatalogPrice(p.price_micro)}</div>
                    </div>
                  </div>
                </div>
                <Link
                  href={`/m/merchant/ad-studio?product_id=${encodeURIComponent(p.id)}`}
                  className="tt-btn-ghost tt-menu-add-video"
                >
                  🎬 เพิ่มวิดีโอให้สินค้านี้
                </Link>
                <button
                  type="button"
                  className={`tt-menu-stock-btn${p.sold_out ? ' restore' : ''}`}
                  disabled={stockBusy === p.id || !canEditMenu}
                  onClick={() => void toggleSoldOut(p.id, !p.sold_out, p.title)}
                >
                  {p.sold_out ? '✅ มีของแล้ว' : '🚫 ของหมด'}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="tt-menu-admin">
      <div className="tt-menu-admin-hero">
        <div className="tt-menu-admin-hero-text">
          <span className="tt-menu-admin-emoji">🍽️</span>
          <div>
            <h1 className="tt-menu-admin-title">{merchantName}</h1>
            <p className="tt-menu-admin-sub">จัดการเมนู · ลูกค้าเห็นทันที</p>
          </div>
        </div>
        <div className="tt-menu-admin-stat">
          <strong>{menu.length}</strong>
          <span>รายการ</span>
        </div>
      </div>

      {msg === 'ok' && (
        <div className="tt-menu-admin-toast success">✅ เพิ่มเมนูแล้ว — ลูกค้าเห็นทันที</div>
      )}
      {msg && msg !== 'ok' && (
        <div className="tt-menu-admin-toast error">{msg}</div>
      )}

      {!canEditMenu && (
        <p className="tt-merchant-warn">บัญชีพนักงาน — ดูเมนูได้ แต่แก้/ปิดของหมดไม่ได้</p>
      )}

      {canEditMenu && (
      <section className="tt-menu-admin-card">
        <button
          type="button"
          className="tt-menu-admin-card-head"
          onClick={() => setFormOpen((v) => !v)}
          aria-expanded={formOpen}
        >
          <span className="tt-menu-admin-card-icon">✨</span>
          <span className="tt-menu-admin-card-title">สร้างเมนูใหม่</span>
          <span className="tt-menu-admin-chevron">{formOpen ? '▾' : '▸'}</span>
        </button>

        {formOpen && (
          <form className="tt-menu-admin-form" onSubmit={(e) => void submit(e)}>
            <label className="tt-menu-field">
              <span>ชื่อเมนู</span>
              <input
                className="tt-input tt-menu-input"
                placeholder="เช่น ข้าวผัดกุ้ง"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="tt-menu-field">
              <span>คำอธิบาย</span>
              <input
                className="tt-input tt-menu-input"
                placeholder="สั้นๆ ไม่บังคับ"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="tt-menu-field tt-menu-field-price">
              <span>ราคา</span>
              <div className="tt-menu-price-wrap">
                <span className="tt-menu-currency">฿</span>
                <input
                  className="tt-input tt-menu-input"
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="0.00"
                  value={priceBaht}
                  onChange={(e) => setPriceBaht(e.target.value)}
                />
              </div>
            </label>

            <div className="tt-menu-tag-row">
              <button
                type="button"
                className={`tt-menu-tag${spicy ? ' on' : ''}`}
                onClick={() => setSpicy((v) => !v)}
              >
                🌶️ เผ็ด
              </button>
              <button
                type="button"
                className={`tt-menu-tag${popular ? ' on' : ''}`}
                onClick={() => setPopular((v) => !v)}
              >
                ⭐ ยอดนิยม
              </button>
            </div>

            <div className="tt-menu-options-panel">
              <div className="tt-menu-options-head">
                <div>
                  <p className="tt-menu-options-title">☑️ ตัวเลือกเสริม</p>
                  <p className="tt-menu-options-desc">ลูกค้าติ๊กตอนสั่ง · 0 บาท = ฟรี</p>
                </div>
                <button type="button" className="tt-menu-add-opt" onClick={addOptionRow}>
                  + เพิ่ม
                </button>
              </div>

              {optionDrafts.length === 0 && (
                <p className="tt-menu-options-empty">ยังไม่มีตัวเลือก — กด + เพิ่ม หรือข้ามได้</p>
              )}

              {optionDrafts.map((row, idx) => (
                <div key={row.id} className="tt-menu-opt-row">
                  <span className="tt-menu-opt-num">{idx + 1}</span>
                  <input
                    className="tt-input tt-menu-input"
                    placeholder="ชื่อ เช่น วาซาบิ"
                    value={row.label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setOptionDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, label: v } : r)));
                    }}
                  />
                  <div className="tt-menu-opt-price">
                    <span>+฿</span>
                    <input
                      className="tt-input tt-menu-input"
                      type="number"
                      step="1"
                      min="0"
                      value={row.priceBaht}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOptionDrafts((rows) => rows.map((r, i) => (i === idx ? { ...r, priceBaht: v } : r)));
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="tt-menu-opt-del"
                    aria-label="ลบตัวเลือก"
                    onClick={() => setOptionDrafts((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button type="submit" className="tt-btn-primary tt-menu-submit" disabled={saving}>
              {saving ? 'กำลังบันทึก…' : '✓ เพิ่มเมนู'}
            </button>
          </form>
        )}
      </section>
      )}

      {canEditMenu && (
        <section className="tt-menu-bulk-section">
          <h2>⚡ Bulk เมนูที่เลือก ({selectedIds.length})</h2>
          <div className="tt-menu-bulk-row">
            <select className="tt-input" value={bulkAction} onChange={(e) => setBulkAction(e.target.value as typeof bulkAction)}>
              <option value="sold_out">ปิดของหมด</option>
              <option value="restock">เปิดขาย</option>
              <option value="price_delta">ปรับราคา %</option>
            </select>
            {bulkAction === 'price_delta' && (
              <input className="tt-input" inputMode="numeric" value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} placeholder="%" />
            )}
            <button type="button" className="tt-btn-primary tt-merchant-mini-btn" disabled={bulkBusy === 'items' || !selectedIds.length} onClick={() => void runBulkItems()}>
              ใช้กับที่เลือก
            </button>
          </div>
        </section>
      )}

      {canEditMenu && (
        <section className="tt-menu-bulk-section">
          <h2>📦 ปิดทั้งหมวด (วัตถุดิบหมด)</h2>
          <p className="tt-hint">เช่น เครื่องดื่มหมดทั้งหมด — ระบบจัดกลุ่มจากชื่อเมนู</p>
          <div className="tt-menu-bulk-row">
            {MENU_CATEGORIES.map((cat) => (
              <div key={cat.id} className="tt-menu-bulk-btns">
                <span className="tt-menu-bulk-label">{cat.label}</span>
                <button
                  type="button"
                  className="tt-btn-ghost tt-merchant-mini-btn"
                  disabled={bulkBusy === cat.id}
                  onClick={() => void bulkSoldOut(cat.id, true)}
                >
                  🚫 หมดทั้งหมวด
                </button>
                <button
                  type="button"
                  className="tt-btn-ghost tt-merchant-mini-btn"
                  disabled={bulkBusy === cat.id}
                  onClick={() => void bulkSoldOut(cat.id, false)}
                >
                  ✅ เปิดทั้งหมวด
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="tt-menu-admin-list-section">
        <div className="tt-menu-list-head">
          <h2>📋 เมนูปัจจุบัน</h2>
          {!loading && <span className="tt-menu-list-count">{menu.length} รายการ</span>}
        </div>

        {loading && <AxsMerchantLoading label="กำลังโหลดเมนู…" />}

        {!loading && menu.length === 0 && (
          <div className="tt-menu-empty">
            <span aria-hidden>🍜</span>
            <p>ยังไม่มีเมนู — สร้างรายการแรกด้านบน</p>
          </div>
        )}

        <div className="tt-menu-item-cards">
          {menu.map((it) => (
            <article key={it.id} className={`tt-menu-item-card${it.sold_out ? ' sold-out' : ''}`}>
              {canEditMenu && (
                <label className="tt-menu-bulk-check">
                  <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggleSelect(it.id)} />
                  เลือก
                </label>
              )}
              <div className="tt-menu-item-top">
                <div className="tt-menu-item-main">
                  <h3>{it.title}</h3>
                  <div className="tt-menu-item-badges">
                    {it.sold_out && <span className="tt-badge-sold-out">🚫 ของหมด</span>}
                    {it.popular && !it.sold_out && <span className="tt-badge-pop">⭐ ยอดนิยม</span>}
                    {it.spicy && <span className="tt-badge-spicy">🌶️ เผ็ด</span>}
                  </div>
                  {it.description && <p className="tt-menu-item-desc">{it.description}</p>}
                </div>
                <div className="tt-menu-item-price">{formatCatalogPrice(it.price_micro)}</div>
              </div>

              {Array.isArray(it.options) && it.options.length > 0 && (
                <div className="tt-menu-item-options">
                  {it.options.map((o: any) => (
                    <span
                      key={o.id}
                      className={`tt-menu-opt-chip${o.price_micro > 0 ? ' paid' : ''}`}
                    >
                      {o.label}
                      {o.price_micro > 0 ? ` +${formatCatalogPrice(o.price_micro)}` : ' · ฟรี'}
                    </span>
                  ))}
                </div>
              )}

              <div className="tt-menu-item-actions">
                <button
                  type="button"
                  className={`tt-menu-stock-btn${it.sold_out ? ' restore' : ''}`}
                  disabled={stockBusy === it.id || !canEditMenu}
                  onClick={() => void toggleSoldOut(it.id, !it.sold_out, it.title)}
                >
                  {it.sold_out ? '✅ มีของแล้ว' : '🚫 ของหมด'}
                </button>
                {canEditMenu && (
                <button
                  type="button"
                  className="tt-menu-item-del"
                  onClick={() => void remove(it.id)}
                >
                  🗑️ ลบ
                </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
