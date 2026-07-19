'use client';

import Link from 'next/link';
import { StatusChip } from '@aqond/ui';
import { ChatConversationList } from '@/components/talent/chat/ChatConversationList';
import { ChatEmpty } from '@/components/talent/chat/ChatEmpty';
import { ChatFilterBar } from '@/components/talent/chat/ChatFilterBar';
import { ChatSectionHub } from '@/components/talent/chat/ChatSectionHub';
import { ChatSkeleton } from '@/components/talent/chat/ChatSkeleton';
import { useTalentChatWorkspace } from '@/hooks/talent/useTalentChatWorkspace';

export function UnifiedChatWorkspace() {
  const {
    loading,
    error,
    query,
    setQuery,
    filter,
    setFilter,
    filtered,
    recent,
    unread,
    unreadCount,
    loggedIn,
    reload,
  } = useTalentChatWorkspace();

  const showFiltered = query.trim().length > 0 || filter !== 'all';
  const listItems = showFiltered ? filtered : recent;
  const hasList = listItems.length > 0;

  return (
    <div className="tt-talent-page tt-talent-chat-page" data-talent-chat>
      <header className="tt-talent-page-head">
        <Link href="/m/talent" className="tt-talent-notif-back" aria-label="กลับ Today">
          ←
        </Link>
        <span className="tt-talent-page-icon" aria-hidden>
          💬
        </span>
        <div>
          <p className="tt-talent-page-module">Unified Chat · TOS-8</p>
          <h2 className="tt-talent-page-title">Chat Workspace</h2>
          <StatusChip tone="pending">Deep links only · no merge</StatusChip>
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

      <label className="tt-talent-chat-search">
        <span className="sr-only">ค้นหาแชท</span>
        <span aria-hidden>🔍</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาบทสนทนา…"
          autoComplete="off"
        />
      </label>

      <ChatFilterBar active={filter} onChange={setFilter} />

      {loggedIn && !loading ? (
        <p className="tt-talent-chat-summary">
          ยังไม่อ่าน {unreadCount} · เปิดแชทผ่าน route เดิมเท่านั้น
        </p>
      ) : null}

      {loading ? (
        <ChatSkeleton />
      ) : !loggedIn ? (
        <>
          <ChatEmpty loggedIn={false} />
          <Link href="/m/login?next=/m/talent/chat" className="tt-talent-today-login">
            <span>🔑</span>
            <div>
              <strong>เข้าสู่ระบบ</strong>
              <p className="tt-hint">ดูบทสนทนาจาก API เดิม</p>
            </div>
          </Link>
        </>
      ) : (
        <>
          <ChatSectionHub />

          {!showFiltered && unread.length > 0 ? (
            <ChatConversationList title="Unread" items={unread} />
          ) : null}

          {showFiltered ? (
            hasList ? (
              <ChatConversationList title="ผลการค้นหา / กรอง" items={filtered} />
            ) : (
              <ChatEmpty loggedIn error={error} hasQuery={!!query.trim() || filter !== 'all'} />
            )
          ) : (
            <ChatConversationList
              title="Recent Conversations"
              items={recent}
              emptyLabel="ยังไม่มีบทสนทนาจาก Match · Booking · ร้านค้า"
            />
          )}
        </>
      )}

      <p className="tt-talent-shell-badge">
        Talent OS Unified Chat · deep link SSOT · TOS-8
      </p>
    </div>
  );
}
