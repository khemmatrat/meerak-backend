'use client';

import Link from 'next/link';
import { AqondButton as Button } from '@aqond/components';
import type { RoutingSuggestion, WorkSurface } from '@/lib/services/workTaxonomy';
import { otherSurfaceLinks, surfaceLabel } from '@/lib/services/workRoutingRoutes';

export function WorkRoutingSuggestion({
  suggestion,
  currentSurface,
}: {
  suggestion: RoutingSuggestion | null;
  currentSurface: WorkSurface;
}) {
  if (!suggestion || suggestion.surface === currentSurface) return null;

  const links = otherSurfaceLinks(currentSurface).filter((l) => l.surface === suggestion.surface);

  return (
    <div className="tt-services-routing-suggestion">
      <p className="tt-services-routing-suggestion-label">Auto Route แนะนำ</p>
      <p className="tt-services-routing-suggestion-text">
        งานนี้อาจเหมาะกับ <strong>{surfaceLabel(suggestion.surface)}</strong> มากกว่า (
        {(suggestion.confidence * 100).toFixed(0)}%)
        {suggestion.profession ? ` — ${suggestion.profession}` : ''}
      </p>
      {suggestion.matched_keywords.length > 0 && (
        <p className="tt-hint">
          คำที่ตรง: {suggestion.matched_keywords.slice(0, 6).join(', ')}
        </p>
      )}
      <div className="tt-services-routing-suggestion-actions">
        {links.map((l) => (
          <Link key={l.surface} href={l.href}>
            <Button type="button" variant="secondary" style={{ fontSize: '0.8rem' }}>
              ไป {l.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
