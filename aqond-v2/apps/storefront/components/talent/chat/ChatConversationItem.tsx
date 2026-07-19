import Link from 'next/link';
import { TALENT_CHAT_LANE_LABELS } from '@/lib/talent/talentChatTypes';
import type { TalentChatConversation } from '@/lib/talent/talentChatTypes';

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

type Props = {
  conversation: TalentChatConversation;
};

export function ChatConversationItem({ conversation }: Props) {
  return (
    <li className="tt-talent-chat-item">
      <Link href={conversation.href} className="tt-talent-chat-item-link">
        <div className="tt-talent-chat-item-top">
          <span className="tt-talent-chat-item-icon" aria-hidden>
            {conversation.icon}
          </span>
          <div className="tt-talent-chat-item-head">
            <strong className={conversation.unread ? 'is-unread' : ''}>{conversation.title}</strong>
            <span className="tt-talent-chat-item-lane">{TALENT_CHAT_LANE_LABELS[conversation.lane]}</span>
          </div>
          {conversation.unread ? <span className="tt-talent-chat-unread-dot" aria-label="ยังไม่อ่าน" /> : null}
        </div>
        {conversation.preview ? <p className="tt-talent-chat-item-preview">{conversation.preview}</p> : null}
        {conversation.updatedAt ? (
          <time className="tt-talent-chat-item-time" dateTime={conversation.updatedAt}>
            {formatWhen(conversation.updatedAt)}
          </time>
        ) : null}
      </Link>
    </li>
  );
}
