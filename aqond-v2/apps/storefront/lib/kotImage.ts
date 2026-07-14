export function renderKotToBlob(order: {
  order_id?: string;
  id?: string;
  merchant_name?: string;
  recipient?: string;
  phone?: string;
  handoff_note?: string;
  items?: any[];
  created_at?: string;
}): Promise<Blob | null> {
  return new Promise((resolve) => {
    const W = 320;
    const items = Array.isArray(order.items) ? order.items : [];
    const lineH = 22;
    const H = 180 + items.length * lineH * 2;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(null);
      return;
    }

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('🍳 ใบออเดอร์ครัว KOT', 12, 24);
    ctx.font = '12px sans-serif';
    const oid = String(order.order_id || order.id || '').slice(-8);
    ctx.fillText(`#${oid} · ${order.merchant_name || 'ร้าน'}`, 12, 44);
    if (order.created_at) {
      ctx.fillText(new Date(order.created_at).toLocaleString('th-TH'), 12, 60);
    }
    if (order.recipient || order.phone) {
      ctx.fillText(`👤 ${order.recipient || ''} ${order.phone || ''}`.trim(), 12, 78);
    }
    if (order.handoff_note) {
      ctx.fillText(`📝 ${order.handoff_note}`, 12, 96);
    }

    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('— รายการ —', 12, 118);
    let y = 138;
    ctx.font = '12px sans-serif';
    for (const it of items) {
      const qty = it.qty || 1;
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`${qty}x ${it.title || it.product_id}`, 12, y);
      y += lineH;
      const opts = it.options || it.selected_options;
      if (Array.isArray(opts) && opts.length) {
        ctx.font = '11px sans-serif';
        ctx.fillStyle = '#444';
        ctx.fillText(`  + ${opts.map((o: any) => o.label || o.name).join(', ')}`, 12, y);
        ctx.fillStyle = '#111';
        y += lineH;
      }
    }

    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(4, 4, W - 8, H - 8);

    canvas.toBlob((b) => resolve(b), 'image/png');
  });
}

export async function shareKotImage(order: Parameters<typeof renderKotToBlob>[0]) {
  const blob = await renderKotToBlob(order);
  if (!blob) {
    window.print();
    return;
  }
  const file = new File([blob], `kot-${String(order.order_id || order.id).slice(-8)}.png`, { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'ใบออเดอร์ครัว' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  URL.revokeObjectURL(url);
}
