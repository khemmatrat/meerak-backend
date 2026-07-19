import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  href: string;
  count?: number;
  meta?: string;
  children: ReactNode;
};

export function CommerceSection({ title, href, count, meta, children }: Props) {
  return (
    <section className="tt-talent-commerce-section">
      <div className="tt-talent-commerce-section-head">
        <h3>{title}</h3>
        <Link href={href} className="tt-talent-today-see-all">
          ดูทั้งหมด{count != null && count > 0 ? ` (${count})` : ''}
        </Link>
      </div>
      {meta ? <p className="tt-talent-commerce-section-meta">{meta}</p> : null}
      {children}
    </section>
  );
}
