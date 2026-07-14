import { bffGet } from '@/lib/bff';
import { formatMicro } from '@/lib/format';
import { Button, Card } from '@aqond/ui';
import Link from 'next/link';

export const revalidate = 60;

export default async function ProductPage({ params }: { params: { id: string } }) {
  let data: any = {};
  try {
    data = await bffGet(`/v1/product?id=${params.id}`);
  } catch {
    return <p className="empty">Product not found</p>;
  }
  const prod = data.product?.product || data.product || {};
  const title = data.i18n?.title || prod.title || prod.name || params.id;
  const priceMicro = data.price?.price_micro || prod.price_micro || 0;
  const reviews = data.reviews || {};
  const shipping = data.shipping?.rates || [];

  return (
    <div>
      <Link href="/shop">← Back to shop</Link>
      <Card style={{ marginTop: '1rem' }}>
        <h1>{title}</h1>
        <p className="price" style={{ fontSize: '1.5rem' }}>{formatMicro(priceMicro)}</p>
        {reviews.avg_rating != null && (
          <p>★ {Number(reviews.avg_rating).toFixed(1)} ({reviews.count} reviews)</p>
        )}
        <p>{data.i18n?.description || prod.description || ''}</p>
        {shipping.length > 0 && (
          <p>Shipping from {formatMicro(shipping[0]?.shipping_micro || 0)}</p>
        )}
        <form action={`/cart?add=${params.id}`} method="get">
          <Button type="submit">Add to cart</Button>
        </form>
        <Link href={`/product/${params.id}/review`} style={{ marginLeft: '1rem' }}>Write review</Link>
      </Card>
    </div>
  );
}
