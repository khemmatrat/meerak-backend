'use client';

import { useMemo, useState } from 'react';
import {
  AUTO_GENERATED_ALIAS_RULES,
  buildRoutingMatrixCsv,
  PROFESSION_ALIAS_KEYWORD_RULES,
  PROFESSION_ROUTING_MATRIX,
  suggestRoutingByKeywords,
  type WorkSurface,
} from '@/lib/services/workTaxonomy';

export function useWorkRoutingMatrix() {
  const [query, setQuery] = useState('');
  const [surface, setSurface] = useState<WorkSurface | 'all'>('all');

  const suggestion = useMemo(
    () => suggestRoutingByKeywords(query, { verticalWeightOverrides: null }),
    [query],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROFESSION_ROUTING_MATRIX.filter((row) => {
      if (surface !== 'all' && row.primary_surface !== surface) return false;
      if (!q) return true;
      return (
        row.profession.toLowerCase().includes(q) ||
        row.province_examples.some((p) => p.toLowerCase().includes(q)) ||
        row.recommended_employment_types.some((e) => e.toLowerCase().includes(q))
      );
    });
  }, [query, surface]);

  const aliasRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROFESSION_ALIAS_KEYWORD_RULES.filter((r) => {
      if (surface !== 'all' && r.preferred_surface !== surface) return false;
      if (!q) return true;
      return (
        r.profession.toLowerCase().includes(q) ||
        r.keywords.some((k) => k.toLowerCase().includes(q))
      );
    });
  }, [query, surface]);

  const exportCsv = () => {
    const blob = new Blob([buildRoutingMatrixCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `work-routing-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      matrix: PROFESSION_ROUTING_MATRIX,
      alias_rules: PROFESSION_ALIAS_KEYWORD_RULES,
      auto_generated_alias_rules: AUTO_GENERATED_ALIAS_RULES,
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: 'application/json;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `work-routing-matrix-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return {
    query,
    setQuery,
    surface,
    setSurface,
    suggestion,
    rows,
    aliasRows,
    exportCsv,
    exportJson,
  };
}
