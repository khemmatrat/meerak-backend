'use client';

type ProofItem = {
  kind: string;
  label: string;
  url: string;
  at?: string;
};

type Props = {
  proofs?: ProofItem[];
  packingUrl?: string;
  pickupUrl?: string;
  deliveryUrl?: string;
};

const LABELS: Record<string, string> = {
  packing: '📦 แพ็คจากร้าน',
  pickup: '🛵 รับจากร้าน',
  delivery: '📷 ส่งมอบ',
};

export function TtDeliveryProofGallery({ proofs, packingUrl, pickupUrl, deliveryUrl }: Props) {
  const items: ProofItem[] = proofs?.length
    ? proofs
    : [
        packingUrl ? { kind: 'packing', label: LABELS.packing, url: packingUrl } : null,
        pickupUrl ? { kind: 'pickup', label: LABELS.pickup, url: pickupUrl } : null,
        deliveryUrl ? { kind: 'delivery', label: LABELS.delivery, url: deliveryUrl } : null,
      ].filter(Boolean) as ProofItem[];

  if (!items.length) return null;

  return (
    <div className="tt-delivery-proof-gallery">
      <p className="tt-delivery-photo-label">หลักฐานทั้งหมด</p>
      <div className="tt-delivery-proof-grid">
        {items.map((p) => (
          <figure key={p.kind} className="tt-delivery-proof-item">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.label} />
            <figcaption>{p.label}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
