import Link from 'next/link';
import { EmptyState } from '@aqond/ui';

export type TalentDeepLink = {
  href: string;
  label: string;
  note?: string;
};

type Props = {
  title: string;
  module: string;
  description: string;
  icon: string;
  deepLinks?: TalentDeepLink[];
};

/** TOS-1 placeholder — empty state + optional deep links to existing routes */
export function TalentPlaceholderPage({ title, module, description, icon, deepLinks }: Props) {
  return (
    <div className="tt-talent-page">
      <header className="tt-talent-page-head">
        <span className="tt-talent-page-icon" aria-hidden>
          {icon}
        </span>
        <div>
          <p className="tt-talent-page-module">{module}</p>
          <h2 className="tt-talent-page-title">{title}</h2>
        </div>
      </header>

      <EmptyState
        icon={<span className="tt-talent-empty-icon">{icon}</span>}
        title="พื้นที่เตรียมพร้อม — TOS-1 Shell"
        description={`${description} เนื้อหาจริงจะมาใน ${module} (read-only aggregation จากระบบเดิม)`}
      />

      {deepLinks && deepLinks.length > 0 && (
        <section className="tt-talent-deeplinks" aria-label="ลิงก์ไปยังระบบเดิม">
          <h3>ไปยังหน้าที่มีอยู่แล้ว</h3>
          <ul>
            {deepLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="tt-talent-deeplink">
                  <span>{link.label}</span>
                  {link.note ? <small>{link.note}</small> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="tt-talent-shell-badge">Talent OS · Unified Experience Layer · TOS-1</p>
    </div>
  );
}
