'use client';

import { RiderProofCameraSheet } from '@/components/mobile/RiderProofCameraSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  onCapture: (dataUrl: string) => void;
  busy?: boolean;
};

/** Merchant kitchen — packing photo before marking order ready. */
export function MerchantPackingProofSheet({ open, onClose, onCapture, busy }: Props) {
  return (
    <RiderProofCameraSheet
      open={open}
      onClose={onClose}
      onCapture={onCapture}
      busy={busy}
      title="ถ่ายรูปแพ็คอาหาร"
      hint="ถ่ายรูปอาหารที่แพ็คในถุง/กล่องก่อนเรียกไรเดอร์ — ลูกค้าและ Track OS จะเห็นรูปนี้"
    />
  );
}
