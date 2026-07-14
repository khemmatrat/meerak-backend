'use client';

import Link from 'next/link';
import {
  DEFAULT_HIRING_ORDER_NEWBIE,
  DEFAULT_HIRING_ORDER_SENIOR,
  getBlueprintBySurfaceAndCategory,
  getRoutingMatrixBySurface,
  type WorkSurface,
} from '@/lib/services/workTaxonomy';

export function CreateJobHiringGuide({
  surface,
  category,
}: {
  surface: WorkSurface;
  category: string;
}) {
  const blueprint = getBlueprintBySurfaceAndCategory(surface, category);
  const matrix = getRoutingMatrixBySurface(surface).slice(0, 6);

  return (
    <div className="tt-services-hiring-guide">
      {blueprint && blueprint.sampleHiringExamples.length > 0 && (
        <div className="tt-services-hiring-guide-section">
          <p className="tt-services-hiring-guide-heading">ตัวอย่างงานในหมวดนี้</p>
          <div className="tt-services-hiring-guide-chips">
            {blueprint.sampleHiringExamples.slice(0, 5).map((sample) => (
              <span key={sample} className="tt-services-hiring-chip">
                {sample}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="tt-services-hiring-guide-grid">
        <div>
          <p className="tt-services-hiring-guide-heading">ลำดับจ้างงาน (มือใหม่)</p>
          <ol className="tt-services-hiring-list">
            {DEFAULT_HIRING_ORDER_NEWBIE.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        <div>
          <p className="tt-services-hiring-guide-heading">ลำดับจ้างงาน (Senior)</p>
          <ol className="tt-services-hiring-list">
            {DEFAULT_HIRING_ORDER_SENIOR.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      </div>

      {matrix.length > 0 && (
        <div className="tt-services-hiring-guide-section">
          <p className="tt-services-hiring-guide-heading">Routing Matrix</p>
          <div className="tt-services-hiring-guide-chips">
            {matrix.map((item) => (
              <span key={item.profession} className="tt-services-hiring-chip">
                {item.profession}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link href="/m/services/create/routing" className="tt-link-accent tt-services-hiring-matrix-link">
        เปิด Routing Matrix แบบค้นหา →
      </Link>
    </div>
  );
}
