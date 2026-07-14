'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { bffGet } from '@/lib/bff';
import { useAuth } from '@/lib/auth';
import { formatCatalogPrice } from '@/lib/format';
import { TtProductGrid, type TtProduct } from '@/components/mobile/TtProductGrid';
import { TtVisualSearchModal } from '@/components/mobile/TtVisualSearchModal';
import { TtPromoBar } from '@/components/mobile/TtPromoBar';
import { CATEGORY_OPTIONS, PRICE_PRESETS, SHIP_OPTIONS, searchEntities, type SearchHit } from '@/lib/search';
import { filterCatalogProducts } from '@/lib/searchCatalogMatch';
import { AxsSearchEmptySuggestions } from '@/components/axs/search/AxsSearchEmptySuggestions';
import { recordSearchTelemetry } from '@/lib/experience/scenarioTelemetry';
import { IconLuxCamera, IconLuxSearch } from '@/components/mobile/TtLuxuryIcons';

const SEARCH_STATE_KEY = 'aqond:search:state:v1';

const ENTITY_TABS = [
  { id: 'product' as const, label: 'สินค้า' },
  { id: 'shop' as const, label: 'ร้าน' },
  { id: 'food' as const, label: 'อาหาร' },
];

const SORT_TABS = [
  { id: 'relevant', label: 'ตรงกันมากที่สุด' },
  { id: 'bestseller', label: 'สินค้าขายดี' },
  { id: 'rating', label: 'มีคะแนนสูงสุด' },
  { id: 'price', label: 'ราคา ↑' },
  { id: 'price_desc', label: 'ราคา ↓' },
];

export default function MobileSearchPage() {
  return (
    <Suspense fallback={<p className="tt-loading">กำลังโหลด...</p>}>
      <MobileSearchContent />
    </Suspense>
  );
}

function MobileSearchContent() {
  const sp = useSearchParams();
  const { auth } = useAuth();
  const initialQ = sp.get('q') || '';
  const initialTab = (sp.get('tab') as 'product' | 'shop' | 'food') || 'product';
  const [tab, setTab] = useState<'product' | 'shop' | 'food'>(initialTab);
  const [q, setQ] = useState(initialQ);
  const [sort, setSort] = useState('relevant');
  const [category, setCategory] = useState('');
  const [shipFrom, setShipFrom] = useState('');
  const [cod, setCod] = useState(false);
  const [pricePreset, setPricePreset] = useState('');
  const [priceMin, setPriceMin] = useState<number | undefined>();
  const [priceMax, setPriceMax] = useState<number | undefined>();
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [results, setResults] = useState<TtProduct[]>([]);
  const [entityHits, setEntityHits] = useState<SearchHit[]>([]);
  const [facets, setFacets] = useState<any>(null);
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const searchStartedAt = useState(() => ({ t: 0 }))[0];

  const persistSearchState = useCallback(() => {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(
      SEARCH_STATE_KEY,
      JSON.stringify({
        q,
        sort,
        category,
        scrollY: window.scrollY,
      }),
    );
  }, [q, sort, category]);

  const runSearch = useCallback(async (query: string, activeTab = tab) => {
    setLoading(true);
    setSearched(true);
    searchStartedAt.t = performance.now();
    let nextSource = '';
    let resultCount = 0;
    let err: string | null = null;
    try {
      const data = await searchEntities({
        q: query.trim() || undefined,
        tab: activeTab,
        category: category || undefined,
        cod,
        shipFrom: shipFrom || undefined,
        priceMin,
        priceMax,
        sort,
        userId: auth?.userId,
      });
      if (activeTab === 'product' && Array.isArray(data.hits) && data.hits.length > 0) {
        setResults(data.hits as TtProduct[]);
        setEntityHits([]);
        setFacets(data.facets);
        nextSource = data.source || 'search-svc';
        resultCount = data.hits.length;
        setSource(nextSource);
        return;
      }
      if (activeTab !== 'product' && Array.isArray(data.hits)) {
        setEntityHits(data.hits);
        setResults([]);
        setFacets(data.facets);
        nextSource = data.source || 'search-svc';
        resultCount = data.hits.length;
        setSource(nextSource);
        return;
      }

      if (activeTab !== 'product') {
        setEntityHits([]);
        setResults([]);
        nextSource = 'fallback';
        setSource('fallback');
        return;
      }

      const home = await bffGet<any>('/v1/home');
      const list = filterCatalogProducts(home.products?.products || [], query, category || undefined);
      setResults(list);
      setEntityHits([]);
      nextSource = 'catalog-fallback';
      resultCount = list.length;
      setSource(nextSource);
    } catch {
      setResults([]);
      setEntityHits([]);
      nextSource = 'error';
      err = 'search_failed';
      setSource('error');
    } finally {
      setLoading(false);
      const loadMs = searchStartedAt.t ? Math.round(performance.now() - searchStartedAt.t) : undefined;
      recordSearchTelemetry({
        loadMs,
        resultCount,
        query: query.trim() || undefined,
        source: nextSource,
        error: err,
      });
      persistSearchState();
    }
  }, [auth?.userId, category, cod, shipFrom, sort, priceMin, priceMax, tab, persistSearchState, searchStartedAt]);

  useEffect(() => {
    if (initialQ || initialTab !== 'product') runSearch(initialQ, initialTab);
  }, [initialQ, initialTab, runSearch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(SEARCH_STATE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { q?: string; scrollY?: number; sort?: string; category?: string };
      if (!initialQ && saved.q) setQ(saved.q);
      if (saved.sort) setSort(saved.sort);
      if (saved.category) setCategory(saved.category);
      if (saved.scrollY != null && saved.scrollY > 0) {
        requestAnimationFrame(() => window.scrollTo(0, saved.scrollY || 0));
      }
    } catch {
      /* ignore */
    }
  }, [initialQ]);

  useEffect(() => {
    const onScroll = () => persistSearchState();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [persistSearchState]);

  useEffect(() => {
    if (searched) runSearch(q, tab);
  }, [sort, category, cod, shipFrom, priceMin, priceMax, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const entityHref = (hit: SearchHit) => {
    const id = hit.entity_id || hit.id;
    if (tab === 'food' || String(id).startsWith('food-')) return `/m/food/${id}`;
    if (tab === 'shop') return `/m/shop/${id}`;
    return `/m/product/${id}`;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  const toggleFilter = (id: string) => {
    setActiveFilter(activeFilter === id ? null : id);
  };

  return (
    <>
      <header className="tt-header">
        <div className="tt-header-row">
          <Link href="/m/home" className="tt-back" aria-label="กลับ">‹</Link>
          <form className="tt-search-bar" onSubmit={onSubmit}>
            <span className="tt-search-bar-icon" aria-hidden>
              <IconLuxSearch size={20} />
            </span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาสินค้า ร้านค้า..."
              aria-label="ค้นหา"
            />
            <button
              type="button"
              className="tt-icon-btn tt-icon-accent"
              title="ค้นหา/สั่งจากรูปภาพ"
              aria-label="ค้นหาจากรูปภาพ"
              onClick={() => setVisualOpen(true)}
            >
              <IconLuxCamera size={22} />
            </button>
          </form>
        </div>
        <div className="tt-sort-tabs" role="tablist">
          {ENTITY_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`tt-sort-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => { setTab(t.id); if (searched) void runSearch(q, t.id); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'product' && (
        <div className="tt-sort-tabs" role="tablist">
          {SORT_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              className={`tt-sort-tab${sort === t.id ? ' active' : ''}`}
              onClick={() => setSort(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        )}
        {tab === 'product' && (
        <div className="tt-filter-row">
          <button
            type="button"
            className={`tt-filter-chip${cod ? ' active' : ''}`}
            onClick={() => { setCod(!cod); setActiveFilter(null); }}
          >
            เก็บเงินปลายทาง {cod ? '✓' : ''}
          </button>
          <button
            type="button"
            className={`tt-filter-chip${activeFilter === 'ship' ? ' active' : ''}`}
            onClick={() => toggleFilter('ship')}
          >
            จัดส่งจาก ▾
          </button>
          <button
            type="button"
            className={`tt-filter-chip${activeFilter === 'cat' ? ' active' : ''}`}
            onClick={() => toggleFilter('cat')}
          >
            หมวดหมู่ ▾
          </button>
          <button
            type="button"
            className={`tt-filter-chip${activeFilter === 'price' ? ' active' : ''}`}
            onClick={() => toggleFilter('price')}
          >
            ราคา ▾
          </button>
        </div>
        )}
        {tab === 'product' && activeFilter === 'cat' && (
          <div className="tt-filter-panel">
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                className={`tt-filter-chip${category === c.id ? ' active' : ''}`}
                onClick={() => { setCategory(c.id); setActiveFilter(null); }}
              >
                {c.label}
                {facets?.category?.find?.((f: any) => f.category === c.id)?.count != null &&
                  ` (${facets.category.find((f: any) => f.category === c.id).count})`}
              </button>
            ))}
          </div>
        )}
        {tab === 'product' && activeFilter === 'ship' && (
          <div className="tt-filter-panel">
            {SHIP_OPTIONS.map((s) => (
              <button
                key={s.id || 'all'}
                type="button"
                className={`tt-filter-chip${shipFrom === s.id ? ' active' : ''}`}
                onClick={() => { setShipFrom(s.id); setActiveFilter(null); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {tab === 'product' && activeFilter === 'price' && (
          <div className="tt-filter-panel">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p.id || 'all'}
                type="button"
                className={`tt-filter-chip${pricePreset === p.id ? ' active' : ''}`}
                onClick={() => {
                  setPricePreset(p.id);
                  setPriceMin(p.min);
                  setPriceMax(p.max);
                  setActiveFilter(null);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
        {source === 'search-svc' && (
          <p className="tt-hint" style={{ padding: '0 16px 8px' }}>ค้นหาผ่าน search-svc</p>
        )}
      </header>

      <TtPromoBar promo={{ title: 'คูปอง ฿180 ไม่มีขั้นต่ำ', slug: 'welcome' }} />

      {loading && <p className="tt-loading" data-testid="search-loading">กำลังค้นหา...</p>}
      {!loading && searched && results.length === 0 && entityHits.length === 0 && q.trim() && (
        <AxsSearchEmptySuggestions
          query={q}
          onPickQuery={(next) => {
            setQ(next);
            void runSearch(next);
          }}
          onPickCategory={(cat) => {
            setCategory(cat);
            void runSearch(q, tab);
          }}
        />
      )}
      {!loading && searched && results.length === 0 && entityHits.length === 0 && !q.trim() && (
        <p className="tt-loading">ไม่พบสินค้า — ลองคำค้นอื่น</p>
      )}
      {!loading && !searched && (
        <p className="tt-loading">พิมพ์แล้วกด Enter หรือดูสินค้าแนะนำด้านล่าง</p>
      )}
      {!loading && results.length > 0 && (
        <div data-testid="search-results" onClickCapture={persistSearchState}>
          <TtProductGrid products={results} />
        </div>
      )}
      {!loading && entityHits.length > 0 && (
        <div className="tt-food-list" style={{ padding: '0 12px' }}>
          {entityHits.map((hit) => (
            <Link key={hit.id || hit.entity_id} href={entityHref(hit)} className="tt-order-card" style={{ display: 'block', marginBottom: 8 }}>
              <strong>{tab === 'food' ? '🍱 ' : '🏪 '}{hit.title}</strong>
              {hit.category && <p className="tt-hint">{hit.category}</p>}
              {hit.rating != null && <p className="tt-hint">⭐ {hit.rating.toFixed(1)}</p>}
              {hit.price_micro != null && hit.price_micro > 0 && (
                <p className="tt-hint">เริ่มต้น {formatCatalogPrice(hit.price_micro)}</p>
              )}
            </Link>
          ))}
        </div>
      )}
      <TtVisualSearchModal
        open={visualOpen}
        onClose={() => setVisualOpen(false)}
        uiMode="order"
        title="ค้นหา/สั่งจากรูปภาพ"
      />
      {!searched && !loading && (
        <button
          type="button"
          className="tt-btn-primary"
          style={{ margin: '12px auto', display: 'block' }}
          onClick={() => runSearch('')}
        >
          ดูสินค้าทั้งหมด
        </button>
      )}
    </>
  );
}
