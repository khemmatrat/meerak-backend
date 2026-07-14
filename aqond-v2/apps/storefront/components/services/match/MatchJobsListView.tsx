'use client';

import Link from 'next/link';
import { EmptyState } from '@aqond/ui';
import {
  AqondButton as Button,
  AqondCard as Card,
  AqondChip as StatusChip,
  AqondInput as Input,
} from '@aqond/components';
import { useMatchJobsList } from '@/hooks/services/useMatchJobsList';
import {
  ALL_CATEGORIES,
  CATEGORY_EMOJI,
  GROUP_LABELS,
  JOB_CATEGORY_GROUPS,
  categoryLabel,
} from '@/lib/services/jobCategoryHub';
import { formatJobPrimaryAddress } from '@/lib/services/jobLocationDisplay';
import { formatMatchJobPrice } from '@/lib/services/matchJobApi';
import { AxsServicesLoading } from '@/components/axs/services/AxsServicesLoading';

export function MatchJobsListView() {
  const {
    jobs,
    loading,
    category,
    searchQuery,
    suggestions,
    showSuggestions,
    searchRef,
    hubRef,
    selectCategory,
    handleSearchChange,
    selectSuggestion,
    clearSearch,
    scrollToHub,
    popularPick,
    focusSearch,
  } = useMatchJobsList();

  return (
    <div className="tt-services-match">
      <div className="tt-services-match-head">
        <div>
          <h2 className="tt-services-match-title">หางาน / จ้างงาน</h2>
          <p className="tt-hint">Match Job — จับคู่ตามพื้นที่และความพร้อม</p>
        </div>
        <div className="tt-services-mine-head-actions">
          <Link href="/m/services/match/create">
            <Button type="button" variant="primary" style={{ fontSize: '0.85rem' }}>
              + โพสต์งาน
            </Button>
          </Link>
          <Link href="/m/services/match/mine">
            <Button type="button" variant="secondary" style={{ fontSize: '0.85rem' }}>
              งานของฉัน
            </Button>
          </Link>
        </div>
      </div>

      <div ref={hubRef} id="job-category-hub" className="tt-services-category-hub">
        <div className="tt-services-category-hub-head">
          <div>
            <p className="tt-services-category-kicker">AQOND</p>
            <h3>เลือกประเภทงาน</h3>
          </div>
          <button
            type="button"
            className={`tt-services-category-all${category === 'All' ? ' active' : ''}`}
            onClick={() => selectCategory('All')}
          >
            ✨ ทั้งหมด
          </button>
        </div>

        {JOB_CATEGORY_GROUPS.map((group) => (
          <div key={group.id} className="tt-services-category-group">
            <h4>{GROUP_LABELS[group.id]}</h4>
            <div className="tt-services-category-grid">
              {group.categories.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`tt-services-category-tile${active ? ' active' : ''}`}
                    onClick={() => selectCategory(cat)}
                  >
                    <span className="tt-services-category-emoji">{CATEGORY_EMOJI[cat] || '📌'}</span>
                    <span>{cat.replace(/_/g, ' ')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="tt-services-category-strip">
          <p className="tt-hint">กรองเร็ว</p>
          <div className="tt-services-category-pills">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`tt-services-pill${category === cat ? ' active' : ''}`}
                onClick={() => selectCategory(cat)}
              >
                {categoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {category !== 'All' && (
        <div className="tt-services-filter-banner">
          <span>
            แสดง: <strong>{categoryLabel(category)}</strong>
          </span>
          <button type="button" className="tt-link-accent" onClick={() => selectCategory('All')}>
            ล้างตัวกรอง
          </button>
        </div>
      )}

      <div className="tt-services-search-wrap" ref={searchRef}>
        <Input
          type="search"
          placeholder="ค้นหางาน..."
          value={searchQuery}
          onChange={(e) => void handleSearchChange(e.target.value)}
          onFocus={focusSearch}
          aria-label="ค้นหางาน"
        />
        {searchQuery && (
          <button type="button" className="tt-services-search-clear" onClick={clearSearch} aria-label="ล้าง">
            ×
          </button>
        )}
        {showSuggestions && suggestions.length > 0 && (
          <ul className="tt-services-suggestions">
            {suggestions.map((s) => (
              <li key={s}>
                <button type="button" onClick={() => selectSuggestion(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {loading ? (
        <AxsServicesLoading label="กำลังค้นหางาน..." />
      ) : jobs.length === 0 ? (
        <>
        <EmptyState
          icon="🔍"
          title="ยังไม่มีงานในตัวกรองนี้"
          description="ลองเปลี่ยนหมวดหมู่หรือคำค้นหา — หรือเลือกหมวดยอดนิยมด้านล่าง"
        />
        <div className="tt-services-empty-actions">
          {['Cleaning', 'Driver', 'Beauty', 'IT_Support'].map((cat) => (
            <Button key={cat} type="button" variant="ghost" onClick={() => popularPick(cat)}>
              {categoryLabel(cat)}
            </Button>
          ))}
          <button type="button" className="tt-link-accent" onClick={scrollToHub}>
            ↑ เลือกหมวดงาน
          </button>
        </div>
        </>
      ) : (
        <ul className="tt-services-job-list">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link href={`/m/services/match/${job.id}`} className="tt-services-job-card">
                <Card>
                  <div className="tt-services-job-card-top">
                    <StatusChip tone="pending">{categoryLabel(job.category)}</StatusChip>
                    <span className="tt-hint">
                      {job.datetime ? new Date(job.datetime).toLocaleDateString('th-TH') : '—'}
                    </span>
                  </div>
                  <h3 className="tt-services-job-card-title">{job.title}</h3>
                  <p className="tt-services-job-card-desc">{job.description}</p>
                  <div className="tt-services-job-card-foot">
                    <span className="tt-hint">
                      📍 {formatJobPrimaryAddress(job) || 'ไม่ระบุสถานที่'}
                    </span>
                    <strong className="tt-services-job-price">{formatMatchJobPrice(job.price)}</strong>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
