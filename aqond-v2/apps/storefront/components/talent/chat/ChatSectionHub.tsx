'use client';

import Link from 'next/link';
import type { TalentChatHub } from '@/lib/talent/talentChatTypes';
import { TALENT_CHAT_HUBS } from '@/lib/talent/talentChatTypes';

type Props = {
  hubs?: TalentChatHub[];
};

export function ChatSectionHub({ hubs = TALENT_CHAT_HUBS }: Props) {
  return (
    <section className="tt-talent-chat-hubs" aria-label="Chat lanes">
      <h3 className="tt-talent-chat-section-title">เปิดแชทตาม SSOT</h3>
      <div className="tt-talent-chat-hub-grid">
        {hubs.map((hub) => (
          <Link key={hub.id} href={hub.href} className="tt-talent-chat-hub-card">
            <span className="tt-talent-chat-hub-icon" aria-hidden>
              {hub.icon}
            </span>
            <strong>{hub.label}</strong>
            <small>{hub.description}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
