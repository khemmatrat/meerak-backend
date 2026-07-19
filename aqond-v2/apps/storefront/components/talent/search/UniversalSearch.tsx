'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { StatusChip } from '@aqond/ui';
import { SearchEmpty } from '@/components/talent/search/SearchEmpty';
import { SearchQuickFilters } from '@/components/talent/search/SearchQuickFilters';
import { SearchRecent } from '@/components/talent/search/SearchRecent';
import { SearchResults } from '@/components/talent/search/SearchResults';
import { SearchSkeleton } from '@/components/talent/search/SearchSkeleton';
import { SearchSuggested } from '@/components/talent/search/SearchSuggested';
import { useTalentSearch } from '@/hooks/talent/useTalentSearch';

export function UniversalSearch() {
  const {
    loading,
    query,
    filter,
    setFilter,
    submitQuery,
    applySuggestion,
    results,
    recent,
    clearRecent,
    loggedIn,
    reload,
  } = useTalentSearch();

  const [draft, setDraft] = useState('');

  const showDiscovery = !query.trim() && filter === 'all';
  const showResults = query.trim().length > 0 || filter !== 'all';
  const hasResults = results.length > 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submitQuery(draft);
  };

  return (
    <div className="tt-talent-page tt-talent-search" data-talent-search>
      <header className="tt-talent-page-head">
        <Link href="/m/talent" className="tt-talent-notif-back" aria-label="กลับ Today">
          ←
        </Link>
        <span className="tt-talent-page-icon" aria-hidden>
          🔍
        </span>
        <div>
          <p className="tt-talent-page-module">Universal Search · TOS-6</p>
          <h2 className="tt-talent-page-title">ค้นหา</h2>
          <StatusChip tone="pending">Client compose · no backend search</StatusChip>
        </div>
        <button
          type="button"
          className="tt-talent-today-refresh"
          onClick={() => void reload()}
          aria-label="รีเฟรช"
          disabled={loading}
        >
          ↻
        </button>
      </header>

      <form className="tt-talent-search-form" onSubmit={onSubmit} role="search">
        <label className="tt-talent-search-input-wrap">
          <span className="sr-only">ค้นหาใน Talent OS</span>
          <span aria-hidden>🔍</span>
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Match · Board · Booking · Wallet · แจ้งเตือน…"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <button type="submit" className="tt-talent-search-submit">
          ค้นหา
        </button>
      </form>

      <SearchQuickFilters
        active={filter}
        onChange={(next) => {
          setFilter(next);
          if (draft.trim()) submitQuery(draft);
        }}
      />

      {loading ? (
        <SearchSkeleton />
      ) : !loggedIn ? (
        <>
          <SearchEmpty query="" loggedIn={false} />
          <Link href="/m/login?next=/m/talent/search" className="tt-talent-today-login">
            <span>🔑</span>
            <div>
              <strong>เข้าสู่ระบบ</strong>
              <p className="tt-hint">ค้นจากข้อมูล API เดิม</p>
            </div>
          </Link>
        </>
      ) : (
        <>
          {showDiscovery && (
            <>
              <SearchRecent items={recent} onSelect={submitQuery} onClear={clearRecent} />
              <SearchSuggested onSelect={(s) => applySuggestion(s.query, s.filter)} />
            </>
          )}

          {showResults && (
            hasResults ? (
              <SearchResults items={results} query={query} />
            ) : (
              <SearchEmpty query={query} hasFilter={filter !== 'all'} />
            )
          )}
        </>
      )}

      <p className="tt-talent-shell-badge">
        Talent OS Universal Search · compose existing fetches · TOS-6
      </p>
    </div>
  );
}
