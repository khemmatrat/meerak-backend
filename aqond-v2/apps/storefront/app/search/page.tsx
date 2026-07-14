'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { bffGet } from '@/lib/bff';
import { ProductCard } from '@/components/ProductCard';
import { Input, Button } from '@aqond/ui';

export default function SearchPage() {
  return (
    <Suspense fallback={<p className="empty">Loading search...</p>}>
      <SearchContent />
    </Suspense>
  );
}

function SearchContent() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [results, setResults] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    setSearched(true);
    try {
      const data = await bffGet<any>(`/v1/search?q=${encodeURIComponent(q)}&tab=products`);
      setResults(data.results || data.hits || []);
    } catch {
      setResults([]);
    }
  };

  const suggest = async (v: string) => {
    setQ(v);
    if (v.length < 2) { setSuggestions([]); return; }
    try {
      const data = await bffGet<any>(`/v1/suggest?q=${encodeURIComponent(v)}`);
      setSuggestions(data.suggestions || []);
    } catch { setSuggestions([]); }
  };

  return (
    <div>
      <h1 className="page-title">Search</h1>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <Input value={q} onChange={(e) => suggest(e.target.value)} placeholder="Search products..." aria-label="Search" />
        <Button onClick={search}>Search</Button>
      </div>
      {suggestions.length > 0 && (
        <ul>{suggestions.map((s) => <li key={s}><button type="button" onClick={() => { setQ(s); }}>{s}</button></li>)}</ul>
      )}
      <div className="grid">
        {results.map((r: any) => (
          <ProductCard key={r.id} id={r.id || r.doc_id} title={r.title || r.name} />
        ))}
      </div>
      {searched && results.length === 0 && <p className="empty">No results for &quot;{q}&quot;</p>}
    </div>
  );
}
