'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FoodMenuItem } from '@/lib/food';
import type { FoodCartOptionLine } from '@/lib/foodOptions';
import { formatOptionsSummary, lineUnitMicro } from '@/lib/foodOptions';
import { formatCatalogPrice } from '@/lib/format';

type Props = {
  item: FoodMenuItem | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (selected: FoodCartOptionLine[]) => void;
  adding?: boolean;
};

export function TtFoodAddSheet({ item, open, onClose, onConfirm, adding }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setPicked(new Set());
  }, [open, item?.id]);

  const options = item?.options || [];

  const selectedLines = useMemo((): FoodCartOptionLine[] => {
    return options
      .filter((o) => picked.has(o.id))
      .map((o) => ({ option_id: o.id, label: o.label, price_micro: o.price_micro }));
  }, [options, picked]);

  const totalMicro = item ? lineUnitMicro(item.price_micro, selectedLines) : 0;

  if (!open || !item) return null;

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="tt-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="tt-food-add-sheet"
        role="dialog"
        aria-labelledby="food-add-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tt-sheet-handle" aria-hidden />
        {item.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt="" className="tt-food-add-sheet-img" />
        )}
        <h2 id="food-add-title" className="tt-food-add-title">{item.title}</h2>
        {item.description && <p className="tt-hint">{item.description}</p>}
        <p className="tt-food-add-base">ราคาเมนู {formatCatalogPrice(item.price_micro)}</p>

        {options.length > 0 ? (
          <div className="tt-food-options-block">
            <p className="tt-food-options-label">เลือกเพิ่มเติม (ติ๊กได้หลายรายการ)</p>
            <ul className="tt-food-options-list">
              {options.map((opt) => (
                <li key={opt.id}>
                  <label className={`tt-food-option-row${picked.has(opt.id) ? ' on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={picked.has(opt.id)}
                      onChange={() => toggle(opt.id)}
                    />
                    <span className="tt-food-option-name">{opt.label}</span>
                    <span className="tt-food-option-price">
                      {opt.price_micro > 0 ? `+${formatCatalogPrice(opt.price_micro)}` : 'ฟรี'}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {selectedLines.length > 0 && (
              <p className="tt-hint">เลือก: {formatOptionsSummary(selectedLines)}</p>
            )}
          </div>
        ) : (
          <p className="tt-hint">เมนูนี้ไม่มีตัวเลือกเสริม</p>
        )}

        <div className="tt-food-add-footer">
          <button type="button" className="tt-btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button
            type="button"
            className="tt-btn-primary"
            disabled={adding}
            onClick={() => onConfirm(selectedLines)}
          >
            {adding ? 'กำลังเพิ่ม…' : `เพิ่มลงรถเข็น · ${formatCatalogPrice(totalMicro)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
