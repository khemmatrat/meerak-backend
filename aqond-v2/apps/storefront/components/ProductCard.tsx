import Link from 'next/link';
import { Card } from '@aqond/ui';
import { formatMicro } from '@/lib/format';

type Props = {
  id: string;
  title: string;
  priceMicro?: number;
  currency?: string;
  imageUrl?: string;
};

export function ProductCard({ id, title, priceMicro = 0, currency = 'THB', imageUrl }: Props) {
  return (
    <Link href={`/product/${id}`} className="product-link">
      <Card className="product-card">
        <div className="product-img" style={{ backgroundImage: imageUrl ? `url(${imageUrl})` : undefined }}>
          {!imageUrl && <span aria-hidden>📦</span>}
        </div>
        <h3>{title}</h3>
        <p className="price">{formatMicro(priceMicro, currency)}</p>
      </Card>
    </Link>
  );
}
