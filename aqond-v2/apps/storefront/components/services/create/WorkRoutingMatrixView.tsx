'use client';

import Link from 'next/link';
import { AqondButton as Button, AqondInput as Input } from '@aqond/components';
import { useWorkRoutingMatrix } from '@/hooks/services/useWorkRoutingMatrix';
import { WORK_SURFACES } from '@/lib/services/workTaxonomy';
import { surfaceCreateHref, surfaceLabel } from '@/lib/services/workRoutingRoutes';

export function WorkRoutingMatrixView() {
  const {
    query,
    setQuery,
    surface,
    setSurface,
    suggestion,
    rows,
    aliasRows,
    exportCsv,
    exportJson,
  } = useWorkRoutingMatrix();

  return (
    <div className="tt-services-routing-matrix">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">Work Routing Matrix</h2>
          <p className="tt-hint">
            ค้นหาอาชีพหรือ keyword เพื่อดูว่าเหมาะกับ Booking / Match Job / Job Board / Video Feed
          </p>
        </div>
        <Link href="/m/services/create" className="tt-services-back-link">
          ‹ สร้างงาน
        </Link>
      </div>

      <div className="tt-services-routing-matrix-toolbar">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="เช่น ช่างแอร์ด่วน, ตัดต่อวิดีโอ, SEO..."
        />
        <div className="tt-services-routing-filters">
          <button
            type="button"
            className={`tt-services-routing-filter${surface === 'all' ? ' active' : ''}`}
            onClick={() => setSurface('all')}
          >
            ทั้งหมด
          </button>
          {WORK_SURFACES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`tt-services-routing-filter${surface === s.id ? ' active' : ''}`}
              onClick={() => setSurface(s.id)}
            >
              {s.label}
            </button>
          ))}
          <div className="tt-services-routing-export">
            <Button type="button" variant="secondary" onClick={exportCsv} style={{ fontSize: '0.75rem' }}>
              Export CSV
            </Button>
            <Button type="button" variant="secondary" onClick={exportJson} style={{ fontSize: '0.75rem' }}>
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      {suggestion && query.trim() && (
        <div className="tt-services-routing-suggestion">
          <p className="tt-services-routing-suggestion-label">Auto Route Suggestion</p>
          <p className="tt-services-routing-suggestion-text">
            แนะนำไปที่ <strong>{surfaceLabel(suggestion.surface)}</strong> ({suggestion.profession})
          </p>
          <p className="tt-hint">
            confidence: {(suggestion.confidence * 100).toFixed(0)}%
            {suggestion.matched_keywords.length
              ? ` • matched: ${suggestion.matched_keywords.join(', ')}`
              : ''}
            {suggestion.vertical ? ` • vertical: ${suggestion.vertical}` : ''}
          </p>
          <Link href={surfaceCreateHref(suggestion.surface)}>
            <Button type="button" variant="primary" style={{ marginTop: 8 }}>
              ไป {surfaceLabel(suggestion.surface)}
            </Button>
          </Link>
        </div>
      )}

      <div className="tt-services-routing-panels">
        <section className="tt-services-routing-panel">
          <h3>Mapping Matrix ({rows.length})</h3>
          <ul className="tt-services-routing-list">
            {rows.map((row) => (
              <li key={row.profession} className="tt-services-routing-item">
                <p className="tt-services-routing-item-title">{row.profession}</p>
                <p className="tt-hint">
                  Primary: {surfaceLabel(row.primary_surface)} • Secondary:{' '}
                  {row.secondary_surfaces.map(surfaceLabel).join(', ')}
                </p>
                <p className="tt-hint">จ้างงานที่แนะนำ: {row.recommended_employment_types.join(', ')}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="tt-services-routing-panel">
          <h3>Alias / Keywords ({aliasRows.length})</h3>
          <ul className="tt-services-routing-list">
            {aliasRows.map((row) => (
              <li key={`${row.profession}-${row.preferred_surface}`} className="tt-services-routing-item">
                <p className="tt-services-routing-item-title">{row.profession}</p>
                <p className="tt-hint">route: {surfaceLabel(row.preferred_surface)}</p>
                <div className="tt-services-hiring-guide-chips">
                  {row.keywords.slice(0, 10).map((k) => (
                    <span key={k} className="tt-services-hiring-chip">
                      {k}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
