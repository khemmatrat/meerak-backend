'use client';

import { useEffect, useState } from 'react';
import { AqondButton } from '@aqond/components';
import { completeTour, postExperienceEvent } from '@/lib/experience/experienceClient';
import { markTourCompletedLocally } from '@/lib/experience/tourStorage';

export type TourStep = {
  id: string;
  target: string;
  title: string;
  body: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    id: 'search',
    target: '[data-ftx-tour="search"]',
    title: 'ค้นหาสินค้า & ร้าน',
    body: 'พิมพ์หรือใช้กล้องค้นหาจากรูปได้ที่นี่',
  },
  {
    id: 'categories',
    target: '[data-ftx-tour="categories"]',
    title: 'หมวดหมู่',
    body: 'เลื่อนดูหมวด — แตะอาหารเพื่อไป Food vertical',
  },
  {
    id: 'food',
    target: '[data-ftx-tour="food"]',
    title: 'สั่งอาหาร',
    body: 'เข้าสู่ delivery ใกล้บ้านคุณ',
  },
  {
    id: 'products',
    target: '[data-ftx-tour="products"]',
    title: 'สินค้าแนะนำ',
    body: 'Marketplace จัดเรียงตามความสนใจของคุณ',
  },
  {
    id: 'tabs',
    target: '[data-ftx-tour="tabs"]',
    title: 'เมนูล่าง',
    body: 'Feed · ค้นหา · รถเข็น · บัญชี — สลับได้ตลอด',
  },
];

type FtxGuidedTourProps = {
  open: boolean;
  onClose: () => void;
};

export function FtxGuidedTour({ open, onClose }: FtxGuidedTourProps) {
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIdx(0);
    void postExperienceEvent('ftx.tour_started');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS[stepIdx];
    const el = document.querySelector(step.target);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [open, stepIdx]);

  if (!open) return null;

  const step = TOUR_STEPS[stepIdx];
  const isLast = stepIdx >= TOUR_STEPS.length - 1;

  const finish = async (skipped: boolean) => {
    markTourCompletedLocally(skipped);
    await completeTour(skipped);
    void postExperienceEvent(skipped ? 'ftx.tour_skipped' : 'ftx.tour_completed', {
      step: step.id,
    });
    onClose();
  };

  const next = () => {
    if (isLast) void finish(false);
    else setStepIdx((i) => i + 1);
  };

  return (
    <div className="ftx-tour-root" role="dialog" aria-modal="true" aria-labelledby="ftx-tour-title">
      <div className="ftx-tour-backdrop" aria-hidden />
      <div className="ftx-tour-card">
        <p className="ftx-tour-step">
          {stepIdx + 1} / {TOUR_STEPS.length}
        </p>
        <h2 id="ftx-tour-title" className="ftx-tour-title">
          {step.title}
        </h2>
        <p className="ftx-tour-body">{step.body}</p>
        <div className="ftx-tour-actions">
          <AqondButton type="button" className="ftx-tour-next" onClick={next}>
            {isLast ? 'เสร็จสิ้น' : 'ถัดไป'}
          </AqondButton>
          <button type="button" className="ftx-tour-skip" onClick={() => void finish(true)}>
            ข้ามทัวร์
          </button>
        </div>
      </div>
    </div>
  );
}
