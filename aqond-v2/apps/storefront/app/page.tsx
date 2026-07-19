import { bffGet } from '@/lib/bff';
import { ProductCard } from '@/components/ProductCard';
import Link from 'next/link';

export const revalidate = 30;

type Category = { id: string; name: string; icon?: string };

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'food', name: 'อาหาร & เครื่องดื่ม', icon: '🍜' },
  { id: 'fashion', name: 'แฟชั่น', icon: '👗' },
  { id: 'beauty', name: 'ความงาม', icon: '💄' },
  { id: 'home', name: 'บ้าน & ไลฟ์สไตล์', icon: '🏠' },
  { id: 'electronics', name: 'อิเล็กทรอนิกส์', icon: '📱' },
  { id: 'health', name: 'สุขภาพ', icon: '🩺' },
];

const TRUST_SIGNALS = [
  { icon: '🔒', title: 'คุ้มครองการชำระเงิน', desc: 'Escrow พักเงินจนกว่าจะได้รับสินค้า' },
  { icon: '✅', title: 'ร้านค้ายืนยันตัวตน', desc: 'ตรวจสอบผู้ขายทุกร้านก่อนเปิดขาย' },
  { icon: '🛵', title: 'จัดส่งโดย AQOND Rider', desc: 'ติดตามสถานะแบบเรียลไทม์' },
  { icon: '↩️', title: 'รับประกันความพอใจ', desc: 'คืนสินค้า/คืนเงินได้ภายใน 7 วัน' },
];

export default async function HomePage() {
  let data: any = { products: { products: [] }, categories: [], recommendations: {} };
  try {
    data = await bffGet('/v1/home');
  } catch {
    /* degrade gracefully */
  }
  const products = data.products?.products || data.products || [];
  const productList = Array.isArray(products) ? products : [];
  const categories: Category[] =
    Array.isArray(data.categories) && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
  const region = data.region || 'TH';

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero-content">
          <span className="home-hero-badge">
            <span className="home-hero-badge-dot" aria-hidden />
            AQOND Marketplace · ภูมิภาค {region}
          </span>
          <h1 className="home-hero-title">
            ช้อปอย่างมั่นใจ<br />
            ปลอดภัยทุกคำสั่งซื้อ
          </h1>
          <p className="home-hero-sub">
            รวมร้านค้าที่ยืนยันตัวตนแล้ว ชำระเงินผ่านระบบ Escrow ที่พักเงินไว้จนกว่าคุณจะได้รับสินค้า
            พร้อมจัดส่งและติดตามสถานะแบบเรียลไทม์
          </p>
          <div className="home-hero-cta">
            <Link href="/shop" className="home-btn home-btn-light">
              เริ่มช้อปเลย
            </Link>
            <Link href="/m/sell" className="home-btn home-btn-outline">
              เปิดร้านกับเรา
            </Link>
          </div>
        </div>
      </section>

      <section className="home-trust" aria-label="ความน่าเชื่อถือ">
        {TRUST_SIGNALS.map((t) => (
          <div key={t.title} className="home-trust-item">
            <span className="home-trust-ic" aria-hidden>
              {t.icon}
            </span>
            <div>
              <div className="home-trust-title">{t.title}</div>
              <div className="home-trust-desc">{t.desc}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-title">หมวดหมู่ยอดนิยม</h2>
          <Link href="/shop" className="home-link-more">
            ดูทั้งหมด →
          </Link>
        </div>
        <div className="home-cats">
          {categories.map((c) => (
            <Link key={c.id} href={`/shop?cat=${c.id}`} className="home-cat">
              {c.icon && (
                <span className="home-cat-ic" aria-hidden>
                  {c.icon}
                </span>
              )}
              <span>{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-title">สินค้ามาแรง</h2>
          {productList.length > 0 && (
            <Link href="/shop" className="home-link-more">
              ดูทั้งหมด →
            </Link>
          )}
        </div>
        {productList.length > 0 ? (
          <div className="grid">
            {productList.slice(0, 12).map((p: any) => (
              <ProductCard
                key={p.id || p.product_id}
                id={p.id || p.product_id}
                title={p.title || p.name || 'Product'}
                priceMicro={p.price_micro || 0}
                imageUrl={p.image_url || p.imageUrl}
              />
            ))}
          </div>
        ) : (
          <div className="aq-empty home-empty">
            <span className="aq-empty-icon" aria-hidden>
              🛍️
            </span>
            <p className="aq-empty-title">ยังไม่มีสินค้าแนะนำในตอนนี้</p>
            <p className="aq-empty-desc">ลองสำรวจร้านค้าทั้งหมด แล้วกลับมาดูสินค้ามาแรงอีกครั้ง</p>
            <Link href="/shop" className="home-btn home-btn-primary" style={{ marginTop: 'var(--axs-space-4)' }}>
              สำรวจร้านค้า
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
